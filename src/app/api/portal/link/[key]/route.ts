import { NextResponse } from 'next/server'
import { json, projectAccess } from '@/portal/http'
import { streamGoogleFile } from '@/portal/drive-file'

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
  const res = await streamGoogleFile(link.url, { title: link.title })
  return res ?? NextResponse.redirect(link.url, 303)
}
