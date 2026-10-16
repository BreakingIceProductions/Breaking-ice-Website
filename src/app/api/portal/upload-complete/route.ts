import { SITE_URL } from '@/lib/site'
import { portalEnv } from '@/portal/config'
import { addActivity } from '@/portal/data'
import { notifyJosh, sendEmail } from '@/portal/email'
import { json, limited, projectAccess, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

const size = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)

/** After an upload finishes: log it on the project and ping Josh (Slack and email). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const body = await req.json().catch(() => ({}))
  const a = await projectAccess(typeof body.project === 'string' ? body.project : null)
  if (!a) return json({ ok: false }, 404)
  if (a.session.demo) return json({ ok: true })
  if (limited(`done:${a.session.email}`, 20, 60 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)
  const names: string[] = (Array.isArray(body.files) ? body.files : []).slice(0, 50).map((f: { name?: string }) => String(f?.name ?? '').slice(0, 200))
  const total = (Array.isArray(body.files) ? body.files : []).reduce((s: number, f: { size?: number }) => s + (Number(f?.size) || 0), 0)
  if (!names.length) return json({ ok: false }, 400)
  const who = a.clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === a.session.email)?.name || a.session.email
  const what = names.length === 1 ? names[0] : `${names.length} files`
  await addActivity(a.project._id, `${who} uploaded ${what}`, 'upload')
  const line = `${who} (${a.project.client.organizationName}) uploaded ${what} (${size(total)}) to ${a.project.title}.`
  // Escape Slack's control characters so file names can't ping channels or fake links.
  const slackSafe = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  await notifyJosh(`📁 ${slackSafe} ${SITE_URL}/studio/portal`)
  await sendEmail({
    to: [portalEnv.replyTo],
    subject: `Upload: ${what} · ${a.project.title}`,
    text: `${line}\n\n${names.join('\n')}\n\nIt's in Google Drive › BI Clients › ${a.project.client.organizationName} › ${a.project.title} › From client.`,
    html: `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p><ul>${names.map((n) => `<li>${n.replace(/</g, '&lt;')}</li>`).join('')}</ul><p>It’s in Google Drive › BI Clients › ${a.project.client.organizationName.replace(/</g, '&lt;')} › ${a.project.title.replace(/</g, '&lt;')} › From client.</p>`,
  }).catch((e) => console.error('[portal] upload email failed', e))
  return json({ ok: true })
}
