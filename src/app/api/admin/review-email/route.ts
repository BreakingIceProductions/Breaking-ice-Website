import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject } from '@/admin/data'
import { signLinkToken } from '@/portal/auth'
import { addActivity, getPortalSettings, portalClient, producerFor, updateDeliverableState } from '@/portal/data'
import { reviewBatchEmail, sendEmail } from '@/portal/email'
import { json } from '@/portal/http'
import { isLatest } from '@/portal/library'
import type { PortalClient } from '@/portal/types'
import { SITE_URL } from '@/lib/site'

export const runtime = 'nodejs'

/**
 * One "ready for review" email for several versions at once, instead of the scheduler's
 * one email per version. Marks each as notified (and reminded), so the scheduler stays quiet about them.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  const keys: string[] = Array.isArray(body.keys) ? body.keys.map(String) : []
  const items = p.deliverables.filter((d) => keys.includes(d._key) && d.status === 'awaiting-feedback' && isLatest(d, p.deliverables))
  if (!items.length) return json({ ok: false, error: 'nothing', message: 'Pick at least one version that’s with the client.' }, 400)
  if (admin.sample) return json({ ok: true, sample: true, message: 'Sample mode: nothing sent.' })

  const client = await portalClient.fetch<PortalClient | null>(`*[_id == $id][0]{_id, organizationName, contacts[]{_key, name, email, role, getsEmails}, producer}`, { id: p.client._id })
  const to = (client?.contacts ?? []).filter((c) => c.email && c.getsEmails !== false)
  if (!client || !to.length) return json({ ok: false, error: 'no-contacts', message: `${p.client.organizationName} has no contacts who get emails.` }, 400)

  const settings = await getPortalSettings()
  const producer = producerFor({ client }, settings)
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : ''
  const allVideo = items.every((d) => d.category === 'video')
  const sent: string[] = []
  const failed: string[] = []
  for (const c of to) {
    const token = await signLinkToken(c.email.toLowerCase(), `/portal/${p.slug}${allVideo ? '?at=videos#work' : ''}`, 7 * 24 * 60)
    const mail = reviewBatchEmail({
      name: c.name.split(' ')[0],
      projectTitle: p.title,
      org: client.organizationName,
      items: items.map((d) => ({ title: d.title, length: d.vimeoLength ?? d.length })),
      thumbUrl: items.length === 1 ? items[0].vimeoThumb : undefined,
      portalUrl: `${SITE_URL}/portal/auth?token=${encodeURIComponent(token)}`,
      signOff: settings.signOff,
      producerPhone: producer?.phone,
      note: note || undefined,
    })
    try {
      const r = await sendEmail({ to: [c.email], bcc: settings.copyTo ? [settings.copyTo] : undefined, ...mail })
      if (r.ok) sent.push(c.email)
      else return json({ ok: false, error: 'email-off', message: 'Email isn’t set up, so nothing was sent.' }, 503)
    } catch (e) {
      console.error('[admin] review email failed', e)
      failed.push(c.email)
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  if (!sent.length) return json({ ok: false, error: 'failed', message: `The email didn’t go out (${failed.join(', ')}).` }, 502)

  const stamp = new Date().toISOString()
  for (const d of items) {
    const v = d.version || 1
    await updateDeliverableState(p._id, d._key, { readyVersion: v, readyAt: stamp, notifiedVersion: v, notifiedAt: stamp, remindedVersion: v })
  }
  const names = items.map((d) => d.title).join(', ')
  await addActivity(p._id, items.length === 1 ? `${names} is ready for review` : `${items.length} new versions are ready for review`, 'version')
  await addLog(p._id, `Review email sent to ${sent.join(', ')}: ${names}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`, 'email')
  return json({ ok: true, message: `Sent to ${sent.join(', ')}${failed.length ? `. Failed: ${failed.join(', ')}` : ''}.` })
}
