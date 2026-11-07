import { after } from 'next/server'
import { SITE_URL } from '@/lib/site'
import { addLog, getProject } from '@/admin/data'
import { runStage, stageIndex } from '@/admin/stages'
import { getSession } from '@/portal/auth'
import { portalEnv } from '@/portal/config'
import { addActivity, getAccess, getPortalSettings, portalClient, producerFor } from '@/portal/data'
import { notifyJosh, sendEmail, signedEmail } from '@/portal/email'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'
import { quoteDeposit, today } from '@/portal/library'
import { createPayment } from '@/portal/payments'
import { assetBytes, buildSignedPdf, fmtMoment, getQuote, newCertificateId, quoteExpired, sha256, uploadAsset } from '@/portal/quotes'

export const runtime = 'nodejs'
export const maxDuration = 60

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * { project: slug, version, option? (package key), name, title, method: 'typed' | 'drawn', typed?, image?: PNG data URL, agree: true }
 * Signs the shared quote: certificate page, signed copy stored, then (after the reply)
 * the project is booked and both sides get the signed PDF by email.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403)
  const session = await getSession()
  if (!session) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (session.demo) return json({ ok: true, demo: true, at: new Date().toISOString() })
  if (session.preview) return json({ ok: false, error: 'preview' }, 403)
  if (limited(`sign:${session.email}`, 10, 60 * 60_000)) return json({ ok: false, error: 'too-many' }, 429)

  const access = await getAccess(session)
  const q = access.quotes.find((x) => x.slug === body.project)
  if (!q) return json({ ok: false }, 404)
  if (q.signature) return json({ ok: false, error: 'already-signed' }, 409)
  if (Number(body.version) !== q.version) return json({ ok: false, error: 'changed' }, 409)
  if (quoteExpired(q, today())) return json({ ok: false, error: 'expired' }, 410)

  const name = clean(body.name, 100)
  const title = clean(body.title, 100)
  const method = body.method === 'drawn' ? 'drawn' : 'typed'
  const typed = clean(body.typed, 100) || name
  if (name.length < 2 || body.agree !== true) return json({ ok: false, error: 'invalid' }, 400)
  // With packages, one must be chosen; its price becomes the project's total.
  const option = q.options?.length ? q.options.find((o) => o._key === body.option) : undefined
  if (q.options?.length && !option) return json({ ok: false, error: 'invalid' }, 400)
  const total = option?.total ?? q.total
  const deposit = quoteDeposit(total, q)
  let image: Uint8Array | undefined
  if (method === 'drawn') {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image ?? ''))
    if (!m || m[1].length > 400_000) return json({ ok: false, error: 'invalid' }, 400)
    image = Buffer.from(m[1], 'base64')
  }

  const doc = await getQuote(q.projectId)
  if (!doc?.file || !doc.fileHash || doc.signature || !doc.sharedAt) return json({ ok: false, error: 'changed' }, 409)
  const original = await assetBytes(doc.file.asset._ref)
  // The file must be the one that was shared, byte for byte.
  if (sha256(original) !== doc.fileHash) {
    console.error('[portal] quote file fingerprint mismatch', q.projectId)
    return json({ ok: false, error: 'failed' }, 500)
  }

  const at = new Date().toISOString()
  const certificateId = newCertificateId()
  const signer = { name, title: title || undefined, email: session.email }
  const fileName = doc.fileName || `${q.title} quote.pdf`
  let signed: Uint8Array
  try {
    signed = await buildSignedPdf({
      original, fileName, projectTitle: q.title, org: q.org, version: doc.version, option: option?.name, total, deposit, docHash: doc.fileHash,
      signer, method, typed, image, at, ip: ipOf(req), userAgent: req.headers.get('user-agent') ?? 'unknown', sharedAt: doc.sharedAt, viewedAt: doc.viewedAt, certificateId,
    })
  } catch (e) {
    console.error('[portal] signing failed', e)
    return json({ ok: false, error: 'failed' }, 500)
  }
  const signedName = fileName.replace(/\.pdf$/i, '') + '_Signed.pdf'
  const [signedFile, imageRef] = await Promise.all([
    uploadAsset('file', signed, signedName, 'application/pdf'),
    image ? uploadAsset('image', image, 'signature.png', 'image/png') : Promise.resolve(undefined),
  ])
  try {
    // Only if nobody signed or changed the quote since we read it.
    await portalClient
      .patch(doc._id)
      .ifRevisionId(doc._rev)
      .set({
        signature: {
          ...signer, org: q.org, at, method, typed: method === 'typed' ? typed : undefined, image: imageRef, ip: ipOf(req),
          userAgent: (req.headers.get('user-agent') ?? 'unknown').slice(0, 300), version: doc.version, docHash: doc.fileHash,
          option: option?.name, total, deposit, certificateId, signedFile, signedHash: sha256(signed),
        },
      })
      .commit()
  } catch {
    return json({ ok: false, error: 'changed' }, 409)
  }

  // The client gets their answer now; booking and emails carry on in the background.
  // Clients who pay in the portal get the deposit to pay right away.
  const payer = access.clients.find((c) => c._id === doc.clientId)
  // Paying the deposit in the portal is what books the project (see bookOnDeposit).
  const waitForDeposit = Boolean(payer?.portalPayments && deposit && deposit > 0)
  if (waitForDeposit && payer && deposit) {
    await createPayment({ projectId: q.projectId, clientId: payer._id, kind: 'deposit', label: 'Deposit', amount: deposit }).catch((e) => console.error('[portal] deposit request failed', e))
  }

  after(async () => {
    const when = fmtMoment(at)
    await addActivity(q.projectId, `${name} signed the quote`, 'approved')
    await addLog(q.projectId, `Quote v${doc.version} signed by ${name}${title ? `, ${title}` : ''}`, 'quote')

    // The signed amounts become the project's, so the deposit and final invoices match.
    const money = Object.fromEntries(Object.entries({ quoteAmount: total, depositAmount: deposit }).filter(([, v]) => v !== undefined))
    if (Object.keys(money).length) {
      await portalClient.patch(q.projectId).set(money).commit().catch((e) => console.error('[portal] amounts not saved', e))
      await portalClient.patch(`drafts.${q.projectId}`).set(money).commit().catch(() => {})
    }

    let booked = q.pipelineStage ? stageIndex(q.pipelineStage) >= stageIndex('booked') : false
    const steps: string[] = []
    try {
      const p = await getProject(q.projectId)
      if (p && !waitForDeposit && stageIndex(p.pipelineStage) < stageIndex('booked')) {
        const results = await runStage(p, 'booked')
        booked = true
        steps.push(...results.map((r) => `${r.ok ? '✓' : '✗'} ${r.message}`))
        await portalClient.patch(doc._id).set({ bookedAt: new Date().toISOString() }).commit().catch(() => {})
      }
    } catch (e) {
      steps.push(`✗ Moving to Booked failed: ${String(e).slice(0, 160)}`)
    }

    const settings = await getPortalSettings()
    const client = access.clients.find((c) => c._id === doc.clientId)
    const producer = client ? producerFor({ client }, settings) : settings.producer
    const attachments = [{ filename: signedName, content: signed }]
    try {
      await sendEmail({
        to: [session.email],
        ...signedEmail({
          name: name.split(' ')[0], projectTitle: q.title, org: q.org, at: when, deposit, booked,
          portalUrl: `${SITE_URL}/portal/quotes/${q.slug}${payer?.portalPayments ? '#billing' : ''}`, signOff: settings.signOff, producerPhone: producer?.phone, payInPortal: waitForDeposit, noGst: Boolean(payer?.noGst),
        }),
        attachments,
      })
    } catch (e) {
      console.error('[portal] signed email to client failed', e)
    }
    const line = `${name}${title ? ` (${title})` : ''} signed the quote for ${q.title} · ${q.org}${option ? `, choosing ${option.name}` : ''}.`
    const admin = `${SITE_URL}/admin/projects/${q.projectId}`
    await notifyJosh(`✍️ ${esc(line)} ${admin}`)
    await sendEmail({
      to: [portalEnv.replyTo],
      subject: `Signed: ${q.title} · ${q.org}`,
      text: `${line}\n\nSigned ${when} by ${session.email}. The signed PDF is attached.${waitForDeposit ? ' The project is booked once the deposit is paid.' : ''}\n\n${steps.length ? `Booking:\n${steps.join('\n')}\n\n` : ''}${admin}`,
      html: `<p>${esc(line)}</p><p>Signed ${esc(when)} by ${esc(session.email)}. The signed PDF is attached.${waitForDeposit ? ' The project is booked once the deposit is paid.' : ''}</p>${steps.length ? `<p><strong>Booking</strong><br>${steps.map(esc).join('<br>')}</p>` : ''}<p><a href="${admin}">Open the project</a></p>`,
      attachments,
    }).catch((e) => console.error('[portal] signed email to Josh failed', e))
  })

  return json({ ok: true, at, certificateId })
}
