import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { SITE_URL } from '@/lib/site'
import { portalEnv, portalReady } from './config'
import { addActivity, claimDeliverable, freshState, getProjectById, portalClient, updateDeliverableState } from './data'
import { notifyJosh, sendEmail } from './email'
import { ipOf, limited, projectAccess, whoIs } from './http'
import { clientCanOpen, versionLabel } from './library'
import { presignGet, r2Ready } from './r2'
import { sampleProjects } from './samples'
import type { Deliverable, ReviewComment, ReviewShape } from './types'

/**
 * The review room's server side: who is looking, what they may do, and the comments.
 *
 *  Portal contact  signed in to the portal, and the version is one their client can open.
 *  Owner           signed in to the back office (view-only accounts can watch, not write).
 *  Guest           holds a switched-on share link for this one version, and gives a name.
 *
 * Comments are their own documents (_type reviewComment) in the portal dataset. Sample
 * projects (local development, or the portal's sample preview) never touch the database:
 * they show a few made-up comments, and anything posted only lives in that browser tab.
 */

export const SAMPLE_SHARE_TOKEN = 'sample-share-link-for-the-review-room'
export const SAMPLE_VIDEO = '/samples/review-sample.mp4'
const EDIT_WINDOW = 15 * 60_000
const NOTIFY_GAP = 10 * 60_000
const COLORS = ['#e5484d', '#f5a524', '#30a46c', '#3e8ef7', '#ffffff']
const MAX_SHAPES = 12
const MAX_POINTS = 240

export type Via = 'portal' | 'share' | 'admin'

export type Viewer = {
  kind: 'client' | 'guest' | 'admin'
  name: string
  email?: string
  /** Hash of the guest's random browser id, so they can edit their own notes. */
  guestKey?: string
  canComment: boolean
  /** Approve / Request changes: portal contacts only. */
  canDecide: boolean
  /** Rate-limit key. */
  who: string
}

export type ReviewTarget = {
  projectId: string
  slug?: string
  projectTitle: string
  org: string
  d: Deliverable
  all: Deliverable[]
  /** Nothing is read from or written to the database. */
  sample: boolean
}

const hash = (s: string) => createHash('sha256').update(`review|${s}`).digest('hex').slice(0, 32)
const cleanName = (s: unknown) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
const firstName = (email: string) => email.split('@')[0].split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase())
const isSampleProject = (id: string) => id.startsWith('sample-') || !portalReady()

/** A share token is random and long; anything else is refused before any lookup. */
export const tokenShape = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(t)
export const newShareToken = () => randomBytes(18).toString('base64url')

/** Finds the version a share link opens. Off links, and links replaced by a new one, find nothing. */
export async function findShare(token: string): Promise<ReviewTarget | null> {
  if (!tokenShape(token)) return null
  if (token === SAMPLE_SHARE_TOKEN) {
    if (portalReady() && !portalEnv.demo) return null
    const p = sampleProjects()[0]
    const d = p.deliverables?.find((x) => x.host === 'r2')
    return d ? { projectId: p._id, slug: p.slug, projectTitle: p.title, org: p.client.organizationName, d, all: p.deliverables ?? [], sample: true } : null
  }
  if (!portalReady()) return null
  const hit = await portalClient
    .fetch<{ project?: string } | null>(`*[_type == "portalState" && count(deliverables[share.token == $t && share.on == true]) > 0][0]{project}`, { t: token }, { cache: 'no-store' })
    .catch(() => null)
  if (!hit?.project) return null
  const p = await getProjectById(hit.project)
  const d = p?.deliverables?.find((x) => x.share?.token === token && x.share.on)
  if (!p || !d) return null
  return { projectId: p._id, slug: p.slug, projectTitle: p.title, org: p.client.organizationName, d, all: p.deliverables ?? [], sample: false }
}

export type ReviewParams = { via?: unknown; project?: unknown; key?: unknown; token?: unknown; guestName?: unknown; guestId?: unknown }

/** Who is asking, and the version they may see. Null means not found / not allowed (always the same answer). */
export async function resolveReview(req: Request, p: ReviewParams): Promise<{ viewer: Viewer; target: ReviewTarget } | null> {
  const key = typeof p.key === 'string' ? p.key : ''
  if (p.via === 'admin') {
    const admin = await adminFromRequest(req)
    if (!admin || typeof p.project !== 'string') return null
    const proj = await getProject(p.project)
    const d = proj?.deliverables.find((x) => x._key === key)
    if (!proj || !d) return null
    return {
      viewer: { kind: 'admin', name: firstName(admin.email), email: admin.email, canComment: !admin.viewOnly, canDecide: false, who: `admin:${admin.email}` },
      target: { projectId: proj._id, slug: proj.slug, projectTitle: proj.title, org: proj.client.organizationName, d, all: proj.deliverables, sample: Boolean(admin.sample) || isSampleProject(proj._id) },
    }
  }
  if (p.via === 'portal') {
    const a = await projectAccess(typeof p.project === 'string' ? p.project : null)
    const d = a?.project.deliverables?.find((x) => x._key === key)
    if (!a || !d || !clientCanOpen(d, a.project.deliverables)) return null
    // "View as client" from the back office shows exactly what they see, and changes nothing.
    const preview = Boolean(a.session.preview)
    return {
      viewer: { kind: 'client', name: whoIs(a), email: a.session.email, canComment: !preview, canDecide: !preview, who: `client:${a.session.email}` },
      target: { projectId: a.project._id, slug: a.project.slug, projectTitle: a.project.title, org: a.project.client.organizationName, d, all: a.project.deliverables ?? [], sample: Boolean(a.session.demo) || isSampleProject(a.project._id) },
    }
  }
  if (p.via === 'share') {
    if (!tokenShape(p.token)) return null
    const target = await findShare(p.token)
    if (!target) return null
    const name = cleanName(p.guestName)
    const id = typeof p.guestId === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(p.guestId) ? p.guestId : ''
    return {
      viewer: { kind: 'guest', name: name || 'Guest', guestKey: id ? hash(id) : undefined, canComment: Boolean(name && id), canDecide: false, who: `guest:${p.token}:${ipOf(req)}` },
      target,
    }
  }
  return null
}

/** A short-lived address for the review copy. The sample clip is a plain file. */
export function playUrl(t: ReviewTarget, download?: string) {
  const k = t.d.r2Key
  if (!k || t.d.host !== 'r2') return null
  if (k.startsWith('sample/')) return SAMPLE_VIDEO
  if (!r2Ready()) return null
  return presignGet(k, { expires: 2 * 3600, download })
}

/* ── Comments ──────────────────────────────────────────────────────────── */

type Stored = Omit<ReviewComment, 'mine' | 'drawing' | 'author'> & {
  author: { kind: Viewer['kind']; name: string; email?: string; key?: string }
  drawing?: { _key?: string; type: ReviewShape['type']; color: string; points: number[] }[]
}

const FIELDS = `_id, deliverableKey, version, t, tOut, text, author, parent, done, doneBy, doneAt, drawing, createdAt, editedAt`

const isMine = (c: Stored, v: Viewer) =>
  c.author.kind === v.kind &&
  (v.kind === 'admin' ? true : v.kind === 'client' ? Boolean(v.email && c.author.email?.toLowerCase() === v.email.toLowerCase()) : Boolean(v.guestKey && c.author.key === v.guestKey))

const pairs = (flat: number[] = []) => {
  const out: [number, number][] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}

function forBrowser(c: Stored, v: Viewer): ReviewComment {
  return {
    _id: c._id,
    deliverableKey: c.deliverableKey,
    version: c.version,
    t: c.t,
    ...(typeof c.tOut === 'number' ? { tOut: c.tOut } : {}),
    text: c.text,
    author: { kind: c.author.kind, name: c.author.name },
    ...(c.parent ? { parent: c.parent } : {}),
    ...(c.done ? { done: true, doneBy: c.doneBy, doneAt: c.doneAt } : {}),
    ...(c.drawing?.length ? { drawing: c.drawing.map((s) => ({ type: s.type, color: s.color, points: pairs(s.points) })) } : {}),
    createdAt: c.createdAt,
    ...(c.editedAt ? { editedAt: c.editedAt } : {}),
    mine: isMine(c, v),
  }
}

/** Made-up notes for the sample clip (23.976 fps), so the room has something in it. */
function sampleComments(t: ReviewTarget): Stored[] {
  const f = (n: number) => Math.round((n / (t.d.fps ?? 23.976)) * 1000) / 1000
  const at = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString()
  const base = { deliverableKey: t.d._key, version: t.d.version || 1 }
  return [
    { ...base, _id: 'sample-c1', t: f(48), text: 'Could the opening title hold for another second?', author: { kind: 'client', name: 'Alex Sample', email: 'preview@sample.client' }, createdAt: at(300) },
    { ...base, _id: 'sample-c2', t: f(120), tOut: f(216), text: 'This stretch feels slow. Could we trim it?', author: { kind: 'guest', name: 'Sam (board)' }, createdAt: at(240) },
    { ...base, _id: 'sample-c3', parent: 'sample-c2', t: f(120), text: 'Agreed, we’ll tighten it in the next version.', author: { kind: 'admin', name: 'Josh' }, createdAt: at(200) },
    {
      ...base,
      _id: 'sample-c4',
      t: f(300),
      text: 'The bars on the right are cut off here.',
      author: { kind: 'client', name: 'Alex Sample', email: 'preview@sample.client' },
      drawing: [{ type: 'arrow', color: COLORS[0], points: [0.62, 0.3, 0.86, 0.14] }, { type: 'box', color: COLORS[1], points: [0.84, 0.05, 0.99, 0.4] }],
      done: true,
      doneBy: 'Josh',
      doneAt: at(100),
      createdAt: at(180),
    },
  ]
}

export async function listComments(t: ReviewTarget, v: Viewer): Promise<ReviewComment[]> {
  const rows = t.sample
    ? sampleComments(t)
    : ((await portalClient
        .fetch<Stored[]>(
          `*[_type == "reviewComment" && project._ref == $p && deliverableKey == $k && version == $v] | order(t asc, createdAt asc){${FIELDS}}`,
          { p: t.projectId, k: t.d._key, v: t.d.version || 1 },
          { cache: 'no-store' },
        )
        .catch((e) => {
          console.error('[review] comments query failed', e)
          return null
        })) ?? [])
  return rows.map((c) => forBrowser(c, v))
}

/** Plain text only: tags and control characters out, length capped. */
export const cleanText = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, 2000)

const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000

/** Shapes from the browser, checked and capped: known types and colours, 0–1 coordinates, a few hundred points at most. */
export function cleanDrawing(raw: unknown): Stored['drawing'] {
  if (!Array.isArray(raw)) return undefined
  const out: NonNullable<Stored['drawing']> = []
  for (const s of raw.slice(0, MAX_SHAPES)) {
    if (!s || typeof s !== 'object') continue
    const { type, color, points } = s as { type?: unknown; color?: unknown; points?: unknown }
    if (type !== 'arrow' && type !== 'box' && type !== 'pen') continue
    if (typeof color !== 'string' || !COLORS.includes(color)) continue
    if (!Array.isArray(points)) continue
    let pts = points.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
    if (type !== 'pen') pts = pts.slice(0, 2)
    else if (pts.length > MAX_POINTS) pts = pts.filter((_, i) => i % Math.ceil(pts.length / MAX_POINTS) === 0)
    if (pts.length < 2) continue
    out.push({ _key: randomBytes(5).toString('hex'), type, color, points: pts.flatMap(([x, y]) => [round(x), round(y)]) })
  }
  return out.length ? out : undefined
}

const clampTime = (n: unknown, d: Deliverable) => {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : NaN
  if (Number.isNaN(x)) return undefined
  return Math.round(Math.max(0, Math.min(d.durationSec ?? 86_400, x)) * 1000) / 1000
}

export type PostInput = { t?: unknown; tOut?: unknown; text?: unknown; parent?: unknown; drawing?: unknown; email?: unknown }
export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

export async function postComment(target: ReviewTarget, v: Viewer, input: PostInput): Promise<Result<ReviewComment>> {
  if (!v.canComment) return { ok: false, status: 403, error: v.kind === 'guest' ? 'name' : 'view-only' }
  const text = cleanText(input.text)
  if (!text) return { ok: false, status: 400, error: 'empty' }
  const max = v.kind === 'guest' ? 20 : v.kind === 'client' ? 60 : 1000
  if (limited(`rc:${v.who}`, max, 10 * 60_000)) return { ok: false, status: 429, error: 'too-many' }

  let parent: string | undefined
  let t = clampTime(input.t, target.d) ?? 0
  let tOut = clampTime(input.tOut, target.d)
  if (typeof input.parent === 'string' && input.parent) {
    parent = input.parent.slice(0, 80)
    if (!target.sample) {
      const top = await portalClient.fetch<Stored | null>(`*[_type == "reviewComment" && _id == $id && project._ref == $p && deliverableKey == $k && version == $v][0]{${FIELDS}}`, {
        id: parent, p: target.projectId, k: target.d._key, v: target.d.version || 1,
      })
      if (!top || top.parent) return { ok: false, status: 400, error: 'parent' }
      t = top.t
    }
    tOut = undefined
  }
  if (tOut !== undefined && tOut <= t) tOut = undefined
  const drawing = parent ? undefined : cleanDrawing(input.drawing)
  const email = v.kind === 'guest' && typeof input.email === 'string' && /^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/.test(input.email.trim()) ? input.email.trim().toLowerCase() : v.email

  const doc: Stored & { _type: 'reviewComment'; project: { _type: 'reference'; _ref: string; _weak: true } } = {
    _id: target.sample ? `sample-${randomUUID()}` : `rc-${randomUUID()}`,
    _type: 'reviewComment',
    project: { _type: 'reference', _ref: target.projectId, _weak: true },
    deliverableKey: target.d._key,
    version: target.d.version || 1,
    t,
    ...(tOut !== undefined ? { tOut } : {}),
    text,
    author: { kind: v.kind, name: v.name, ...(email ? { email } : {}), ...(v.guestKey ? { key: v.guestKey } : {}) },
    ...(parent ? { parent } : {}),
    ...(drawing ? { drawing } : {}),
    createdAt: new Date().toISOString(),
  }
  if (target.sample) return { ok: true, value: forBrowser(doc, v) }
  await portalClient.create(doc)
  if (v.kind !== 'admin') await afterOutsideComment(target, v).catch((e) => console.error('[review] notify failed', e))
  return { ok: true, value: forBrowser(doc, v) }
}

async function loadOne(target: ReviewTarget, id: string) {
  return portalClient.fetch<Stored | null>(`*[_type == "reviewComment" && _id == $id && project._ref == $p && deliverableKey == $k][0]{${FIELDS}}`, { id, p: target.projectId, k: target.d._key })
}

export async function editComment(target: ReviewTarget, v: Viewer, id: string, change: { text?: unknown; done?: unknown }): Promise<Result<true>> {
  if (!v.canComment) return { ok: false, status: 403, error: 'view-only' }
  if (target.sample) return { ok: true, value: true }
  const c = await loadOne(target, id)
  if (!c) return { ok: false, status: 404, error: 'gone' }
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  if (change.text !== undefined) {
    if (!isMine(c, v) || Date.now() - Date.parse(c.createdAt) > EDIT_WINDOW) return { ok: false, status: 403, error: 'too-late' }
    const text = cleanText(change.text)
    if (!text) return { ok: false, status: 400, error: 'empty' }
    Object.assign(set, { text, editedAt: new Date().toISOString() })
  }
  if (typeof change.done === 'boolean') {
    // The owner, portal contacts, and whoever wrote it.
    if (!(v.kind === 'admin' || v.kind === 'client' || isMine(c, v))) return { ok: false, status: 403, error: 'not-yours' }
    if (change.done) Object.assign(set, { done: true, doneBy: v.name, doneAt: new Date().toISOString() })
    else unset.push('done', 'doneBy', 'doneAt')
  }
  if (!Object.keys(set).length && !unset.length) return { ok: false, status: 400, error: 'nothing' }
  await portalClient.patch(id).set(set).unset(unset).commit()
  return { ok: true, value: true }
}

export async function removeComment(target: ReviewTarget, v: Viewer, id: string): Promise<Result<true>> {
  if (!v.canComment) return { ok: false, status: 403, error: 'view-only' }
  if (target.sample) return { ok: true, value: true }
  const c = await loadOne(target, id)
  if (!c) return { ok: false, status: 404, error: 'gone' }
  // Your own within 15 minutes; the owner can tidy up anything.
  if (!(v.kind === 'admin' || (isMine(c, v) && Date.now() - Date.parse(c.createdAt) <= EDIT_WINDOW))) return { ok: false, status: 403, error: 'too-late' }
  const tx = portalClient.transaction().delete(id)
  if (!c.parent) {
    const replies = await portalClient.fetch<string[]>(`*[_type == "reviewComment" && parent == $id]._id`, { id })
    for (const r of replies) tx.delete(r)
  }
  await tx.commit()
  return { ok: true, value: true }
}

/* ── Telling the owner ─────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const adminRoomPath = (projectId: string, key: string) => `/admin/review/${encodeURIComponent(projectId)}/${encodeURIComponent(key)}`

async function sendCommentNotice(target: { projectId: string; projectTitle: string; d: Deliverable }, since?: string) {
  const count = await portalClient.fetch<number>(
    `count(*[_type == "reviewComment" && project._ref == $p && deliverableKey == $k && version == $v && author.kind != "admin" && createdAt > $since])`,
    { p: target.projectId, k: target.d._key, v: target.d.version || 1, since: since ?? '1970-01-01T00:00:00Z' },
  )
  if (!count) return
  const where = `${target.d.title} (${versionLabel(target.d)})`
  const link = `${SITE_URL}${adminRoomPath(target.projectId, target.d._key)}`
  const line = `${count} new comment${count === 1 ? '' : 's'} on ${where} · ${target.projectTitle}.`
  await notifyJosh(`💬 ${esc(line)} ${link}`)
  await sendEmail({
    to: [portalEnv.replyTo],
    subject: `${count} new comment${count === 1 ? '' : 's'}: ${where} · ${target.projectTitle}`,
    text: `${line}\n\n${link}`,
    html: `<p>${esc(line)}</p><p><a href="${link}">Open the review room</a></p>`,
  }).catch((e) => console.error('[review] comment email failed', e))
}

/**
 * A client or guest comment: one activity line per person per version every 10 minutes,
 * and at most one notice to the owner per version every 10 minutes. Comments that arrive
 * inside the gap are marked pending; the scheduler sends them once the gap is over.
 */
async function afterOutsideComment(target: ReviewTarget, v: Viewer) {
  if (!limited(`rca:${target.projectId}:${target.d._key}:${v.who}`, 1, NOTIFY_GAP))
    await addActivity(target.projectId, `${v.name}${v.kind === 'guest' ? ' (guest)' : ''} commented on ${target.d.title} (${versionLabel(target.d)})`, 'comment')
  const now = Date.now()
  const fresh = await freshState(target.projectId)
  const cur = fresh?.deliverables?.find((x) => x._key === target.d._key) as (Deliverable & { _key: string }) | undefined
  const last = cur?.commentsNotifiedAt
  if (last && now - Date.parse(last) < NOTIFY_GAP) {
    if (!cur?.commentsPending) await updateDeliverableState(target.projectId, target.d._key, { commentsPending: true })
    return
  }
  const stamp = new Date(now).toISOString()
  if (fresh && cur) {
    if (!(await claimDeliverable(target.projectId, fresh._rev, target.d._key, { commentsNotifiedAt: stamp, commentsPending: false }))) return
  } else await updateDeliverableState(target.projectId, target.d._key, { commentsNotifiedAt: stamp, commentsPending: false })
  await sendCommentNotice(target, last)
}

/** From the scheduler: comments that came in during the 10-minute gap. */
export async function flushCommentNotices(p: { _id: string; title: string; deliverables?: Deliverable[] }, now: number, log: string[]) {
  if (!portalReady() || p._id.startsWith('sample-')) return
  for (const d of p.deliverables ?? []) {
    if (!d.commentsPending || !d.commentsNotifiedAt || now - Date.parse(d.commentsNotifiedAt) < NOTIFY_GAP) continue
    const fresh = await freshState(p._id)
    if (!fresh) continue
    const stamp = new Date(now).toISOString()
    if (!(await claimDeliverable(p._id, fresh._rev, d._key, { commentsNotifiedAt: stamp, commentsPending: false }))) continue
    await sendCommentNotice({ projectId: p._id, projectTitle: p.title, d }, d.commentsNotifiedAt)
    log.push(`comment notice: ${p.title} / ${d.title} v${d.version || 1}`)
  }
}
