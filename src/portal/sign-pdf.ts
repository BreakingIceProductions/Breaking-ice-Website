import 'server-only'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { COPPER, fmtMoment, font, MUTED, NAVY, RULE, safeText, wrap } from './quotes'
import { BLANK, choiceBlank, fillText, type DocField, type SignRecord, type SignRequest } from './sign-docs'

/**
 * The PDF of a document to sign, made the same way as the signed quote (quotes.ts):
 * pdf-lib, the brand fonts, and a certificate of electronic signature at the end.
 * Blank: the wording with empty lines to fill by hand. Signed: the exact text signed, then the record.
 */

/** Choices read as tick boxes in the PDF, the chosen one marked. */
function forPdf(fields: DocField[], values: Record<string, string>) {
  const out: Record<string, string> = { ...values }
  for (const f of fields) {
    if (f.type !== 'choice' || !f.options?.length) continue
    const v = values[f.key]
    out[f.key] = v ? f.options.map((o) => `${o === v ? '[X]' : '[  ]'} ${o}`).join('   ') : choiceBlank(f)
  }
  return out
}

type Input = {
  title: string
  body: string
  fields: DocField[]
  values: Record<string, string>
  /** For the certificate. */
  request?: SignRequest
  signed?: SignRecord
}

export async function buildDocPdf(c: Input) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(c.title)
  pdf.setProducer('Breaking Ice Productions')
  const [reg, bold, script] = await Promise.all([
    font('Archivo-Regular.ttf').then((b) => pdf.embedFont(b, { subset: true })),
    font('Archivo-SemiBold.ttf').then((b) => pdf.embedFont(b, { subset: true })),
    font('DancingScript-Medium.ttf').then((b) => pdf.embedFont(b, { subset: true })),
  ])

  const W = 612
  const H = 792
  const M = 56
  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M
  const room = (h: number) => {
    if (y - h < M + 20) {
      page = pdf.addPage([W, H])
      y = H - M
    }
  }
  const text = (s: string, o: { f?: PDFFont; size?: number; color?: RGB; x?: number; width?: number; gap?: number } = {}) => {
    const f = o.f ?? reg
    const size = o.size ?? 10.5
    for (const line of wrap(f, size, safeText(f, s), o.width ?? W - M * 2 - (o.x ?? 0))) {
      room(size * 1.5)
      page.drawText(line, { x: M + (o.x ?? 0), y: y - size, size, font: f, color: o.color ?? NAVY })
      y -= size * 1.5
    }
    y -= o.gap ?? 0
  }
  const rule = () => {
    room(20)
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE })
    y -= 16
  }
  const row = (label: string, value: string, f: PDFFont = reg) => {
    room(28)
    const top = y
    text(label, { size: 9, color: MUTED, width: 130 })
    const after = y
    y = top
    text(value, { f, size: 10, x: 140 })
    y = Math.min(y, after) - 4
  }

  text('BREAKING ICE PRODUCTIONS', { f: bold, size: 8, color: COPPER, gap: 6 })
  text(c.title, { f: bold, size: 20, gap: 4 })
  if (c.request?.projectTitle) text(`${c.request.projectTitle}${c.request.org ? ` · ${c.request.org}` : ''}`, { size: 9, color: MUTED })
  y -= 10
  rule()

  const filled = fillText(c.body, c.fields, forPdf(c.fields, c.values))
  for (const para of filled.split('\n\n')) text(para, { gap: 8 })

  if (!c.signed) {
    // Blank copy: lines to fill in by hand.
    y -= 18
    for (const label of ['Full name', 'Signature', 'Date']) {
      room(40)
      page.drawText(label, { x: M, y: y - 9, size: 9, font: reg, color: MUTED })
      page.drawLine({ start: { x: M + 140, y: y - 12 }, end: { x: W - M, y: y - 12 }, thickness: 0.75, color: NAVY })
      y -= 36
    }
    return pdf.save()
  }

  // The record of signing, on its own page.
  const s = c.signed
  const r = c.request
  page = pdf.addPage([W, H])
  y = H - M
  text('BREAKING ICE PRODUCTIONS', { f: bold, size: 8, color: COPPER, gap: 6 })
  text('Certificate of electronic signature', { f: bold, size: 20, gap: 4 })
  text(`Certificate ${s.certificateId}`, { size: 9, color: MUTED, gap: 14 })
  rule()

  text('Document', { f: bold, size: 11, gap: 6 })
  row('Title', c.title)
  if (r?.projectTitle) row('Project', r.projectTitle)
  if (r?.org && r.audience === 'client') row('Client', r.org)
  row('Fingerprint (SHA-256)', s.docHash)
  y -= 8
  rule()

  text('Signed by', { f: bold, size: 11, gap: 6 })
  row('Name', s.name, bold)
  if (s.forMinor) row('Signing for', `A minor${s.values.minor_name ? `: ${s.values.minor_name}` : ''}`)
  if (r) row('Sent to', `${r.recipient.name} · ${r.recipient.email}`)
  row(
    'How',
    s.via === 'portal'
      ? `Signed in to the Breaking Ice client portal as ${s.portalEmail} (confirmed with a one-time link or code sent to that address)`
      : 'Opened from a private signing link sent to the address above',
  )
  row('Signed', fmtMoment(s.at))
  row('IP address', s.ip)
  row('Device', s.userAgent.slice(0, 160))

  y -= 6
  room(60)
  page.drawText('Signature', { x: M, y: y - 9, size: 9, font: reg, color: MUTED })
  const boxTop = y
  const f = safeText(script, s.name) === s.name.normalize('NFC') ? script : reg
  page.drawText(safeText(f, s.name), { x: M + 140, y: boxTop - 30, size: 28, font: f, color: NAVY })
  y = boxTop - 40
  page.drawLine({ start: { x: M + 140, y }, end: { x: W - M, y }, thickness: 0.75, color: NAVY })
  y -= 12
  text('Typed by the signer', { size: 8, color: MUTED, x: 140, gap: 10 })
  rule()

  text('Record', { f: bold, size: 11, gap: 6 })
  if (r?.createdAt) row('Sent', fmtMoment(r.createdAt))
  if (r?.viewedAt) row('First opened', fmtMoment(r.viewedAt))
  row('Signer agreed to', `“${s.consent}”`)
  y -= 8
  text('The fingerprint identifies the exact text that was signed: any change to it gives a different fingerprint. Breaking Ice keeps this signed copy with the project.', { size: 8, color: MUTED })

  return pdf.save()
}

/** Blank fields, for previews of a template before anything is filled in. */
export const blankValues = (fields: DocField[]) => Object.fromEntries(fields.filter((f) => f.default).map((f) => [f.key, f.default!])) as Record<string, string>
export { BLANK }
