import { NextResponse } from 'next/server'
import { googleThumbnail, streamGoogleFile } from '@/portal/drive-file'
import { json, projectAccess } from '@/portal/http'
import { clientCanOpen } from '@/portal/library'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * A non-video deliverable (design, PDF, audio) for the signed-in client:
 * ?mode=preview (thumbnail), view (opens in the browser) or download.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const url = new URL(req.url)
  const a = await projectAccess(url.searchParams.get('project'))
  const d = a?.project.deliverables?.find((x) => x._key === key && clientCanOpen(x, a.project.deliverables))
  if (!a || !d?.fileUrl) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: false }, 404)
  const mode = url.searchParams.get('mode')
  if (mode === 'preview') return (await googleThumbnail(d.fileUrl)) ?? json({ ok: false }, 404)
  const res = await streamGoogleFile(d.fileUrl, { inline: mode === 'view', title: `${d.title} v${d.version}` })
  return res ?? NextResponse.redirect(d.fileUrl, 303)
}
