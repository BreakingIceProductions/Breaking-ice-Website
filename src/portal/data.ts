import 'server-only'
import { createHash } from 'node:crypto'
import { createImageUrlBuilder } from '@sanity/image-url'
import { createClient } from 'next-sanity'
import { apiVersion, projectId } from '@/sanity/env'
import { PRE_PORTAL_STAGES } from '@/sanity/portal/office-constants'
import { portalEnv, portalReady } from './config'
import { DEFAULT_PORTAL, SAMPLE_CLIENT, samplePayments, sampleProjects, sampleQuotes } from './samples'
import type { ClientProject, Deliverable, PortalClient, PortalPayment, PortalQuote, PortalSettings, SanityImage, Session } from './types'

export const PORTAL_DATASET = 'portal'

/** Server-only client for the private dataset. Never cached: clients see changes immediately. */
export const portalClient = createClient({
  projectId,
  dataset: PORTAL_DATASET,
  apiVersion,
  token: portalEnv.sanityToken || undefined,
  useCdn: false,
  perspective: 'published',
})

const builder = createImageUrlBuilder({ projectId, dataset: PORTAL_DATASET })
export const portalImage = (img: SanityImage, w: number, h?: number) => {
  if (!img?.asset) return undefined
  const b = builder.image(img).width(w).auto('format')
  return (h ? b.height(h).fit('crop') : b).url()
}

const CLIENT_FIELDS = `_id, organizationName, logo, contacts[]{_key, name, email, role, getsEmails}, producer, driveFolderId, portalPayments, noGst`
const PROJECT_FIELDS = `_id, _updatedAt, title, "slug": slug.current, startDate, pipelineStage, status, dontEmailDelivery,
  "billing": *[_id == "bo-state-" + ^._id][0].invoices[]{kind, status, outstanding}, stage, stageDates, nextStep, summary, coverImage,
  keyDates, links, deliverables, driveFolderId, "client": client->{${CLIENT_FIELDS}},
  "state": *[_id == "portal-state-" + ^._id][0]{ deliverables, deliveredSeenAt, deliveredNotifiedAt, "activity": activity[0...30] }`

/**
 * Everything the server records automatically (email sent, viewed, activity) lives in a
 * separate "portal-state-<project id>" record that nobody edits in the Studio. Publishing an
 * older draft of the project can then never wipe it and cause a repeat email.
 */
export const STATE_FIELDS = [
  'readyVersion', 'readyAt', 'notifiedVersion', 'notifiedAt', 'remindedVersion', 'viewedVersion', 'versionedAt',
  'vimeoThumb', 'vimeoEmbed', 'vimeoLength', 'vimeoVersions', 'vimeoReview', 'vimeoAccess',
] as const
type StateFields = Pick<Deliverable, (typeof STATE_FIELDS)[number]>
type ProjectStateFields = Pick<ClientProject, 'deliveredSeenAt' | 'deliveredNotifiedAt'>
type StateDoc = ProjectStateFields & { _rev: string; deliverables?: (StateFields & { _key: string })[]; activity?: ClientProject['activity'] }
const stateId = (projectId: string) => `portal-state-${projectId}`

async function q<T>(query: string, params: Record<string, unknown> = {}): Promise<T | null> {
  if (!portalReady()) return null
  try {
    return await portalClient.fetch<T>(query, params, { cache: 'no-store' })
  } catch (err) {
    console.error('[portal] query failed', err)
    return null
  }
}

const decorate = (p: ClientProject & { state?: Partial<StateDoc> | null }): ClientProject => {
  const { state, ...rest } = p
  return {
    ...rest,
    stage: Math.min(4, Math.max(1, p.stage || 1)),
    coverUrl: portalImage(p.coverImage, 1200, 750),
    activity: state?.activity ?? p.activity ?? [],
    deliveredSeenAt: state?.deliveredSeenAt ?? undefined,
    deliveredNotifiedAt: state?.deliveredNotifiedAt ?? undefined,
    deliverables: (p.deliverables ?? []).map((d) => {
      const st = state?.deliverables?.find((x) => x._key === d._key)
      const auto = Object.fromEntries(STATE_FIELDS.map((f) => [f, st?.[f]]))
      // Your own thumbnail and length win; Vimeo's fill the gaps.
      return { ...d, ...auto, version: d.version || 1, length: d.length || st?.vimeoLength, thumbUrl: portalImage(d.thumbnail, 480, 270) ?? st?.vimeoThumb }
    }),
  }
}

export async function getPortalSettings(): Promise<typeof DEFAULT_PORTAL> {
  const s = await q<PortalSettings>(`*[_id == "portalSettings"][0]`)
  const merged = { ...DEFAULT_PORTAL }
  if (s) for (const [k, v] of Object.entries(s)) if (v !== null && v !== undefined && v !== '' && !k.startsWith('_')) (merged as Record<string, unknown>)[k] = v
  if (!merged.feedbackSteps?.length) merged.feedbackSteps = DEFAULT_PORTAL.feedbackSteps
  return merged
}

export async function findClientsByEmail(email: string): Promise<PortalClient[]> {
  return (await q<PortalClient[]>(`*[_type == "client" && count(contacts[lower(email) == $email]) > 0]{${CLIENT_FIELDS}}`, { email: email.toLowerCase() })) ?? []
}

/** Everything a signed-in person can see. Access is re-checked on every request, so removing a contact removes access. */
export async function getAccess(session: Session) {
  if (session.demo) return { clients: [SAMPLE_CLIENT], projects: sampleProjects().map(decorate), quotes: sampleQuotes(), payments: samplePayments(), name: 'Alex' }
  const clients = session.preview
    ? ((await q<PortalClient[]>(`*[_type == "client" && _id == $id]{${CLIENT_FIELDS}}`, { id: session.preview })) ?? [])
    : await findClientsByEmail(session.email)
  if (!clients.length) return { clients, projects: [] as ClientProject[], quotes: [] as PortalQuote[], payments: [] as PortalPayment[], name: undefined }
  // Quotes are shown from the moment they're shared, before the project is booked, and stay afterwards.
  const quotes = import('./quotes').then((m) => m.quotesForClients(clients.map((c) => c._id), Boolean(session.preview))).catch((e) => {
    console.error('[portal] quotes query failed', e)
    return [] as PortalQuote[]
  })
  // Only clients who pay in the portal have payments to show.
  const payers = clients.filter((c) => c.portalPayments).map((c) => c._id)
  const payments = import('./payments').then((m) => m.paymentsForClients(payers)).catch((e) => {
    console.error('[portal] payments query failed', e)
    return [] as PortalPayment[]
  })
  const projects =
    (await q<ClientProject[]>(`*[_type == "clientProject" && client._ref in $ids && defined(slug.current) && !(pipelineStage in $hidden)] | order(_updatedAt desc){${PROJECT_FIELDS}}`, {
      ids: clients.map((c) => c._id),
      // A project opens in the portal once it's booked; before that, a shared quote has its own page.
      hidden: PRE_PORTAL_STAGES,
    })) ?? []
  const contact = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)
  // In a preview, the greeting uses the client's first contact, as they'd see it.
  const shown = session.preview ? clients[0].contacts?.[0] : contact
  return { clients, projects: projects.map(decorate), quotes: await quotes, payments: await payments, name: shown?.name?.split(' ')[0] }
}

export async function getProjectForSession(session: Session, slug: string) {
  const access = await getAccess(session)
  const project = access.projects.find((p) => p.slug === slug)
  return project ? { ...access, project } : null
}

/* ── Writes (server only, need an Editor token) ─────────────────────────── */

const key = () => Math.random().toString(36).slice(2, 12)

async function ensureState(projectId: string) {
  await portalClient.createIfNotExists({ _id: stateId(projectId), _type: 'portalState', project: projectId, deliverables: [], activity: [] })
}

export async function addActivity(projectId: string, text: string, kind: string) {
  if (!portalReady() || projectId.startsWith('sample-')) return
  try {
    await ensureState(projectId)
    await portalClient
      .patch(stateId(projectId))
      .setIfMissing({ activity: [] })
      .insert('before', 'activity[0]', [{ _key: key(), _type: 'activityItem', at: new Date().toISOString(), text: text.slice(0, 200), kind }])
      .commit({ autoGenerateArrayKeys: false })
    // Keep the list short.
    await portalClient.patch(stateId(projectId)).unset(['activity[50:]']).commit().catch(() => {})
  } catch (e) {
    console.error('[portal] activity write failed', e)
  }
}

/** Automatic per-deliverable facts (hold started, email sent, viewed…), kept in the state record. */
export async function updateDeliverableState(projectId: string, deliverableKey: string, fields: Partial<StateFields>) {
  await ensureState(projectId)
  const doc = await portalClient.getDocument<StateDoc>(stateId(projectId))
  const exists = doc?.deliverables?.some((d) => d._key === deliverableKey)
  const patch = portalClient.patch(stateId(projectId)).setIfMissing({ deliverables: [] })
  if (!exists) patch.insert('after', 'deliverables[-1]', [{ _key: deliverableKey, ...fields }])
  else {
    const set: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) set[`deliverables[_key=="${deliverableKey}"].${k}`] = v
    patch.set(set)
  }
  await patch.commit({ autoGenerateArrayKeys: false })
}

/** Content you also edit (version number, status): written on the project itself. */
export async function updateDeliverable(projectId: string, deliverableKey: string, fields: Partial<Deliverable>) {
  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) set[`deliverables[_key=="${deliverableKey}"].${k}`] = v
  await portalClient.patch(projectId).set(set).commit()
}

/** Keeps the client's note or approval on the version itself. */
export async function addFeedback(projectId: string, deliverableKey: string, item: { who: string; action: 'approve' | 'changes'; note?: string }) {
  await portalClient
    .patch(projectId)
    .setIfMissing({ [`deliverables[_key=="${deliverableKey}"].feedback`]: [] })
    .append(`deliverables[_key=="${deliverableKey}"].feedback`, [{ _key: key(), _type: 'feedbackItem', at: new Date().toISOString(), ...item }])
    .commit({ autoGenerateArrayKeys: false })
}

/** Project-wide automatic facts (delivery hold and email), kept in the state record. Null clears one. */
export async function setProjectState(projectId: string, fields: { [K in keyof ProjectStateFields]?: string | null }) {
  await ensureState(projectId)
  const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null))
  const unset = Object.keys(fields).filter((k) => fields[k as keyof ProjectStateFields] === null)
  await portalClient.patch(stateId(projectId)).set(set).unset(unset).commit()
}

/** Claims the delivery email, like claimDeliverable: only one run can win. */
export async function claimProjectState(projectId: string, rev: string, fields: ProjectStateFields) {
  try {
    await portalClient.patch(stateId(projectId)).ifRevisionId(rev).set(fields).commit()
    return true
  } catch {
    return false
  }
}

export async function setDriveFolder(docId: string, folderId: string) {
  await portalClient.patch(docId).set({ driveFolderId: folderId }).commit()
}

/** All projects, for the scheduler and webhooks. */
export async function allProjects(filter = 'true') {
  // Leads and quotes aren't in the portal yet, so no emails, folders or webhooks for them either.
  return ((await q<ClientProject[]>(`*[_type == "clientProject" && defined(slug.current) && !(pipelineStage in $hidden) && ${filter}]{${PROJECT_FIELDS}}`, { hidden: PRE_PORTAL_STAGES })) ?? []).map(decorate)
}

export const producerFor = (p: { client: PortalClient }, settings: typeof DEFAULT_PORTAL) =>
  p.client.producer?.name ? p.client.producer : settings.producer

/* ── Sign-in guard: code attempts counted on the server, per email ─────── */
// The device cookie also counts tries, but a cookie can be replayed, so the real limit
// lives here. Every attempt is counted BEFORE the code is checked, in one record per
// address per hour (so there's nothing to reset and nothing to race): 10 tries an hour.
const GUARD_LIMIT = 10
const hourKey = () => new Date().toISOString().slice(0, 13).replace(/\D/g, '')
const guardId = (email: string) => `signin-guard-${createHash('sha256').update(email).digest('hex').slice(0, 40)}-${hourKey()}`

/** Counts this attempt and says whether it's allowed. Fails closed if the count can't be written. */
export async function countSignInAttempt(email: string): Promise<boolean> {
  if (!portalReady()) return false
  try {
    const id = guardId(email)
    await portalClient.createIfNotExists({ _id: id, _type: 'signInGuard', attempts: 0 })
    const doc = await portalClient.patch(id).setIfMissing({ attempts: 0 }).inc({ attempts: 1 }).commit<{ attempts: number }>()
    return doc.attempts <= GUARD_LIMIT
  } catch (e) {
    console.error('[portal] sign-in guard unavailable', e)
    return false
  }
}

/** Old guard records are removed by the scheduler. */
export async function cleanSignInGuards() {
  if (!portalReady()) return
  await portalClient
    .delete({ query: `*[_type == "signInGuard" && _createdAt < $cutoff]`, params: { cutoff: new Date(Date.now() - 86_400_000).toISOString() } })
    .catch(() => {})
}

/** Re-reads a project's state record just before an email goes out, for the claim below. */
export async function freshState(projectId: string) {
  return portalClient.getDocument<StateDoc>(stateId(projectId))
}

/**
 * Claims a deliverable's email before sending: the write only succeeds if nobody changed
 * the state record since we read it, so two overlapping runs can never both send.
 */
export async function claimDeliverable(projectId: string, rev: string, deliverableKey: string, fields: Partial<StateFields>) {
  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) set[`deliverables[_key=="${deliverableKey}"].${k}`] = v
  try {
    await portalClient.patch(stateId(projectId)).ifRevisionId(rev).set(set).commit()
    return true
  } catch {
    return false
  }
}
