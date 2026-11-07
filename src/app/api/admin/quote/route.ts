import { SITE_URL } from '@/lib/site'
import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject } from '@/admin/data'
import { runStage } from '@/admin/stages'
import { signLinkToken } from '@/portal/auth'
import { getPortalSettings, portalClient, producerFor } from '@/portal/data'
import { quoteEmail, sendEmail } from '@/portal/email'
import { json } from '@/portal/http'
import { getQuote, quoteId, sha256, uploadAsset } from '@/portal/quotes'
import { randomBytes } from 'node:crypto'
import type { PortalClient } from '@/portal/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PDF = 4 * 1024 * 1024
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const amount = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''))
  return String(v ?? '').trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined
}

/** "Base, $9,420" or "The Story | 10200 | Adds a crafted edit": name, price, then an optional one-line note. */
function parseOptions(raw: string) {
  return raw
    .split('\n')
    .map((line) => {
      const m = /^(.+?)\s*[,|:–—-]\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:[,|:–—-]\s*(.+))?$/.exec(line.trim())
      const name = m?.[1].trim()
      const total = m ? Number(m[2].replace(/,/g, '')) : NaN
      const note = m?.[3]?.trim().slice(0, 80)
      return name && total > 0 ? { _key: randomBytes(4).toString('hex'), _type: 'quoteOption', name: name.slice(0, 60), total, ...(note ? { note } : {}) } : null
    })
    .filter(Boolean)
    .slice(0, 6)
}

/**
 * Form data: projectId, action = save | send | hide, and for save: file (PDF), total, deposit
 * (an amount, or a share like "30%"), options (packages, one per line), validUntil, summary,
 * includes (one per line). A signed quote is locked.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const form = await req.formData().catch(() => null)
  if (!form) return json({ ok: false, error: 'invalid' }, 400)
  const p = await getProject(text(form.get('projectId'), 200))
  if (!p) return json({ ok: false, error: 'not-found' }, 404)
  if (admin.sample) return json({ ok: true, sample: true })
  const doc = await getQuote(p._id)
  if (doc?.signature) return json({ ok: false, error: 'signed', message: 'This quote is signed, so it can’t be changed.' }, 409)
  const action = text(form.get('action'), 10)

  if (action === 'hide') {
    if (doc) await portalClient.patch(doc._id).unset(['sharedAt']).commit()
    await addLog(p._id, 'Quote hidden from the client', 'quote')
    return json({ ok: true })
  }

  if (action === 'save') {
    const file = form.get('file')
    const now = new Date().toISOString()
    const set: Record<string, unknown> = {
      summary: text(form.get('summary'), 600) || undefined,
      note: text(form.get('note'), 400) || undefined,
      includes: text(form.get('includes'), 3000).split('\n').map((l) => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 30),
      options: parseOptions(text(form.get('options'), 1000)),
      validUntil: /^\d{4}-\d{2}-\d{2}$/.test(text(form.get('validUntil'), 10)) ? text(form.get('validUntil'), 10) : undefined,
      updatedAt: now,
    }
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PDF) return json({ ok: false, error: 'too-big', message: 'The PDF is over 4 MB. Export it smaller and try again.' }, 400)
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return json({ ok: false, error: 'not-pdf', message: 'That file isn’t a PDF.' }, 400)
      const name = file.name.replace(/[\\/]/g, '_').slice(0, 160) || `${p.title}_Quote.pdf`
      Object.assign(set, { file: await uploadAsset('file', bytes, name, 'application/pdf'), fileName: name, fileHash: sha256(bytes), version: (doc?.version ?? 0) + 1 })
    } else if (!doc?.file) {
      return json({ ok: false, error: 'no-file', message: 'Add the quote PDF.' }, 400)
    }
    await portalClient.createIfNotExists({ _id: quoteId(p._id), _type: 'projectQuote', projectId: p._id, clientId: p.client._id, version: 0 })
    const patch = portalClient.patch(quoteId(p._id)).set({ ...Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined)), clientId: p.client._id })
    // "30%" keeps the deposit as a share of whichever package is chosen.
    const pct = /^\s*(\d{1,2}(?:\.\d+)?)\s*%\s*$/.exec(text(form.get('deposit'), 10))
    if (pct) set.depositPercent = Number(pct[1])
    const unset = (['summary', 'note', 'validUntil', 'depositPercent'] as const).filter((k) => set[k] === undefined)
    // A new PDF hasn't been opened yet.
    await (set.file ? patch.unset([...unset, 'viewedAt', 'viewedBy']) : patch.unset(unset)).commit()

    // The amounts live on the project, where the invoices read them.
    const options = set.options as { total: number }[]
    const money = {
      quoteAmount: amount(form.get('total')) ?? (options.length ? Math.min(...options.map((o) => o.total)) : undefined),
      depositAmount: pct ? undefined : amount(form.get('deposit')),
    }
    const moneySet = Object.fromEntries(Object.entries(money).filter(([, v]) => v !== undefined))
    if (Object.keys(moneySet).length) {
      await portalClient.patch(p._id).set(moneySet).commit()
      await portalClient.patch(`drafts.${p._id}`).set(moneySet).commit().catch(() => {})
    }
    await addLog(p._id, set.file ? `Quote v${set.version} uploaded` : 'Quote details updated', 'quote')
    if (form.get('send') !== '1') return json({ ok: true })
  } else if (action !== 'send') {
    return json({ ok: false, error: 'invalid' }, 400)
  }

  // Send: share it in the portal and email every contact.
  const fresh = await getQuote(p._id)
  if (!fresh?.file) return json({ ok: false, error: 'no-file', message: 'Add the quote PDF first.' }, 400)
  const client = (await portalClient.fetch<PortalClient | null>(`*[_id == $id][0]{_id, organizationName, contacts[]{_key, name, email, role, getsEmails}, producer, noGst}`, { id: p.client._id })) ?? null
  const to = (client?.contacts ?? []).filter((c) => c.email && c.getsEmails !== false)
  if (!client || !to.length) return json({ ok: false, error: 'no-contacts', message: `${p.client.organizationName} has no contacts yet. Add one in the Studio, then send.` }, 400)
  if (!p.slug) return json({ ok: false, error: 'no-slug', message: 'The project needs a portal address (slug) in the Studio.' }, 400)

  const now = new Date().toISOString()
  const again = Boolean(fresh.sharedAt || fresh.lastSentAt)
  await portalClient.patch(fresh._id).setIfMissing({ sharedAt: now }).set({ lastSentAt: now }).commit()
  if (p.pipelineStage === 'lead') await runStage(p, 'quoted').catch((e) => console.error('[admin] move to quoted failed', e))

  const settings = await getPortalSettings()
  const producer = producerFor({ client }, settings)
  const sent: string[] = []
  const failed: string[] = []
  for (const c of to) {
    const token = await signLinkToken(c.email.toLowerCase(), `/portal/quotes/${p.slug}`, 7 * 24 * 60)
    const mail = quoteEmail({
      name: c.name.split(' ')[0], projectTitle: p.title, org: client.organizationName, from: Boolean(fresh.options?.length),
      total: fresh.options?.length ? Math.min(...fresh.options.map((o) => o.total)) : amount(form.get('total')) ?? p.quoteAmount,
      validUntil: fresh.validUntil ? new Date(`${fresh.validUntil}T12:00:00Z`).toLocaleDateString('en-CA', { dateStyle: 'long', timeZone: 'UTC' }) : undefined,
      again, portalUrl: `${SITE_URL}/portal/auth?token=${encodeURIComponent(token)}`, signOff: settings.signOff, producerPhone: producer?.phone, note: fresh.note || undefined, noGst: Boolean(client.noGst),
    })
    try {
      const r = await sendEmail({ to: [c.email], bcc: settings.copyTo ? [settings.copyTo] : undefined, ...mail })
      ;(r.ok ? sent : failed).push(c.name)
    } catch (e) {
      console.error('[admin] quote email failed', e)
      failed.push(c.name)
    }
  }
  await addLog(p._id, `Quote v${fresh.version} ${again ? 'sent again' : 'sent'} to ${sent.join(', ') || 'nobody'}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`, 'quote')
  return json({ ok: true, sent, failed })
}
