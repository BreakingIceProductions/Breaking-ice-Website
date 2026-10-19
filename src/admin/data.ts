import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { portalEnv } from '@/portal/config'
import { portalClient, STATE_FIELDS } from '@/portal/data'
import type { Deliverable } from '@/portal/types'
import type { PipelineStage } from '@/sanity/portal/office-constants'
import { adminSampleMode } from './config'
import { sampleOfficeProjects } from './samples'
import type { InvoiceRecord, OfficeProject, OfficeState, TaskRecord } from './types'

/**
 * Back-office reads and writes, all in the private "portal" dataset.
 *
 * Like the portal, anything the server records automatically (stage history,
 * TickTick and Calendar IDs, invoices, notes) lives in its own record,
 * "bo-state-<project id>", never on the project you edit in the Studio. So
 * publishing an old draft can never make the app forget what it already did
 * and do it twice.
 */

const officeId = (projectId: string) => `bo-state-${projectId}`
const key = () => randomBytes(6).toString('hex')

const FIELDS = `_id, _updatedAt, title, "slug": slug.current, status, stage, nextStep, deliverables, frameioProjectUrl, driveFolderId,
  pipelineStage, projectType, region, quoteAmount, depositAmount, quoteUrl, milestones, schedule, crew, retainer,
  "client": client->{_id, organizationName, contacts[]{_key, name, email, role}, billingEmail, driveFolderId},
  "portalState": *[_id == "portal-state-" + ^._id][0]{ deliverables, "activity": activity[0...20] },
  "office": *[_id == "bo-state-" + ^._id][0]`

type Raw = Omit<OfficeProject, 'office' | 'activity' | 'milestones' | 'schedule' | 'deliverables' | 'pipelineStage'> & {
  pipelineStage?: PipelineStage
  milestones?: OfficeProject['milestones']
  schedule?: OfficeProject['schedule']
  deliverables?: Deliverable[]
  portalState?: { deliverables?: (Partial<Deliverable> & { _key: string })[]; activity?: OfficeProject['activity'] } | null
  office?: OfficeState | null
}

function normalize(p: Raw): OfficeProject {
  const { portalState, office, ...rest } = p
  return {
    ...rest,
    // Projects from before the back office existed count as booked, unless already delivered.
    pipelineStage: p.pipelineStage ?? (p.status === 'delivered' ? 'delivered' : 'booked'),
    milestones: p.milestones ?? {},
    schedule: (p.schedule ?? []).filter((s) => s?.start && s.title),
    deliverables: (p.deliverables ?? []).map((d) => {
      const st = portalState?.deliverables?.find((x) => x._key === d._key)
      return { ...d, ...Object.fromEntries(STATE_FIELDS.map((f) => [f, st?.[f]])), version: d.version || 1 }
    }),
    activity: portalState?.activity ?? [],
    office: office ?? { _id: officeId(p._id) },
    client: p.client ?? { _id: '', organizationName: 'No client' },
  }
}

async function q<T>(query: string, params: Record<string, unknown> = {}): Promise<T | null> {
  try {
    return await portalClient.fetch<T>(query, params, { cache: 'no-store' })
  } catch (e) {
    console.error('[admin] query failed', e)
    return null
  }
}

export async function listProjects(): Promise<OfficeProject[]> {
  if (adminSampleMode()) return sampleOfficeProjects()
  const rows = await q<Raw[]>(`*[_type == "clientProject"] | order(_updatedAt desc){${FIELDS}}`)
  return (rows ?? []).map(normalize)
}

export async function getProject(id: string): Promise<OfficeProject | null> {
  if (adminSampleMode()) return sampleOfficeProjects().find((p) => p._id === id) ?? null
  const row = await q<Raw>(`*[_type == "clientProject" && _id == $id][0]{${FIELDS}}`, { id })
  return row ? normalize(row) : null
}

/* ── Writes ─────────────────────────────────────────────────────────── */

const sample = () => adminSampleMode()

async function ensureOffice(projectId: string) {
  await portalClient.createIfNotExists({ _id: officeId(projectId), _type: 'boState', project: projectId })
}

/** Sets the stage on the project and records the move. */
export async function setPipelineStage(p: OfficeProject, to: PipelineStage) {
  if (sample()) return
  const at = new Date().toISOString()
  await portalClient.patch(p._id).set({ pipelineStage: to }).commit()
  // A draft open in the Studio would put the old stage back on publish, so it follows too.
  await portalClient.patch(`drafts.${p._id}`).set({ pipelineStage: to }).commit().catch(() => {})
  await ensureOffice(p._id)
  await portalClient
    .patch(officeId(p._id))
    .set({ stageChangedAt: at })
    .setIfMissing({ stageHistory: [] })
    .append('stageHistory', [{ _key: key(), at, from: p.pipelineStage, to }])
    .commit({ autoGenerateArrayKeys: false })
}

/** Portal-facing status and the 1–4 process stage, written to the project itself. */
export async function setPortalStatus(p: OfficeProject, fields: { status?: string; stage?: number }) {
  if (sample()) return
  await portalClient.patch(p._id).set(fields).commit()
  await portalClient.patch(`drafts.${p._id}`).set(fields).commit().catch(() => {})
}

export async function setOffice(projectId: string, fields: Partial<OfficeState>) {
  if (sample()) return
  await ensureOffice(projectId)
  await portalClient.patch(officeId(projectId)).set(fields).commit()
}

export async function addTaskRecords(projectId: string, tasks: Omit<TaskRecord, '_key'>[]) {
  if (sample() || !tasks.length) return
  await ensureOffice(projectId)
  await portalClient
    .patch(officeId(projectId))
    .setIfMissing({ tasks: [] })
    .append('tasks', tasks.map((t) => ({ _key: key(), ...t })))
    .commit({ autoGenerateArrayKeys: false })
}

export async function updateTaskDue(projectId: string, recordKey: string, due: string) {
  if (sample()) return
  await portalClient.patch(officeId(projectId)).set({ [`tasks[_key=="${recordKey}"].due`]: due }).commit()
}

export async function setCalendarRecord(projectId: string, sourceKey: string, eventId: string, hash: string, existed: boolean) {
  if (sample()) return
  await ensureOffice(projectId)
  const patch = portalClient.patch(officeId(projectId)).setIfMissing({ calendar: [] })
  if (existed) patch.set({ [`calendar[_key=="${sourceKey}"]`]: { _key: sourceKey, eventId, hash } })
  else patch.append('calendar', [{ _key: sourceKey, eventId, hash }])
  await patch.commit({ autoGenerateArrayKeys: false })
}

export async function removeCalendarRecord(projectId: string, sourceKey: string) {
  if (sample()) return
  await portalClient.patch(officeId(projectId)).unset([`calendar[_key=="${sourceKey}"]`]).commit()
}

export async function addInvoiceRecord(projectId: string, inv: Omit<InvoiceRecord, '_key'>) {
  if (sample()) return
  await ensureOffice(projectId)
  await portalClient
    .patch(officeId(projectId))
    .setIfMissing({ invoices: [] })
    .append('invoices', [{ _key: key(), ...inv }])
    .commit({ autoGenerateArrayKeys: false })
}

export async function updateInvoiceRecord(projectId: string, recordKey: string, fields: Partial<InvoiceRecord>) {
  if (sample()) return
  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) set[`invoices[_key=="${recordKey}"].${k}`] = v
  await portalClient.patch(officeId(projectId)).set(set).commit()
}

export async function addLog(projectId: string, text: string, kind = 'office') {
  if (sample()) return
  try {
    await ensureOffice(projectId)
    await portalClient
      .patch(officeId(projectId))
      .setIfMissing({ log: [] })
      .insert('before', 'log[0]', [{ _key: key(), at: new Date().toISOString(), text: text.slice(0, 240), kind }])
      .commit({ autoGenerateArrayKeys: false })
    await portalClient.patch(officeId(projectId)).unset(['log[80:]']).commit().catch(() => {})
  } catch (e) {
    console.error('[admin] log write failed', e)
  }
}

export async function addNote(projectId: string, text: string) {
  if (sample()) return
  await ensureOffice(projectId)
  await portalClient
    .patch(officeId(projectId))
    .setIfMissing({ notes: [] })
    .insert('before', 'notes[0]', [{ _key: key(), at: new Date().toISOString(), text: text.slice(0, 4000) }])
    .commit({ autoGenerateArrayKeys: false })
}

/* ── Xero contact IDs, one record per client ─────────────────────────── */

export async function getXeroContactId(clientId: string) {
  if (sample()) return undefined
  return (await q<string | null>(`*[_id == $id][0].xeroContactId`, { id: `bo-client-${clientId}` })) ?? undefined
}

export async function setXeroContactId(clientId: string, xeroContactId: string) {
  if (sample()) return
  await portalClient.createOrReplace({ _id: `bo-client-${clientId}`, _type: 'boClient', client: clientId, xeroContactId })
}

/* ── Connection tokens, encrypted at rest ───────────────────────────── */
// The portal dataset is already private, but tokens are encrypted with PORTAL_SECRET
// on top, so a leaked read token alone can't be used to reach TickTick or Xero.

const SECRETS_ID = 'bo-secrets'
const cryptoKey = () => createHash('sha256').update(`bo-tokens|${portalEnv.secret}`).digest()

function seal(value: unknown) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', cryptoKey(), iv)
  const body = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

function open<T>(sealed?: string): T | null {
  if (!sealed) return null
  try {
    const [iv, tag, body] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'))
    const d = createDecipheriv('aes-256-gcm', cryptoKey(), iv, { authTagLength: 16 })
    d.setAuthTag(tag)
    return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8')) as T
  } catch {
    return null
  }
}

export type Connection = 'ticktick' | 'xero'

export async function getConnection<T>(name: Connection): Promise<T | null> {
  if (sample() || !portalEnv.secret) return null
  const doc = await q<Partial<Record<Connection, string>> | null>(`*[_id == $id][0]`, { id: SECRETS_ID })
  return open<T>(doc?.[name])
}

export async function saveConnection(name: Connection, value: unknown | null) {
  if (!portalEnv.secret) throw new Error('PORTAL_SECRET is not set, so tokens can’t be stored safely')
  await portalClient.createIfNotExists({ _id: SECRETS_ID, _type: 'boSecrets' })
  if (value === null) await portalClient.patch(SECRETS_ID).unset([name]).commit()
  else await portalClient.patch(SECRETS_ID).set({ [name]: seal(value) }).commit()
}
