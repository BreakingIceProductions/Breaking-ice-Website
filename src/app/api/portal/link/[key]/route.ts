import { NextResponse } from 'next/server'
import { json, projectAccess } from '@/portal/http'
import { downloadSource } from '@/portal/links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Downloads one of a project's documents through the portal. Checks the link is on
 * this client's project first. If Google won't hand the file over (not shared as
 * "Anyone with the link"), the client is sent to the link itself instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const a = await projectAccess(new URL(req.url).searchParams.get('project'))
  const link = a?.project.links?.find((l) => l._key === key && l.url)
  if (!a || !link?.url) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: false, error: 'This is a sample file. In a real project it downloads here.' }, 404)
  const src = downloadSource(link.url)
  if (!src) return NextResponse.redirect(link.url, 303)
  try {
    const res = await fetch(src.fetchUrl, { redirect: 'follow', cache: 'no-store' })
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
