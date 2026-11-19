import 'server-only'
import { createHash } from 'node:crypto'
import { addLog } from '@/admin/data'
import type { OfficeProject } from '@/admin/types'
import { SITE_URL } from '@/lib/site'
import { signLinkToken } from './auth'
import { portalEnv } from './config'
import { addActivity, getPortalSettings, getProjectById, producerFor } from './data'
import { saveSignedCopy } from './drive'
import { notifyJosh, sendEmail, toSignEmail } from './email'
import { fmtMoment, newCertificateId } from './quotes'
import { asked, ESIGN_CONSENT, fillText, KIND, sendable, type DocField, type DocTemplate, type SignRecord, type SignRequest } from './sign-docs'
import { buildDocPdf } from './sign-pdf'
import { completeSignature, createRequest, getRequest, markEmailed, memoryMode, setDriveFile, signedName } from './sign-store'

/**
 * Sending a document and signing it. Sending never emails on its own: "Create and copy link"
 * makes the request; "Create and email" (or "Email again") sends one email when the owner presses it.
 * In sample mode nothing leaves the server: emails are simulated and the PDF is kept in memory.
 */

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/** Where the signer opens it: a client's document in their portal, anyone else's on its own private link. */
export const signerUrl = (r: Pick<SignRequest, '_id' | 'token' | 'audience'>) => (r.audience === 'client' ? `${SITE_URL}/portal/documents/${r._id}` : `${SITE_URL}/sign/${r.token}`)

/** One value checked against its field. Returns the cleaned value, '' for empty, or null if it's not allowed. */
function checkValue(f: DocField, raw: unknown): string | null {
  const v = clean(raw, f.type === 'text' ? 300 : 120)
  if (!v) return ''
  if (f.type === 'choice') return f.options?.includes(v) ? v : null
  if (f.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  if (f.type === 'money') {
    const n = Number(v.replace(/[$,\s]/g, ''))
    return Number.isFinite(n) && n >= 0 ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null
  }
  return v
}

export type SendInput = {
  template: DocTemplate
  project?: OfficeProject
  values: Record<string, unknown>
  recipient: { contactKey?: string; name?: string; email?: string }
}

/** Checks everything and makes the request. Errors are sentences for the owner. */
export async function createSignRequest(input: SendInput): Promise<{ ok: true; request: SignRequest } | { ok: false; message: string }> {
  const t = input.template
  if (!sendable(t)) return { ok: false, message: 'This document can’t be sent yet: it needs wording, every {{field}} set up, and “Approve wording”.' }
  const p = input.project
  if (!p && !KIND[t.kind].projectOptional) return { ok: false, message: 'Pick the project this is for.' }

  const values: Record<string, string> = {}
  for (const f of t.fields.filter((x) => x.who === 'owner')) {
    const v = checkValue(f, input.values[f.key] ?? f.default)
    if (v === null) return { ok: false, message: `“${f.label}” isn’t valid.` }
    if (!v) return { ok: false, message: `Fill in “${f.label}” first.` }
    values[f.key] = v
  }
  if (p) {
    values.project = p.title
    if (p.client._id) values.client = p.client.organizationName
  }

  let recipient: SignRequest['recipient']
  if (t.audience === 'client') {
    if (!p?.client._id) return { ok: false, message: 'A client document needs a project with a client.' }
    const c = (p.client.contacts ?? []).find((x) => x._key === input.recipient.contactKey)
    if (!c?.email) return { ok: false, message: 'Pick one of the client’s contacts.' }
    recipient = { name: c.name, email: c.email.toLowerCase(), contactKey: c._key }
  } else {
    const name = clean(input.recipient.name, 100)
    const email = clean(input.recipient.email, 200).toLowerCase()
    if (name.length < 2) return { ok: false, message: 'Type the signer’s name.' }
    if (!validEmail(email)) return { ok: false, message: 'Type the signer’s email address.' }
    recipient = { name, email }
  }

  const request = await createRequest({
    templateId: t._id,
    kind: t.kind,
    audience: t.audience,
    snapshot: { title: t.title, body: t.body, fields: t.fields },
    ...(p && { projectId: p._id, projectTitle: p.title, projectSlug: p.slug, clientId: p.client._id || undefined, org: p.client.organizationName }),
    recipient,
    values,
  })
  if (p) await addLog(p._id, `${t.title} created for ${recipient.name} to sign`, 'document')
  return { ok: true, request }
}

/** The "To sign" email, one send. Simulated in sample mode. */
export async function emailSignRequest(r: SignRequest): Promise<{ ok: true; simulated?: boolean } | { ok: false; message: string }> {
  if (r.status === 'signed' || r.status === 'void') return { ok: false, message: 'This one is already signed or withdrawn.' }
  if (memoryMode()) {
    await markEmailed(r._id)
    return { ok: true, simulated: true }
  }
  const settings = await getPortalSettings()
  const project = r.projectId ? await getProjectById(r.projectId) : null
  const producer = project ? producerFor(project, settings) : settings.producer
  const url =
    r.audience === 'client'
      ? `${SITE_URL}/portal/auth?token=${encodeURIComponent(await signLinkToken(r.recipient.email, `/portal/documents/${r._id}`, 7 * 24 * 60))}`
      : signerUrl(r)
  const mail = toSignEmail({
    name: r.recipient.name.split(' ')[0],
    title: r.snapshot.title,
    projectTitle: r.audience === 'client' ? r.projectTitle : undefined,
    org: r.audience === 'client' ? r.org : undefined,
    url,
    portal: r.audience === 'client',
    signOff: settings.signOff,
    producerPhone: producer?.phone,
  })
  try {
    const sent = await sendEmail({ to: [r.recipient.email], bcc: settings.copyTo ? [settings.copyTo] : undefined, ...mail })
    if (!sent.ok) return { ok: false, message: 'Email isn’t set up on this site, so nothing was sent. Copy the link instead.' }
  } catch (e) {
    console.error('[sign] email failed', e)
    return { ok: false, message: 'The email didn’t go. Try again, or copy the link.' }
  }
  await markEmailed(r._id)
  if (r.projectId) await addLog(r.projectId, `${r.snapshot.title} emailed to ${r.recipient.name} to sign`, 'document')
  return { ok: true }
}

export type SignInput = {
  name: unknown
  values: Record<string, unknown>
  forMinor: unknown
  agree: unknown
  ip: string
  userAgent: string
  /** Set when signing inside the client portal. */
  portalEmail?: string
}

/** Validates and records a signature, makes the signed PDF, then (after the reply) files it and tells the owner. */
export async function signDocument(r: SignRequest & { _rev?: string }, s: SignInput) {
  if (r.status === 'signed') return { ok: false as const, error: 'already-signed' }
  if (r.status === 'void') return { ok: false as const, error: 'withdrawn' }
  const name = clean(s.name, 100)
  if (name.length < 2 || s.agree !== true) return { ok: false as const, error: 'invalid' }
  const fields = r.snapshot.fields
  const hasMinor = fields.some((f) => f.minor)
  const forMinor = hasMinor && s.forMinor === true

  const mine: Record<string, string> = {}
  for (const f of fields.filter((x) => asked(x, forMinor))) {
    const v = checkValue(f, s.values?.[f.key])
    if (v === null || (!v && !f.optional)) return { ok: false as const, error: 'invalid', field: f.key }
    if (v) mine[f.key] = v
  }

  const values = { ...r.values, ...mine, signer_name: name }
  const signedText = `${r.snapshot.title}\n\n${fillText(r.snapshot.body, fields, values)}`
  const record: SignRecord = {
    name,
    at: new Date().toISOString(),
    ip: s.ip,
    userAgent: s.userAgent.slice(0, 300),
    consent: ESIGN_CONSENT,
    values: mine,
    ...(forMinor && { forMinor: true }),
    via: s.portalEmail ? 'portal' : 'link',
    ...(s.portalEmail && { portalEmail: s.portalEmail }),
    docHash: createHash('sha256').update(signedText).digest('hex'),
    certificateId: newCertificateId(),
  }
  const viewed = r.viewedAt ? r : { ...r, viewedAt: record.at }
  const pdf = await buildDocPdf({ title: r.snapshot.title, body: r.snapshot.body, fields, values, request: viewed, signed: record })
  const filename = signedName({ ...r, signature: record })
  if (!(await completeSignature(r, record, pdf, filename))) return { ok: false as const, error: 'changed' }
  return { ok: true as const, record, pdf, filename }
}

/** After the reply: file the PDF in Drive, log it, and tell the owner (Slack and email). Nothing in sample mode. */
export async function afterSigning(id: string, pdf: Uint8Array, filename: string) {
  const r = await getRequest(id)
  if (!r?.signature) return
  const by = r.signature.name
  const title = r.snapshot.title
  if (memoryMode()) {
    console.info(`[sign] sample mode: would notify "Signed: ${title} by ${by}" and file ${filename} in ${r.audience === 'client' ? 'Contract' : 'Releases'}`)
    return
  }
  if (r.projectId) {
    const project = await getProjectById(r.projectId).catch(() => null)
    if (project?.driveFolderId) {
      try {
        const fileId = await saveSignedCopy(project.driveFolderId, r.audience === 'client' ? 'Contract' : 'Releases', filename, pdf)
        if (fileId) await setDriveFile(r._id, fileId)
      } catch (e) {
        console.error('[sign] Drive copy failed', e)
      }
    }
    await addLog(r.projectId, `${title} signed by ${by}`, 'document')
    if (r.audience === 'client') await addActivity(r.projectId, `${by} signed ${title}`, 'approved')
  }
  const admin = r.projectId ? `${SITE_URL}/admin/projects/${r.projectId}?tab=documents` : `${SITE_URL}/admin/library?tab=out`
  const line = `Signed: ${title} by ${by}${r.projectTitle ? ` · ${r.projectTitle}` : ''}`
  await notifyJosh(`✍️ ${line} ${admin}`)
  await sendEmail({
    to: [portalEnv.replyTo],
    subject: `Signed: ${title} by ${by}`,
    text: `${line}.\n\nSigned ${fmtMoment(r.signature.at)}. Sent to ${r.recipient.name} (${r.recipient.email}). The signed PDF is attached.\n\n${admin}`,
    html: `<p>${esc(line)}.</p><p>Signed ${esc(fmtMoment(r.signature.at))}. Sent to ${esc(r.recipient.name)} (${esc(r.recipient.email)}). The signed PDF is attached.</p><p><a href="${admin}">Open it in the back office</a></p>`,
    attachments: [{ filename, content: pdf }],
  }).catch((e) => console.error('[sign] owner email failed', e))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
