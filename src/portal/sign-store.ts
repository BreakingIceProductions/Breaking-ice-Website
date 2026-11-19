import 'server-only'
import { randomBytes } from 'node:crypto'
import { portalReady } from './config'
import { portalClient } from './data'
import { seedTemplates, MEDIA_RELEASE_BODY, MEDIA_RELEASE_FIELDS } from './doc-seeds'
import { assetBytes, uploadAsset } from './quotes'
import type { DocField, DocTemplate, SignRecord, SignRequest, SignStatus } from './sign-docs'

/**
 * Where templates ("docTemplate") and sign requests ("signRequest") are kept: the private
 * "portal" dataset. Without a database token (local development) everything lives in memory
 * for as long as the dev server runs, so the screens can be tried without saving anything.
 */

export const memoryMode = () => !portalReady()

type Pair = { _key: string; key: string; value: string }
const toPairs = (v: Record<string, string>): Pair[] => Object.entries(v).filter(([, x]) => x !== undefined && x !== '').map(([key, value]) => ({ _key: key, key, value: String(value) }))
const fromPairs = (p?: Pair[] | null) => Object.fromEntries((p ?? []).map((x) => [x.key, x.value]))

/* ── Memory (sample mode) ─────────────────────────────────────────────── */

type Mem = { templates: Map<string, DocTemplate>; requests: Map<string, SignRequest & { _rev?: string }>; pdfs: Map<string, Uint8Array> }
const g = globalThis as typeof globalThis & { __biSign?: Mem }

function mem(): Mem {
  if (!g.__biSign) {
    const at = new Date().toISOString()
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    g.__biSign = { templates: new Map(seedTemplates(at).map((t) => [t._id, t])), requests: new Map(), pdfs: new Map() }
    // Two requests already out, so the lists and counts have something to show.
    const seed: SignRequest[] = [
      {
        _id: 'sign-sample-portal',
        templateId: 'sample',
        kind: 'delivery-signoff',
        audience: 'client',
        snapshot: {
          title: 'Delivery sign-off (sample)',
          body: 'This is a sample document for trying out signing in the portal. Real documents show the wording pasted in the Library.\n\nProject: {{project}}',
          fields: [],
        },
        projectId: 'sample-p1',
        projectTitle: 'Community voices film',
        projectSlug: 'sample-community-voices',
        clientId: 'sample-client',
        org: 'Sample Development Corporation',
        recipient: { name: 'Alex Sample', email: 'alex@example.com', contactKey: 'c1' },
        values: { project: 'Community voices film', client: 'Sample Development Corporation' },
        token: 'sample-portal-token-not-for-real-use-000000',
        status: 'out',
        createdAt: ago(2),
      },
      {
        _id: 'sign-sample-release',
        templateId: 'doc-template-media-release',
        kind: 'media-release',
        audience: 'person',
        snapshot: { title: 'Media release', body: MEDIA_RELEASE_BODY, fields: MEDIA_RELEASE_FIELDS },
        projectId: 'sample-closure',
        projectTitle: 'Closure video series',
        clientId: 'sample-imperial',
        org: 'Imperial',
        recipient: { name: '[Participant]', email: 'participant@example.com' },
        values: { event: 'the sample shoot', parties: 'Breaking Ice Productions', project: 'Closure video series' },
        token: 'sample-release-token-not-for-real-use-00000',
        status: 'viewed',
        createdAt: ago(4),
        viewedAt: ago(3),
      },
    ]
    for (const r of seed) g.__biSign.requests.set(r._id, r)
  }
  return g.__biSign
}

/* ── Templates ────────────────────────────────────────────────────────── */

type RawTemplate = Omit<DocTemplate, 'fields'> & { fields?: DocField[] | null }
const normTemplate = (t: RawTemplate): DocTemplate => ({ ...t, body: t.body ?? '', fields: (t.fields ?? []).map(({ ...f }) => f), wordingApproved: Boolean(t.wordingApproved) })

/** All templates. The first visit makes any that are missing (never overwrites one). */
export async function listTemplates(): Promise<DocTemplate[]> {
  if (memoryMode()) return [...mem().templates.values()]
  const rows = await portalClient.fetch<RawTemplate[]>(`*[_type == "docTemplate"]{_id, kind, title, audience, body, fields, wordingApproved, updatedAt}`, {}, { cache: 'no-store' })
  const missing = seedTemplates().filter((s) => !rows.some((r) => r._id === s._id))
  if (missing.length) {
    const tx = portalClient.transaction()
    for (const s of missing) tx.createIfNotExists({ _type: 'docTemplate', ...s, fields: s.fields.map((f) => ({ _type: 'docField', ...f })) })
    await tx.commit({ autoGenerateArrayKeys: false })
    rows.push(...missing)
  }
  return rows.map(normTemplate)
}

export async function getTemplate(id: string) {
  if (memoryMode()) return mem().templates.get(id) ?? null
  const t = await portalClient.getDocument<RawTemplate>(id)
  return t && (t as { _type?: string })._type === 'docTemplate' ? normTemplate(t) : null
}

/** Saves an edit. Any change to the wording or fill-ins puts it back to "Needs your check". */
export async function saveTemplate(id: string, patch: Pick<DocTemplate, 'title' | 'audience' | 'body' | 'fields'>) {
  const cur = await getTemplate(id)
  if (!cur) return null
  const changed = cur.body !== patch.body || JSON.stringify(cur.fields) !== JSON.stringify(patch.fields)
  const next: DocTemplate = { ...cur, ...patch, wordingApproved: changed ? false : cur.wordingApproved, updatedAt: new Date().toISOString() }
  if (memoryMode()) mem().templates.set(id, next)
  else
    await portalClient
      .patch(id)
      .set({ title: next.title, audience: next.audience, body: next.body, fields: next.fields.map((f) => ({ _type: 'docField', ...f })), wordingApproved: next.wordingApproved, updatedAt: next.updatedAt })
      .commit({ autoGenerateArrayKeys: false })
  return next
}

export async function setApproved(id: string, approved: boolean) {
  const cur = await getTemplate(id)
  if (!cur) return null
  const next = { ...cur, wordingApproved: approved }
  if (memoryMode()) mem().templates.set(id, next)
  else await portalClient.patch(id).set({ wordingApproved: approved }).commit()
  return next
}

/* ── Requests ─────────────────────────────────────────────────────────── */

type RawRequest = Omit<SignRequest, 'values' | 'signature'> & {
  _rev?: string
  values?: Pair[]
  signature?: (Omit<SignRecord, 'values' | 'pdfRef'> & { values?: Pair[]; pdf?: { asset?: { _ref: string } } }) | null
}

const normRequest = (r: RawRequest): SignRequest & { _rev?: string } => ({
  ...r,
  snapshot: { ...r.snapshot, fields: r.snapshot?.fields ?? [] },
  values: fromPairs(r.values),
  signature: r.signature ? { ...r.signature, values: fromPairs(r.signature.values), pdfRef: r.signature.pdf?.asset?._ref } : undefined,
})

const REQUEST_FIELDS = `_id, _rev, templateId, kind, audience, snapshot, projectId, projectTitle, projectSlug, clientId, org, recipient, values, token, status, createdAt, emailedAt, viewedAt, signedAt, voidedAt, signature`

/** Every request, newest first. Filter by project or client. */
export async function listRequests(filter: { projectId?: string; clientIds?: string[] } = {}): Promise<SignRequest[]> {
  if (memoryMode()) {
    return [...mem().requests.values()]
      .filter((r) => (!filter.projectId || r.projectId === filter.projectId) && (!filter.clientIds || (r.clientId && filter.clientIds.includes(r.clientId))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  try {
    const rows = await portalClient.fetch<RawRequest[]>(
      `*[_type == "signRequest" && (!defined($p) || projectId == $p) && (!defined($c) || clientId in $c)] | order(createdAt desc){${REQUEST_FIELDS}}`,
      { p: filter.projectId ?? null, c: filter.clientIds ?? null },
      { cache: 'no-store' },
    )
    return rows.map(normRequest)
  } catch (e) {
    console.error('[sign] requests query failed', e)
    return []
  }
}

export async function getRequest(id: string) {
  if (memoryMode()) return mem().requests.get(id) ?? null
  const r = await portalClient.fetch<RawRequest | null>(`*[_type == "signRequest" && _id == $id][0]{${REQUEST_FIELDS}}`, { id }, { cache: 'no-store' })
  return r ? normRequest(r) : null
}

/** Tokens are long and random; anything that doesn't look like one is refused before a lookup. */
export const tokenShape = (t: string) => /^[A-Za-z0-9_-]{32,80}$/.test(t)

export async function findByToken(token: string) {
  if (!tokenShape(token)) return null
  if (memoryMode()) return [...mem().requests.values()].find((r) => r.token === token) ?? null
  const r = await portalClient.fetch<RawRequest | null>(`*[_type == "signRequest" && token == $t][0]{${REQUEST_FIELDS}}`, { t: token }, { cache: 'no-store' })
  return r ? normRequest(r) : null
}

export async function createRequest(r: Omit<SignRequest, '_id' | 'token' | 'status' | 'createdAt'>) {
  const req: SignRequest = { ...r, _id: `sign-${randomBytes(8).toString('hex')}`, token: randomBytes(32).toString('base64url'), status: 'out', createdAt: new Date().toISOString() }
  if (memoryMode()) mem().requests.set(req._id, req)
  else
    await portalClient.create(
      { _type: 'signRequest', ...req, snapshot: { ...req.snapshot, fields: req.snapshot.fields.map((f) => ({ _type: 'docField', ...f })) }, values: toPairs(req.values) },
      { autoGenerateArrayKeys: false },
    )
  return req
}

async function setFields(id: string, fields: Partial<Record<keyof SignRequest, unknown>>) {
  if (memoryMode()) {
    const cur = mem().requests.get(id)
    if (cur) mem().requests.set(id, { ...cur, ...(fields as Partial<SignRequest>) })
    return
  }
  await portalClient.patch(id).set(fields).commit()
}

/** The first time the signer opens it. Only the first view is kept. */
export async function markViewed(r: SignRequest) {
  if (r.viewedAt || r.status !== 'out') return
  const at = new Date().toISOString()
  if (memoryMode()) return setFields(r._id, { viewedAt: at, status: 'viewed' })
  await portalClient.patch(r._id).setIfMissing({ viewedAt: at }).set({ status: 'viewed' }).commit().catch((e) => console.error('[sign] view not recorded', e))
}

export const markEmailed = (id: string) => setFields(id, { emailedAt: new Date().toISOString() })

export async function voidRequest(id: string) {
  const r = await getRequest(id)
  if (!r || r.status === 'signed') return null
  await setFields(id, { status: 'void' satisfies SignStatus, voidedAt: new Date().toISOString() })
  return r
}

/** Records the signature, only if nobody signed or withdrew it since it was read. */
export async function completeSignature(r: SignRequest & { _rev?: string }, record: SignRecord, pdf: Uint8Array, filename: string) {
  if (memoryMode()) {
    const cur = mem().requests.get(r._id)
    if (!cur || cur.status === 'signed' || cur.status === 'void') return false
    mem().pdfs.set(r._id, pdf)
    mem().requests.set(r._id, { ...cur, status: 'signed', signedAt: record.at, signature: { ...record, pdfRef: `memory:${r._id}` } })
    return true
  }
  const file = await uploadAsset('file', pdf, filename, 'application/pdf')
  const { values, pdfRef: _p, ...rest } = record
  try {
    let patch = portalClient.patch(r._id)
    if (r._rev) patch = patch.ifRevisionId(r._rev)
    await patch.set({ status: 'signed', signedAt: record.at, signature: { ...rest, values: toPairs(values), pdf: file } }).commit({ autoGenerateArrayKeys: false })
    return true
  } catch {
    return false
  }
}

export const setDriveFile = (id: string, driveFileId: string) =>
  memoryMode()
    ? (() => {
        const cur = mem().requests.get(id)
        if (cur?.signature) mem().requests.set(id, { ...cur, signature: { ...cur.signature, driveFileId } })
      })()
    : portalClient.patch(id).set({ 'signature.driveFileId': driveFileId }).commit().then(() => undefined)

/** The signed PDF's bytes. */
export async function signedPdf(r: SignRequest) {
  const ref = r.signature?.pdfRef
  if (!ref) return null
  if (ref.startsWith('memory:')) return mem().pdfs.get(r._id) ?? null
  return assetBytes(ref)
}

/** A file name for the signed copy: "Media release – Jane Doe – signed.pdf". */
export const signedName = (r: SignRequest) => `${r.snapshot.title} – ${r.signature?.name ?? r.recipient.name} – signed.pdf`.replace(/[\\/:*?"<>|]/g, '-')
