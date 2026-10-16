import 'server-only'
import { createHash } from 'node:crypto'
import { createImageUrlBuilder } from '@sanity/image-url'
import { createClient } from 'next-sanity'
import { apiVersion, projectId } from '@/sanity/env'
import { portalEnv, portalReady } from './config'
import { DEFAULT_PORTAL, SAMPLE_CLIENT, sampleProjects } from './samples'
import type { ClientProject, Deliverable, PortalClient, PortalSettings, SanityImage, Session } from './types'

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

const CLIENT_FIELDS = `_id, organizationName, logo, contacts[]{_key, name, email, role, getsEmails}, producer, driveFolderId`
const PROJECT_FIELDS = `_id, _updatedAt, title, "slug": slug.current, status, stage, stageDates, nextStep, summary, coverImage,
  keyDates, deliverables, frameioProjectUrl, driveFolderId, "client": client->{${CLIENT_FIELDS}},
  "state": *[_id == "portal-state-" + ^._id][0]{ deliverables, "activity": activity[0...30] }`

/**
 * Everything the server records automatically (email sent, viewed, activity) lives in a
 * separate "portal-state-<project id>" record that nobody edits in the Studio. Publishing an
 * older draft of the project can then never wipe it and cause a repeat email.
 */
export const STATE_FIELDS = ['readyVersion', 'readyAt', 'notifiedVersion', 'notifiedAt', 'remindedVersion', 'viewedVersion', 'versionedAt'] as const
type StateFields = Pick<Deliverable, (typeof STATE_FIELDS)[number]>
type StateDoc = { _rev: string; deliverables?: (StateFields & { _key: string })[]; activity?: ClientProject['activity'] }
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
    deliverables: (p.deliverables ?? []).map((d) => {
      const st = state?.deliverables?.find((x) => x._key === d._key)
      const auto = Object.fromEntries(STATE_FIELDS.map((f) => [f, st?.[f]]))
      return { ...d, ...auto, version: d.version || 1, thumbUrl: portalImage(d.thumbnail, 480, 270) }
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
  if (session.demo) return { clients: [SAMPLE_CLIENT], projects: sampleProjects().map(decorate), name: 'Alex' }
  const clients = await findClientsByEmail(session.email)
  if (!clients.length) return { clients, projects: [] as ClientProject[], name: undefined }
  const projects =
    (await q<ClientProject[]>(`*[_type == "clientProject" && client._ref in $ids && defined(slug.current)] | order(_updatedAt desc){${PROJECT_FIELDS}}`, {
      ids: clients.map((c) => c._id),
    })) ?? []
  const contact = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)
  return { clients, projects: projects.map(decorate), name: contact?.name?.split(' ')[0] }
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

export async function setDriveFolder(docId: string, folderId: string) {
  await portalClient.patch(docId).set({ driveFolderId: folderId }).commit()
}

/** All projects, for the scheduler and webhooks. */
export async function allProjects(filter = 'true') {
  return ((await q<ClientProject[]>(`*[_type == "clientProject" && defined(slug.current) && ${filter}]{${PROJECT_FIELDS}}`)) ?? []).map(decorate)
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
