import { getSession } from '@/portal/auth'
import { driveReady } from '@/portal/config'
import { accessToken, downloadStream } from '@/portal/drive'
import { json } from '@/portal/http'
import { fileInRetainer, retainerClientsFor, retainerDocuments, retainerLibrary } from '@/retainer/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Streams one file from a retainer client's library or documents. The signed-in person must be a
 * contact on that retainer client (retainerClientsFor), and the file must really belong to the
 * retainer (fileInRetainer) before anything is fetched from Drive.
 */
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string; fileId: string }> }) {
  const { clientId, fileId } = await params
  const session = await getSession()
  if (!session) return json({ ok: false }, 404)
  const c = (await retainerClientsFor(session).catch(() => [])).find((x) => x._id === clientId)
  if (!c) return json({ ok: false }, 404)
  if (session.demo) return json({ ok: false, error: 'This is a sample file. For a real client it downloads straight from Google Drive.' }, 404)
  if (!driveReady()) return json({ ok: false }, 503)
  try {
    if (!(await fileInRetainer(c, fileId))) return json({ ok: false }, 404)
    const f = await fileMeta(c, fileId)
    if (!f) return json({ ok: false }, 404)
    const { res, name, type } = await downloadStream(f, req.headers.get('range'))
    const headers = new Headers({
      'Content-Type': type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = res.headers.get(h)
      if (v) headers.set(h, v)
    }
    return new Response(res.body, { status: res.status, headers })
  } catch (e) {
    console.error('[retainer] download failed', e)
    return json({ ok: false }, 502)
  }
}

/** Name and type for the download: from the lists we already show, or from Drive for an item file not listed there. */
async function fileMeta(c: Parameters<typeof retainerLibrary>[0], fileId: string) {
  const [lib, docs] = await Promise.all([retainerLibrary(c).catch(() => []), retainerDocuments(c).catch(() => [])])
  const listed = [...lib, ...docs].find((f) => f.id === fileId)
  if (listed) return { id: listed.id, name: listed.name, mimeType: listed.mimeType }
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,trashed`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  })
  if (!res.ok) return null
  const f = (await res.json()) as { id: string; name: string; mimeType: string; size?: string; trashed?: boolean }
  return f.trashed ? null : f
}
