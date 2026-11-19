import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { portalEnv } from '@/portal/config'
import { portalClient, STATE_FIELDS } from '@/portal/data'
import { nextVersion, today, type Category } from '@/portal/library'
import type { Deliverable } from '@/portal/types'
import type { PipelineStage } from '@/sanity/portal/office-constants'
import { adminSampleMode } from './config'
import type { SentEmail } from './email-templates-shared'
import { sampleOfficeProjects } from './samples'
import type { InvoiceRecord, LeadDetails, OfficeClient, OfficeProject, OfficeState, TaskRecord } from './types'

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

const FIELDS = `_id, _updatedAt, title, "slug": slug.current, startDate, status, stage, nextStep, deliverables, links, driveFolderId,
  pipelineStage, archived, hiddenFromClient, declinedAt, projectType, region, quoteAmount, depositAmount, quoteUrl, milestones, schedule, crew, retainer,
  "client": client->{_id, organizationName, contacts[]{_key, name, email, role, getsEmails}, billingEmail, driveFolderId, portalPayments, noGst},
  "portalState": *[_id == "portal-state-" + ^._id][0]{ deliverables, "activity": activity[0...20] },
  "reviewOpen": *[_type == "reviewComment" && project._ref == ^._id && !defined(parent) && done != true && author.kind != "admin"]{"k": deliverableKey, "v": version},
  "office": *[_id == "bo-state-" + ^._id][0],
  "quote": *[_id == "quote-" + ^._id][0]{version, fileName, summary, note, includes, options, depositPercent, validUntil, updatedAt, sharedAt, lastSentAt, viewedAt, viewedBy,
    "signature": signature{name, title, email, at, method, option, total, deposit, certificateId}}`

type Raw = Omit<OfficeProject, 'office' | 'activity' | 'milestones' | 'schedule' | 'deliverables' | 'pipelineStage' | 'quote'> & {
  quote?: OfficeProject['quote'] | null
  pipelineStage?: PipelineStage
  milestones?: OfficeProject['milestones']
  schedule?: OfficeProject['schedule']
  deliverables?: Deliverable[]
  portalState?: { deliverables?: (Partial<Deliverable> & { _key: string })[]; activity?: OfficeProject['activity'] } | null
  office?: OfficeState | null
  /** Open review-room comments from the client or guests (one row each). */
  reviewOpen?: { k: string; v: number }[] | null
}

function normalize(p: Raw): OfficeProject {
  const { portalState, office, reviewOpen, ...rest } = p
  return {
    ...rest,
    // Projects from before the back office existed count as booked, unless already delivered.
    pipelineStage: p.pipelineStage ?? (p.status === 'delivered' ? 'delivered' : 'booked'),
    milestones: p.milestones ?? {},
    schedule: (p.schedule ?? []).filter((s) => s?.start && s.title),
    deliverables: (p.deliverables ?? []).map((d) => {
      const st = portalState?.deliverables?.find((x) => x._key === d._key)
      const open = (reviewOpen ?? []).filter((r) => r.k === d._key && r.v === (d.version || 1)).length
      return { ...d, ...Object.fromEntries(STATE_FIELDS.map((f) => [f, st?.[f]])), version: d.version || 1, ...(open ? { openComments: open } : {}) }
    }),
    activity: portalState?.activity ?? [],
    office: office ?? { _id: officeId(p._id) },
    quote: p.quote ?? undefined,
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

/** A client with everything we've done for them. */
export type ClientSummary = OfficeClient & {
  projects: OfficeProject[]
  /** Invoiced through Zoho Books, and what's been paid of it. */
  billed: number
  paid: number
  lastActivity?: string
}

const summarize = (c: OfficeClient, all: OfficeProject[]): ClientSummary => {
  const projects = all.filter((p) => p.client._id === c._id)
  const invoices = projects.flatMap((p) => p.office.invoices ?? []).filter((i) => i.status !== 'voided' && i.status !== 'deleted')
  const stamps = projects.flatMap((p) => [p._updatedAt, ...p.activity.map((a) => a.at), ...(p.office.log ?? []).map((l) => l.at)]).filter(Boolean) as string[]
  return {
    ...c,
    projects,
    billed: invoices.reduce((n, i) => n + (i.amount || 0), 0),
    paid: invoices.reduce((n, i) => n + (i.status === 'paid' ? i.amount || 0 : Math.max(0, (i.amount || 0) - (i.outstanding ?? i.amount ?? 0))), 0),
    lastActivity: stamps.sort().at(-1),
  }
}

/** Every client, including ones with no projects yet, newest work first. */
export async function listClients(): Promise<ClientSummary[]> {
  const projects = await listProjects()
  const clients = adminSampleMode()
    ? [...new Map(projects.map((p) => [p.client._id, p.client])).values()]
    : ((await q<OfficeClient[]>(`*[_type == "client"] | order(organizationName asc){_id, organizationName, contacts[]{_key, name, email, role}, billingEmail, driveFolderId}`)) ?? [])
  return clients.map((c) => summarize(c, projects)).sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
}

export async function getClient(id: string): Promise<ClientSummary | null> {
  return (await listClients()).find((c) => c._id === id) ?? null
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
  // One transaction, so the stage never changes without its history entry (or the other way round).
  await portalClient
    .transaction()
    .patch(p._id, (q) => q.set({ pipelineStage: to }))
    .createIfNotExists({ _id: officeId(p._id), _type: 'boState', project: p._id })
    .patch(officeId(p._id), (q) =>
      q.set({ stageChangedAt: at }).setIfMissing({ stageHistory: [] }).append('stageHistory', [{ _key: key(), at, from: p.pipelineStage, to }]),
    )
    .commit({ autoGenerateArrayKeys: false })
  // A draft open in the Studio would put the old stage back on publish, so it follows too.
  await portalClient.patch(`drafts.${p._id}`).set({ pipelineStage: to }).commit().catch(() => {})
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

/** Lead details on the office record: each field set on its own, and cleared when it comes in empty. */
export async function setLead(projectId: string, patch: Partial<Record<keyof LeadDetails, string>>) {
  if (sample()) return
  const entries = Object.entries(patch)
  const set = Object.fromEntries(entries.filter(([, v]) => v).map(([k, v]) => [`lead.${k}`, v]))
  const unset = entries.filter(([, v]) => !v).map(([k]) => `lead.${k}`)
  if (!entries.length) return
  await ensureOffice(projectId)
  let p = portalClient.patch(officeId(projectId)).setIfMissing({ lead: {} })
  if (Object.keys(set).length) p = p.set(set)
  if (unset.length) p = p.unset(unset)
  await p.commit()
}

const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'project'

export type NewLead = { name: string; email: string; company: string; title: string; projectType?: string; lead: LeadDetails }

/**
 * A new lead from the back office: the client (found by a contact's email, then by organization
 * name, or made new with that one contact), a project in the New lead stage, and its office
 * record, all in one transaction. Nothing is emailed, and no stage steps run.
 *
 * An existing client is never changed: if the person isn't one of its contacts they are kept on
 * the lead only, so adding a lead can't give anyone a look at that client's projects.
 */
export async function createLead(input: NewLead): Promise<{ id: string; clientId: string; newClient: boolean }> {
  const email = input.email.toLowerCase()
  // Drafts count too, so a client or address still being written in the Studio isn't doubled up.
  const raw = { cache: 'no-store' as const, perspective: 'raw' as const }
  const found = await portalClient.fetch<{ _id: string; byEmail: boolean }[]>(
    `*[_type == "client" && (count(contacts[lower(email) == $email]) > 0 || lower(organizationName) == $org)]{_id, "byEmail": count(contacts[lower(email) == $email]) > 0}`,
    { email, org: input.company.toLowerCase() },
    raw,
  )
  const published = found.filter((c) => !c._id.startsWith('drafts.') && !c._id.startsWith('versions.'))
  const existing = published.find((c) => c.byEmail) ?? published[0]
  const clientId = existing?._id ?? `client-${randomBytes(8).toString('hex')}`
  const id = `lead-${randomBytes(8).toString('hex')}`

  const base = slugify(input.title)
  const taken = new Set(await portalClient.fetch<string[]>(`*[_type == "clientProject" && string::startsWith(slug.current, $base)].slug.current`, { base }, raw))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`

  const at = new Date().toISOString()
  const lead = Object.fromEntries(Object.entries({ ...input.lead, name: input.name, email }).filter(([, v]) => v))
  const tx = portalClient.transaction()
  if (!existing) {
    tx.create({
      _id: clientId,
      _type: 'client',
      organizationName: input.company,
      // Being listed lets them sign in to the portal if they ask for a link; nothing is sent to them by this.
      contacts: [{ _key: key(), _type: 'contact', name: input.name, email, getsEmails: true }],
      portalPayments: false,
      noGst: false,
    })
  }
  // The same starting values the Studio gives a new project.
  tx.create({
    _id: id,
    _type: 'clientProject',
    title: input.title,
    slug: { _type: 'slug', current: slug },
    client: { _type: 'reference', _ref: clientId },
    status: 'in-production',
    stage: 1,
    hiddenFromClient: false,
    dontEmailDelivery: false,
    pipelineStage: 'lead',
    archived: false,
    ...(input.projectType && { projectType: input.projectType }),
  })
  tx.create({
    _id: officeId(id),
    _type: 'boState',
    project: id,
    stageChangedAt: at,
    stageHistory: [{ _key: key(), at, to: 'lead' }],
    lead,
    log: [{ _key: key(), at, text: 'Lead added', kind: 'lead' }],
  })
  await tx.commit({ autoGenerateArrayKeys: false })
  return { id, clientId, newClient: !existing }
}

/** The project type lives on the project itself (the board and the Studio read it there). */
export async function setProjectType(projectId: string, projectType: string) {
  if (sample()) return
  const change = (id: string) => (projectType ? portalClient.patch(id).set({ projectType }) : portalClient.patch(id).unset(['projectType']))
  await change(projectId).commit()
  await change(`drafts.${projectId}`).commit().catch(() => {})
}

/** `when.day` logs it for a date (a call written up afterwards) rather than for this moment. */
export async function addLog(projectId: string, text: string, kind = 'office', when?: { at: string; day?: boolean }) {
  try {
    await writeLog(projectId, text, kind, when)
  } catch (e) {
    console.error('[admin] log write failed', e)
  }
}

/** Appends rather than rewriting the list, so two quick dismissals can't drop one. */
export async function dismissReminder(projectId: string, reminder: string) {
  if (sample()) return
  await ensureOffice(projectId)
  await portalClient.patch(officeId(projectId)).setIfMissing({ dismissed: [] }).append('dismissed', [reminder]).commit()
}

/** Like addLog, but a failed write throws: for "Log contact", where the log line is the whole save. */
export async function writeLog(projectId: string, text: string, kind = 'office', when?: { at: string; day?: boolean }) {
  if (sample()) return
  await ensureOffice(projectId)
  await portalClient
    .patch(officeId(projectId))
    .setIfMissing({ log: [] })
    .insert('before', 'log[0]', [{ _key: key(), at: when?.at ?? new Date().toISOString(), text: text.slice(0, 240), kind, ...(when?.day && { day: true }) }])
    .commit({ autoGenerateArrayKeys: false })
  await portalClient.patch(officeId(projectId)).unset(['log[80:]']).commit().catch(() => {})
}

/** A message sent from the composer: kept newest first, the latest 50 only. Throws when the write fails. */
export async function addSentEmail(projectId: string, email: Omit<SentEmail, '_key'>) {
  if (sample()) return
  await ensureOffice(projectId)
  await portalClient
    .patch(officeId(projectId))
    .setIfMissing({ emails: [] })
    .insert('before', 'emails[0]', [{ _key: key(), ...email }])
    .commit({ autoGenerateArrayKeys: false })
  await portalClient.patch(officeId(projectId)).unset(['emails[50:]']).commit().catch(() => {})
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

/* ── Documents & links the client sees on their project ─────────────── */
// Written on the project itself (like versions), so they also show in the Studio.

export async function addLink(projectId: string, link: { title: string; url: string; note?: string }) {
  if (sample()) return
  await portalClient
    .patch(projectId)
    .setIfMissing({ links: [] })
    .append('links', [{ _key: key(), _type: 'projectLink', ...link }])
    .commit({ autoGenerateArrayKeys: false })
}

export async function removeLink(projectId: string, linkKey: string) {
  if (sample()) return
  await portalClient.patch(projectId).unset([`links[_key=="${linkKey}"]`]).commit()
}

/**
 * A new version of a deliverable: version 1 of a new title, or the next number for an
 * existing one. Older versions stay listed and are greyed out for the client automatically.
 */
export async function addVersion(
  projectId: string,
  v: {
    category: Category
    title: string
    shareUrl?: string
    fileUrl?: string
    fileName?: string
    notes?: string
    send: boolean
    /** A review copy uploaded to our storage, under the key chosen when the upload started. */
    r2?: { key: string; r2Key: string; r2Size?: number; durationSec?: number; fps?: number; width?: number; height?: number; version?: number }
  },
) {
  if (sample()) return
  const p = await getProject(projectId)
  if (!p) throw new Error('project not found')
  const next = nextVersion(p.deliverables, v.category, v.title)
  const entry = {
    _key: v.r2?.key ?? key(),
    _type: 'deliverable',
    title: next.title,
    category: v.category,
    version: next.version,
    date: today(),
    status: v.send ? 'awaiting-feedback' : 'in-progress',
    ...(v.shareUrl ? { shareUrl: v.shareUrl } : {}),
    ...(v.fileUrl ? { fileUrl: v.fileUrl, fileName: v.fileName } : {}),
    ...(v.notes ? { notes: v.notes } : {}),
    ...(v.r2?.durationSec ? { length: `${Math.floor(v.r2.durationSec / 60)}:${String(Math.floor(v.r2.durationSec % 60)).padStart(2, '0')}` } : {}),
    ...(v.r2 ? { host: 'r2', r2Key: v.r2.r2Key, r2Size: v.r2.r2Size, durationSec: v.r2.durationSec, fps: v.r2.fps, width: v.r2.width, height: v.r2.height } : {}),
  }
  await portalClient.patch(projectId).setIfMissing({ deliverables: [] }).append('deliverables', [entry]).commit({ autoGenerateArrayKeys: false })
  return entry
}

/** Takes one version off the project (and off a pending Studio draft, so publishing it can't bring the version back). */
export async function removeVersion(projectId: string, versionKey: string) {
  if (sample()) return
  const path = [`deliverables[_key=="${versionKey.replace(/[^\w-]/g, '')}"]`]
  await portalClient.patch(projectId).unset(path).commit()
  await portalClient.patch(`drafts.${projectId}`).unset(path).commit().catch(() => {})
}

/** Josh's switches on one version. */
export async function setVersion(projectId: string, versionKey: string, fields: { clientCanView?: boolean; final?: boolean; status?: Deliverable['status'] }) {
  if (sample()) return
  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) set[`deliverables[_key=="${versionKey}"].${k}`] = v
  if (Object.keys(set).length) await portalClient.patch(projectId).set(set).commit()
}

/* ── Zoho Books customer IDs, one record per client ──────────────────── */

export async function getZohoContactId(clientId: string) {
  if (sample()) return undefined
  return (await q<string | null>(`*[_id == $id][0].zohoContactId`, { id: `bo-client-${clientId}` })) ?? undefined
}

export async function setZohoContactId(clientId: string, zohoContactId: string) {
  if (sample()) return
  await portalClient.createOrReplace({ _id: `bo-client-${clientId}`, _type: 'boClient', client: clientId, zohoContactId })
}

/* ── Connection tokens, encrypted at rest ───────────────────────────── */
// The portal dataset is already private, but tokens are encrypted with PORTAL_SECRET
// on top, so a leaked read token alone can't be used to reach TickTick or Zoho Books.

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

// wisprClient is the app registration Wispr Flow gave us (registered once); wispr is the sign-in.
export type Connection = 'ticktick' | 'zoho' | 'wispr' | 'wisprClient'

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
