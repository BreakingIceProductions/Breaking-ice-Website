import { driveReady, MAX_UPLOAD_BYTES } from '@/portal/config'
import { startUpload } from '@/portal/drive'
import { ipOf, json, limited, projectAccess, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

// Images, fonts, documents, audio, short video and archives. No programs or scripts.
const BLOCKED = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|sh|app|dmg|pkg|apk|dll|lnk|iso)$/i

/** Opens an upload straight to Google Drive and hands the browser the address to send the file to. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const body = await req.json().catch(() => ({}))
  const a = await projectAccess(typeof body.project === 'string' ? body.project : null)
  if (!a) return json({ ok: false }, 404)
  const name = String(body.name ?? '').slice(0, 200)
  const size = Number(body.size)
  if (!name || !Number.isFinite(size) || size <= 0) return json({ ok: false, error: 'invalid' }, 400)
  if (size > MAX_UPLOAD_BYTES) return json({ ok: false, error: 'too-big' }, 400)
  if (BLOCKED.test(name)) return json({ ok: false, error: 'type' }, 400)
  if (a.session.demo) return json({ ok: true, demo: true })
  if (!driveReady()) return json({ ok: false, error: 'not-configured' }, 503)
  if (limited(`up:${a.session.email}:${ipOf(req)}`, 60, 60 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)

  const origin = req.headers.get('origin') || new URL(req.url).origin
  const contact = a.clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === a.session.email)
  try {
    const sessionUrl = await startUpload(a.project, { name, size, type: String(body.type || '') }, origin, contact?.name || a.session.email)
    return json({ ok: true, sessionUrl })
  } catch (e) {
    console.error('[portal] upload start failed', e)
    return json({ ok: false, error: 'drive' }, 502)
  }
}
