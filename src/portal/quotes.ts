import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { projectId as sanityProject } from '@/sanity/env'
import { portalEnv } from './config'
import { PORTAL_DATASET, portalClient } from './data'
import type { PortalQuote, QuoteOption, QuoteSignature } from './types'

/**
 * Quotes and signing. Each project has at most one quote record, "quote-<project id>",
 * written only by the back office and the signing route (never edited in the Studio).
 * Clients see it once it's shared; signing it stamps a certificate page onto the PDF,
 * stores the signed copy, and books the project.
 */

export const quoteId = (projectId: string) => `quote-${projectId}`

type AssetRef = { _type: string; asset: { _type: 'reference'; _ref: string } }

/** The full record, server side only. */
export type QuoteDoc = {
  _id: string
  _rev: string
  projectId: string
  clientId: string
  version: number
  file?: AssetRef
  fileName?: string
  fileHash?: string
  summary?: string
  note?: string
  includes?: string[]
  options?: QuoteOption[]
  depositPercent?: number
  validUntil?: string
  updatedAt?: string
  sharedAt?: string
  lastSentAt?: string
  viewedAt?: string
  viewedBy?: string
  signature?: QuoteSignature & {
    email: string
    typed?: string
    image?: AssetRef
    ip: string
    userAgent: string
    version: number
    docHash: string
    signedFile: AssetRef
    signedHash: string
  }
  bookedAt?: string
}

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

/** Asset bytes, fetched with the token so it works whatever the dataset's asset privacy. */
export async function assetBytes(ref: string) {
  const m = /^(file|image)-([a-f0-9]+)(?:-(\d+x\d+))?-(\w+)$/.exec(ref)
  if (!m) throw new Error(`bad asset ref ${ref}`)
  const [, kind, hash, dims, ext] = m
  const url = `https://cdn.sanity.io/${kind === 'file' ? 'files' : 'images'}/${sanityProject}/${PORTAL_DATASET}/${hash}${dims ? `-${dims}` : ''}.${ext}`
  const res = await fetch(url, { headers: portalEnv.sanityToken ? { Authorization: `Bearer ${portalEnv.sanityToken}` } : {}, cache: 'no-store' })
  if (!res.ok) throw new Error(`asset ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function uploadAsset(kind: 'file' | 'image', bytes: Uint8Array, filename: string, contentType: string): Promise<AssetRef> {
  const a = await portalClient.assets.upload(kind, Buffer.from(bytes), { filename, contentType })
  return { _type: kind, asset: { _type: 'reference', _ref: a._id } }
}

export async function getQuote(projectId: string) {
  return portalClient.getDocument<QuoteDoc>(quoteId(projectId))
}

const CLIENT_QUOTE_FIELDS = `projectId, version, fileName, summary, note, includes, options, depositPercent, validUntil, sharedAt,
  "signature": signature{name, title, org, at, method, option, total, deposit, certificateId},
  "p": *[_type == "clientProject" && _id == ^.projectId][0]{title, "slug": slug.current, pipelineStage, quoteAmount, depositAmount, "org": client->organizationName, "noGst": client->noGst}`

type RawClientQuote = Omit<PortalQuote, 'slug' | 'title' | 'org' | 'pipelineStage' | 'total' | 'deposit'> & {
  p?: { title: string; slug?: string; pipelineStage?: string; quoteAmount?: number; depositAmount?: number; org?: string; noGst?: boolean } | null
}

/** Shared quotes for these clients, newest first. The back office's preview also sees ones not sent yet. */
export async function quotesForClients(clientIds: string[], unsent = false): Promise<PortalQuote[]> {
  const rows = await portalClient.fetch<RawClientQuote[]>(
    `*[_type == "projectQuote" && clientId in $ids && (defined(sharedAt) || $unsent) && defined(file)] | order(coalesce(sharedAt, updatedAt) desc){${CLIENT_QUOTE_FIELDS}}`,
    { ids: clientIds, unsent },
    { cache: 'no-store' },
  )
  return rows
    .filter((r) => r.p?.slug)
    .map(({ p, ...r }) => ({
      ...r,
      sharedAt: r.sharedAt ?? '',
      slug: p!.slug!,
      title: p!.title,
      org: p!.org ?? '',
      pipelineStage: p!.pipelineStage,
      // Once signed, the amounts are the ones that were signed.
      total: r.signature?.total ?? p!.quoteAmount,
      deposit: r.signature?.deposit ?? p!.depositAmount,
      signature: r.signature ?? undefined,
      options: r.options ?? undefined,
      depositPercent: r.depositPercent ?? undefined,
      noGst: Boolean(p!.noGst),
    }))
}

export const quoteExpired = (q: Pick<PortalQuote, 'validUntil' | 'signature'>, today: string) => Boolean(!q.signature && q.validUntil && q.validUntil < today)

/** First time the client opens it. Only the first view is kept. */
export async function markQuoteViewed(projectId: string, who: string) {
  const at = new Date().toISOString()
  const r = await portalClient.patch(quoteId(projectId)).setIfMissing({ viewedAt: at, viewedBy: who }).commit<QuoteDoc>()
  return r.viewedAt === at
}

/* ── The signed PDF ─────────────────────────────────────────────────── */

const font = (name: string) => readFile(path.join(process.cwd(), 'src/portal/fonts', name))

const NAVY = rgb(0.094, 0.125, 0.184)
const MUTED = rgb(0.29, 0.33, 0.41)
const COPPER = rgb(0.79, 0.47, 0.25)
const RULE = rgb(0.9, 0.88, 0.85)

/** Drops characters a font can't draw, so an unusual name never breaks the PDF. */
function safeText(f: PDFFont, s: string) {
  const ok = new Set(f.getCharacterSet())
  return [...s.normalize('NFC')].filter((ch) => ok.has(ch.codePointAt(0)!) || ch === ' ').join('')
}

function wrap(f: PDFFont, size: number, text: string, width: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      // Very long words (hashes, agents) break anywhere.
      let w = word
      while (f.widthOfTextAtSize(w, size) > width) {
        let i = w.length
        while (i > 1 && f.widthOfTextAtSize(w.slice(0, i), size) > width) i--
        if (line) lines.push(line)
        line = ''
        lines.push(w.slice(0, i))
        w = w.slice(i)
      }
      const next = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = w
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

export const fmtMoment = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'long', timeStyle: 'long' })

const cad = (n?: number) => (n || n === 0 ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')

export const CONSENT =
  'I have read this quote and agree to its terms. I agree to sign electronically, and that my electronic signature is as binding as a handwritten one.'

type CertInput = {
  original: Uint8Array
  fileName: string
  projectTitle: string
  org: string
  version: number
  option?: string
  total?: number
  deposit?: number
  docHash: string
  signer: { name: string; title?: string; email: string }
  method: 'typed' | 'drawn'
  typed?: string
  image?: Uint8Array
  at: string
  ip: string
  userAgent: string
  sharedAt?: string
  viewedAt?: string
  certificateId: string
}

/** The original quote, a small "signed" line on every page, and a certificate page at the end. */
export async function buildSignedPdf(c: CertInput) {
  const pdf = await PDFDocument.load(c.original, { ignoreEncryption: true, updateMetadata: false })
  pdf.registerFontkit(fontkit)
  const [reg, bold, script] = await Promise.all([
    font('Archivo-Regular.ttf').then((b) => pdf.embedFont(b, { subset: true })),
    font('Archivo-SemiBold.ttf').then((b) => pdf.embedFont(b, { subset: true })),
    font('DancingScript-Medium.ttf').then((b) => pdf.embedFont(b, { subset: true })),
  ])
  const pages = pdf.getPages()
  const stamp = safeText(reg, `Signed electronically by ${c.signer.name} · ${fmtMoment(c.at)} · Certificate ${c.certificateId}`)
  for (const page of pages) {
    const box = page.getCropBox()
    page.drawText(stamp, { x: box.x + 18, y: box.y + 10, size: 6.5, font: reg, color: MUTED })
  }

  const W = 612
  const H = 792
  const M = 56
  const page: PDFPage = pdf.addPage([W, H])
  let y = H - M
  const text = (s: string, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) => {
    const f = o.f ?? reg
    const size = o.size ?? 10
    for (const line of wrap(f, size, safeText(f, s), o.width ?? W - M * 2 - (o.x ?? 0))) {
      page.drawText(line, { x: M + (o.x ?? 0), y: y - size, size, font: f, color: o.color ?? NAVY })
      y -= size * 1.45
    }
    y -= o.gap ?? 0
  }
  const rule = () => {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE })
    y -= 16
  }
  const row = (label: string, value: string, f: PDFFont = reg) => {
    const top = y
    text(label, { size: 9, color: MUTED, width: 130 })
    const after = y
    y = top
    text(value, { f, size: 10, x: 140 })
    y = Math.min(y, after) - 4
  }

  text('BREAKING ICE PRODUCTIONS', { f: bold, size: 8, color: COPPER, gap: 6 })
  text('Certificate of electronic signature', { f: bold, size: 20, gap: 4 })
  text(`Certificate ${c.certificateId}`, { size: 9, color: MUTED, gap: 14 })
  rule()

  text('Document', { f: bold, size: 11, gap: 6 })
  row('Quote', `${c.fileName} (version ${c.version}, ${pages.length} page${pages.length === 1 ? '' : 's'})`)
  row('Project', c.projectTitle)
  row('Client', c.org)
  if (c.option) row('Package chosen', c.option, bold)
  if (c.total) row('Total, before tax', cad(c.total))
  if (c.deposit) row('Deposit', cad(c.deposit))
  row('Fingerprint (SHA-256)', c.docHash)
  y -= 8
  rule()

  text('Signed by', { f: bold, size: 11, gap: 6 })
  row('Name', c.signer.name, bold)
  if (c.signer.title) row('Title', c.signer.title)
  row('Organization', c.org)
  row('Email', `${c.signer.email} (confirmed by signing in with a one-time link or code sent to this address)`)
  row('Signed', fmtMoment(c.at))
  row('IP address', c.ip)
  row('Device', c.userAgent.slice(0, 160))

  // The signature itself.
  y -= 6
  page.drawText('Signature', { x: M, y: y - 9, size: 9, font: reg, color: MUTED })
  const boxTop = y
  if (c.method === 'drawn' && c.image) {
    const img = await pdf.embedPng(c.image)
    const scale = Math.min(260 / img.width, 80 / img.height)
    page.drawImage(img, { x: M + 140, y: boxTop - img.height * scale, width: img.width * scale, height: img.height * scale })
    y = boxTop - img.height * scale - 6
  } else {
    const typed = c.typed || c.signer.name
    // The script face only covers basic Latin; anything else is drawn in the body face.
    const f = safeText(script, typed) === typed.normalize('NFC') ? script : reg
    page.drawText(safeText(f, typed), { x: M + 140, y: boxTop - 30, size: 28, font: f, color: NAVY })
    y = boxTop - 40
  }
  page.drawLine({ start: { x: M + 140, y }, end: { x: W - M, y }, thickness: 0.75, color: NAVY })
  y -= 12
  text(c.method === 'drawn' ? 'Drawn by the signer' : 'Typed by the signer', { size: 8, color: MUTED, x: 140, gap: 10 })
  rule()

  text('Record', { f: bold, size: 11, gap: 6 })
  if (c.sharedAt) row('Quote shared', fmtMoment(c.sharedAt))
  if (c.viewedAt) row('First opened', fmtMoment(c.viewedAt))
  row('Signer agreed to', `“${CONSENT}”`)
  y -= 8
  text(
    'The fingerprint identifies the exact quote that was signed: any change to the original file gives a different fingerprint. Breaking Ice keeps this signed copy with the project.',
    { size: 8, color: MUTED },
  )

  return pdf.save()
}

export const newCertificateId = () => randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g)!.join('-')

/** A PDF for the browser: shown inline, or saved with ?download=1. Never cached. */
export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** For the sample client: a short navy quote, so the viewer and the welcome have something to show. */
export async function samplePdf() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const [reg, bold] = await Promise.all([font('Archivo-Regular.ttf'), font('Archivo-SemiBold.ttf')].map((p) => p.then((b) => pdf.embedFont(b, { subset: true }))))
  const pages = ['Teacher recruitment film', 'Overview', 'Scope of work', 'Investment']
  pages.forEach((heading, i) => {
    const page = pdf.addPage([612, 792])
    const dark = i === 0
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: dark ? NAVY : rgb(1, 1, 1) })
    page.drawText('BREAKING ICE PRODUCTIONS', { x: 56, y: 730, size: 9, font: bold, color: COPPER })
    page.drawText(dark ? 'QUOTE · SAMPLE' : `Sample quote · page ${i + 1}`, { x: 56, y: dark ? 260 : 700, size: 9, font: bold, color: dark ? COPPER : MUTED })
    page.drawText(heading, { x: 56, y: dark ? 220 : 660, size: dark ? 34 : 26, font: bold, color: dark ? rgb(0.98, 0.97, 0.95) : NAVY })
    if (!dark) page.drawText('This is a sample page. Real quotes show the PDF you upload.', { x: 56, y: 620, size: 11, font: reg, color: MUTED })
  })
  return pdf.save()
}
