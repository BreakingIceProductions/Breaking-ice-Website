import { NextResponse } from 'next/server'
import { json, projectAccess } from '@/portal/http'
import { canDownloadVideo } from '@/portal/library'
import { vimeoDownloadLink } from '@/portal/vimeo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A final video of a delivered project: sends the client straight to Vimeo's download. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const a = await projectAccess(new URL(req.url).searchParams.get('project'))
  const d = a?.project.deliverables?.find((x) => x._key === key)
  if (!a || !d || !canDownloadVideo(a.project, d)) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: false, error: 'This is a sample video. In a real project it downloads straight from Vimeo.' }, 404)
  try {
    const link = await vimeoDownloadLink(d.shareUrl)
    // No files back means the token lacks the video_files scope: Vimeo's own page has a Download button.
    if (!link) console.warn('[portal] no Vimeo download files for', d.shareUrl)
    return NextResponse.redirect(link ?? d.shareUrl!, 303)
  } catch (e) {
    console.error('[portal] video download failed', e)
    return NextResponse.redirect(d.shareUrl!, 303)
  }
}
