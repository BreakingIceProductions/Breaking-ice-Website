import 'server-only'
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
  keyDates, deliverables, frameioProjectUrl, driveFolderId, activity[0...30], "client": client->{${CLIENT_FIELDS}}`

async function q<T>(query: string, params: Record<string, unknown> = {}): Promise<T | null> {
  if (!portalReady()) return null
  try {
    return await portalClient.fetch<T>(query, params, { cache: 'no-store' })
  } catch (err) {
    console.error('[portal] query failed', err)
    return null
  }
}

const decorate = (p: ClientProject): ClientProject => ({
  ...p,
  stage: Math.min(4, Math.max(1, p.stage || 1)),
  coverUrl: portalImage(p.coverImage, 1200, 750),
  deliverables: (p.deliverables ?? []).map((d) => ({ ...d, version: d.version || 1, thumbUrl: portalImage(d.thumbnail, 480, 270) })),
})

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

export async function addActivity(projectId: string, text: string, kind: string) {
  if (!portalReady() || projectId.startsWith('sample-')) return
  await portalClient
    .patch(projectId)
    .setIfMissing({ activity: [] })
    .insert('before', 'activity[0]', [{ _key: key(), _type: 'activityItem', at: new Date().toISOString(), text: text.slice(0, 200), kind }])
    .commit({ autoGenerateArrayKeys: false })
    .catch((e) => console.error('[portal] activity write failed', e))
  // Keep the list short.
  await portalClient.patch(projectId).unset(['activity[50:]']).commit().catch(() => {})
}

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
