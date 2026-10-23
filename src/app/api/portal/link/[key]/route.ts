import { NextResponse } from 'next/server'
import { json, projectAccess } from '@/portal/http'
import { driveReady } from '@/portal/config'
import { accessToken } from '@/portal/drive'
import { downloadSource, googleFile } from '@/portal/links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Downloads one of a project's documents through the portal. Checks the link is on
 * this client's project first. If Google won't hand the file over (not shared as
 * "Anyone with the link"), the client is sent to the link itself instead.
 */
async function privateFetch(url: string) {
  const f = googleFile(url)
  if (!f || !driveReady()) return null
  try {
    const headers = { Authorization: `Bearer ${await accessToken()}` }
    const base = `https://www.googleapis.com/drive/v3/files/${f.id}`
    const res = f.exportMime
      ? await fetch(`${base}/export?mimeType=${encodeURIComponent(f.exportMime)}`, { headers, cache: 'no-store' })
      : await fetch(`${base}?alt=media&supportsAllDrives=true`, { headers, cache: 'no-store' })
    if (!res.ok) return null
    // Drive's media response has no file name, so ask for it.
    const meta = await fetch(`${base}?fields=name&supportsAllDrives=true`, { headers, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const name = meta?.name ? `${meta.name}${f.ext && !meta.name.endsWith(`.${f.ext}`) ? `.${f.ext}` : ''}` : undefined
    return name ? new Response(res.body, { status: 200, headers: { 'content-type': res.headers.get('content-type') ?? '', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, ...(res.headers.get('content-length') ? { 'content-length': res.headers.get('content-length')! } : {}) } }) : res
  } catch (e) {
    console.error('[portal] private link fetch failed', e)
    return null
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const a = await projectAccess(new URL(req.url).searchParams.get('project'))
  const link = a?.project.links?.find((l) => l._key === key && l.url)
  if (!a || !link?.url) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: false, error: 'This is a sample file. In a real project it downloads here.' }, 404)
  const src = downloadSource(link.url)
  if (!src) return NextResponse.redirect(link.url, 303)
  try {
    // Files the portal's Google account can see (anything in BI Clients) come through privately;
    // otherwise try the public "Anyone with the link" download.
    const res = (await privateFetch(link.url)) ?? (await fetch(src.fetchUrl, { redirect: 'follow', cache: 'no-store' }))
    const type = res.headers.get('content-type') ?? ''
    // A web page instead of a file means Google wants a sign-in: let the client open it there.
    if (!res.ok || !res.body || type.startsWith('text/html')) return NextResponse.redirect(link.url, 303)
    const given = res.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
    const fallback = `${(link.title ?? 'download').replace(/[\\/:*?"<>|]+/g, '').trim() || 'download'}${src.ext ? `.${src.ext}` : ''}`
    const name = given ? decodeURIComponent(given[1] ?? given[2]) : fallback
    const headers = new Headers({
      'Content-Type': type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    const len = res.headers.get('content-length')
    if (len) headers.set('content-length', len)
    return new Response(res.body, { status: 200, headers })
  } catch (e) {
    console.error('[portal] link download failed', e)
    return NextResponse.redirect(link.url, 303)
  }
}
