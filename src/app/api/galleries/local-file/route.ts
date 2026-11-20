import { checkLocal, readLocal, writeLocal } from '@/galleries/files'
import { MAX_PHOTO_BYTES } from '@/galleries/types'

export const runtime = 'nodejs'

/**
 * Stand-in for R2 on a laptop with no R2 settings: the uploader PUTs here and thumbnails are
 * read back from here, using the short-lived signed addresses files.ts hands out.
 * checkLocal refuses everything in production, so this route is a 404 on the real site.
 */

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

function parse(req: Request) {
  const u = new URL(req.url)
  return { k: u.searchParams.get('k') ?? '', e: u.searchParams.get('e') ?? '', s: u.searchParams.get('s') ?? '', d: u.searchParams.get('d') ?? '' }
}

/** A filename safe for a header: plain ASCII fallback plus the UTF-8 original. */
function disposition(name: string) {
  const clean = name.replace(/[\r\n"\\/]/g, '').slice(0, 200) || 'photo.jpg'
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`
}

export async function GET(req: Request) {
  const { k, e, s, d } = parse(req)
  if (!checkLocal('GET', k, e, s)) return notFound()
  let buf: Buffer
  try {
    buf = await readLocal(k)
  } catch {
    return notFound()
  }
  const ext = /\.([a-z0-9]+)$/.exec(k)?.[1] ?? 'jpg'
  const headers: Record<string, string> = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Content-Length': String(buf.length), 'Cache-Control': 'private, max-age=7200' }
  if (d) headers['Content-Disposition'] = disposition(d)
  return new Response(new Uint8Array(buf), { headers })
}

export async function PUT(req: Request) {
  const { k, e, s } = parse(req)
  if (!checkLocal('PUT', k, e, s)) return notFound()
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_PHOTO_BYTES) return new Response('Too large', { status: 413 })
  const body = await req.arrayBuffer()
  if (!body.byteLength || body.byteLength > MAX_PHOTO_BYTES) return new Response('Bad size', { status: 400 })
  try {
    await writeLocal(k, body)
  } catch {
    return notFound()
  }
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
