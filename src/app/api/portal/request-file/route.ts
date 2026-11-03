import { SITE_URL } from '@/lib/site'
import { driveReady, portalEnv } from '@/portal/config'
import { addActivity } from '@/portal/data'
import { fileInProject } from '@/portal/drive'
import { notifyJosh, sendEmail } from '@/portal/email'
import { json, limited, projectAccess, sameOrigin, whoIs } from '@/portal/http'

export const runtime = 'nodejs'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A final file too big to download through the portal: the client asks, Josh sends it another way. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const body = await req.json().catch(() => ({}))
  const a = await projectAccess(typeof body.project === 'string' ? body.project : null)
  if (!a || typeof body.id !== 'string') return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: true })
  if (!driveReady()) return json({ ok: false }, 503)
  if (limited(`req:${a.session.email}`, 20, 60 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  const f = await fileInProject(a.project, body.id).catch(() => null)
  if (!f || f.from !== 'Final Files') return json({ ok: false }, 404)

  const who = whoIs(a)
  const line = `${who} asked for ${f.name} (${a.project.title}).`
  await addActivity(a.project._id, `${who} asked for ${f.name}`, 'download')
  await notifyJosh(`📦 ${esc(line)} ${SITE_URL}/admin/projects/${a.project._id}`)
  await sendEmail({
    to: [portalEnv.replyTo],
    subject: `File request: ${f.name} · ${a.project.title}`,
    text: `${line}\n\nIt's too big to download through the portal. Send it with a share link (Drive, WeTransfer) to ${a.session.email}.\n\n${SITE_URL}/admin/projects/${a.project._id}`,
    html: `<p>${esc(line)}</p><p>It’s too big to download through the portal. Send it with a share link (Drive, WeTransfer) to ${esc(a.session.email)}.</p><p><a href="${SITE_URL}/admin/projects/${a.project._id}">Open the project</a></p>`,
  }).catch((e) => console.error('[portal] file request email failed', e))
  return json({ ok: true })
}
