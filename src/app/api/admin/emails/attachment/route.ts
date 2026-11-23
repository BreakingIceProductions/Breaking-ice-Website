import { adminFromRequest } from '@/admin/auth'
import { adminSampleMode } from '@/admin/config'
import { fetchAttachment, mailState } from '@/admin/gmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Downloads one attachment from a Gmail message (or shows an inline image in a message). Owner only. */

const INLINE_OK = /^image\/(png|jpe?g|gif|webp)$/

export async function GET(req: Request) {
  // Plain links (no Origin header) still carry Sec-Fetch-Site: same-origin from our own pages.
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return new Response('Signed out', { status: 401 })
  const u = new URL(req.url)
  const m = u.searchParams.get('m') ?? ''
  const a = u.searchParams.get('a') ?? ''
  const name = (u.searchParams.get('n') ?? 'attachment').replace(/[\r\n"\\/]/g, '_').slice(0, 200) || 'attachment'
  const type = (u.searchParams.get('t') ?? '').toLowerCase()
  const inline = u.searchParams.get('i') === '1' && INLINE_OK.test(type)
  const headers = (len: number) => ({
    'Content-Type': inline ? type : 'application/octet-stream',
    'Content-Length': String(len),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  })
  if (adminSampleMode()) {
    const text = Buffer.from('Sample data: this attachment is made up.\n')
    return new Response(text, { headers: headers(text.byteLength) })
  }
  if (!/^[0-9a-f]{1,32}$/i.test(m) || !/^[\w-]{1,2000}$/.test(a)) return new Response('Bad request', { status: 400 })
  if ((await mailState()) !== 'ready') return new Response('Connect Google with email first', { status: 409 })
  try {
    const data = await fetchAttachment(m, a)
    return new Response(new Uint8Array(data), { headers: headers(data.byteLength) })
  } catch (e) {
    console.error('[emails] attachment failed', e)
    return new Response('Gmail didn’t send that file. Try again.', { status: 502 })
  }
}
