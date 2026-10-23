import { SITE_URL } from '@/lib/site'
import { portalEnv } from '@/portal/config'
import { addActivity, updateDeliverable } from '@/portal/data'
import { notifyJosh, sendEmail } from '@/portal/email'
import { json, limited, projectAccess, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The client approves a version or asks for changes (with a note). Josh hears about it straight away. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const body = await req.json().catch(() => ({}))
  const a = await projectAccess(typeof body.project === 'string' ? body.project : null)
  const d = a?.project.deliverables?.find((x) => x._key === body.key)
  if (!a || !d) return json({ ok: false }, 404)
  if (d.status !== 'awaiting-feedback') return json({ ok: false, error: 'not-open' }, 409)
  const approve = body.action === 'approve'
  const note = String(body.note ?? '').trim().slice(0, 4000)
  if (!approve && !note) return json({ ok: false, error: 'note' }, 400)
  if (a.session.demo) return json({ ok: true })
  if (limited(`fb:${a.session.email}`, 30, 60 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)

  const who = a.clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === a.session.email)?.name || a.session.email
  await updateDeliverable(a.project._id, d._key, { status: approve ? 'approved' : 'changes-requested' })
  await addActivity(a.project._id, approve ? `${who} approved ${d.title} v${d.version}` : `${who} asked for changes to ${d.title} v${d.version}`, approve ? 'approved' : 'comment')

  const line = approve ? `${who} approved ${d.title} v${d.version} (${a.project.title}).` : `${who} asked for changes to ${d.title} v${d.version} (${a.project.title}).`
  await notifyJosh(`${approve ? '✅' : '✏️'} ${esc(line)} ${SITE_URL}/admin/projects/${a.project._id}`)
  await sendEmail({
    to: [portalEnv.replyTo],
    subject: `${approve ? 'Approved' : 'Changes requested'}: ${d.title} v${d.version} · ${a.project.title}`,
    text: `${line}${note ? `\n\n“${note}”` : ''}\n\n${SITE_URL}/admin/projects/${a.project._id}`,
    html: `<p>${esc(line)}</p>${note ? `<blockquote style="border-left:3px solid #c87533;margin:0;padding:4px 12px;white-space:pre-wrap">${esc(note)}</blockquote>` : ''}<p><a href="${SITE_URL}/admin/projects/${a.project._id}">Open the project</a></p>`,
  }).catch((e) => console.error('[portal] feedback email failed', e))
  return json({ ok: true })
}
