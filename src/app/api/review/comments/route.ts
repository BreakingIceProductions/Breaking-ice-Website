import { json, sameOrigin } from '@/portal/http'
import { editComment, listComments, postComment, removeComment, resolveReview, type PostInput, type ReviewParams } from '@/portal/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A guest's random browser id travels in a header, never in the address. */
const guestId = (req: Request) => req.headers.get('x-review-guest') ?? undefined

/** The comments on one version, and what this viewer may do. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const r = await resolveReview(req, { via: q.get('via'), project: q.get('project'), key: q.get('key'), token: q.get('token'), guestId: guestId(req), guestName: 'x' })
  if (!r) return json({ ok: false }, 404)
  const comments = await listComments(r.target, r.viewer)
  return json({ ok: true, comments, sample: r.target.sample })
}

async function access(req: Request) {
  if (!sameOrigin(req)) return { error: json({ ok: false }, 403) } as const
  const body = (await req.json().catch(() => ({}))) as ReviewParams & Record<string, unknown>
  const r = await resolveReview(req, { ...body, guestId: guestId(req) })
  if (!r) return { error: json({ ok: false }, 404) } as const
  return { r, body } as const
}

export async function POST(req: Request) {
  const a = await access(req)
  if ('error' in a) return a.error
  const res = await postComment(a.r.target, a.r.viewer, a.body as PostInput)
  return res.ok ? json({ ok: true, comment: res.value }) : json({ ok: false, error: res.error }, res.status)
}

export async function PATCH(req: Request) {
  const a = await access(req)
  if ('error' in a) return a.error
  if (typeof a.body.id !== 'string') return json({ ok: false }, 400)
  const res = await editComment(a.r.target, a.r.viewer, a.body.id, { text: a.body.text, done: a.body.done })
  return res.ok ? json({ ok: true }) : json({ ok: false, error: res.error }, res.status)
}

export async function DELETE(req: Request) {
  const a = await access(req)
  if ('error' in a) return a.error
  if (typeof a.body.id !== 'string') return json({ ok: false }, 400)
  const res = await removeComment(a.r.target, a.r.viewer, a.body.id)
  return res.ok ? json({ ok: true }) : json({ ok: false, error: res.error }, res.status)
}
