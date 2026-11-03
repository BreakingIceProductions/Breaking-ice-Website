import { NextResponse } from 'next/server'
import { driveReady } from '@/portal/config'
import { addActivity } from '@/portal/data'
import { listProjectFiles } from '@/portal/drive'
import { json, limited, projectAccess, whoIs } from '@/portal/http'
import { canDownloadVideo, LARGE_FILE, matchFinalFile } from '@/portal/library'
import { vimeoDownloadLink } from '@/portal/vimeo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A final video of a delivered project. Its file in Final Files when there is one
 * (the exact export, from Drive); otherwise Vimeo's download.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const a = await projectAccess(new URL(req.url).searchParams.get('project'))
  const d = a?.project.deliverables?.find((x) => x._key === key)
  if (!a || !d || !canDownloadVideo(a.project, d)) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: false, error: 'This is a sample video. In a real project it downloads straight from Vimeo.' }, 404)
  const url = new URL(req.url)
  if (driveReady()) {
    const files = await listProjectFiles(a.project).catch(() => [])
    const file = matchFinalFile(d.title, files.filter((f) => f.from === 'Final Files'))
    // The Drive download notes it in the activity.
    if (file && (file.size ?? 0) <= LARGE_FILE) return NextResponse.redirect(new URL(`/api/portal/download/${encodeURIComponent(file.id)}?project=${encodeURIComponent(a.project.slug)}`, url), 303)
  }
  try {
    const link = await vimeoDownloadLink(d.shareUrl)
    if (!limited(`vdl:${a.session.email}:${d._key}`, 1, 10 * 60_000)) await addActivity(a.project._id, `${whoIs(a)} downloaded ${d.title}`, 'download')
    // No files back means the token lacks the video_files scope: Vimeo's own page has a Download button.
    if (!link) console.warn('[portal] no Vimeo download files for', d.shareUrl)
    return NextResponse.redirect(link ?? d.shareUrl!, 303)
  } catch (e) {
    console.error('[portal] video download failed', e)
    return NextResponse.redirect(d.shareUrl!, 303)
  }
}
