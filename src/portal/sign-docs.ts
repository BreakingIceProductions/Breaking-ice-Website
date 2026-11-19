/**
 * Documents to sign: the Library's templates and the requests sent from them.
 * Shared by the back office, the client portal and the public signing page, so nothing
 * here touches the server. Storage lives in sign-store.ts; the PDF in sign-pdf.ts.
 *
 * Wording rule: the only legal text in the code is the owner's media release (doc-seeds.ts)
 * and the e-sign sentence below, taken word for word from the quote's consent (quotes.ts).
 * Every other template starts empty until the owner pastes his own wording.
 */

export const DOC_KINDS = [
  'production-agreement',
  'delivery-signoff',
  'change-order',
  'media-release',
  'location-release',
  'testimonial-release',
  'actor-agreement',
  'contractor-agreement',
  'nda',
] as const
export type DocKind = (typeof DOC_KINDS)[number]

export type Audience = 'client' | 'person'
export type DocGroup = 'contract' | 'project' | 'people'

export const DOC_GROUPS: { key: DocGroup; label: string }[] = [
  { key: 'contract', label: 'The contract' },
  { key: 'project', label: 'On a project' },
  { key: 'people', label: 'People and crew' },
]

/** Names and defaults for each kind. Titles are what the Library shows; the owner can rename a template. */
export const KIND: Record<DocKind, { title: string; group: DocGroup; audience: Audience; projectOptional?: boolean }> = {
  'production-agreement': { title: 'Production agreement', group: 'contract', audience: 'client' },
  nda: { title: 'Non-disclosure agreement', group: 'contract', audience: 'person', projectOptional: true },
  'delivery-signoff': { title: 'Delivery sign-off', group: 'project', audience: 'client' },
  'change-order': { title: 'Change order', group: 'project', audience: 'client' },
  'media-release': { title: 'Media release', group: 'people', audience: 'person' },
  'location-release': { title: 'Location release', group: 'people', audience: 'person' },
  'testimonial-release': { title: 'Testimonial release', group: 'people', audience: 'person' },
  'actor-agreement': { title: 'Actor agreement', group: 'people', audience: 'person' },
  'contractor-agreement': { title: 'Contractor agreement', group: 'people', audience: 'person' },
}

/** Shown in place of an empty body. */
export const EMPTY_LINE = 'Paste your wording here. Nothing can be sent until this has wording.'

/** Word for word the second sentence of CONSENT in quotes.ts (the quote's e-sign consent). */
export const ESIGN_CONSENT = 'I agree to sign electronically, and that my electronic signature is as binding as a handwritten one.'

export type FieldType = 'text' | 'date' | 'money' | 'choice'
export type DocField = {
  _key: string
  /** The name used in the body as {{key}}. */
  key: string
  label: string
  type: FieldType
  /** Owner fills it before sending, or the signer fills it while signing. */
  who: 'owner' | 'signer'
  /** For choice fields: the options, word for word. */
  options?: string[]
  /** Pre-filled value the owner can change before sending. */
  default?: string
  /** Signer fields only asked when the signer says they're signing for a minor. */
  minor?: boolean
  /** Signer fields the signer may leave empty. */
  optional?: boolean
}

export type DocTemplate = {
  _id: string
  kind: DocKind
  title: string
  audience: Audience
  body: string
  fields: DocField[]
  wordingApproved: boolean
  updatedAt: string
}

export type SignStatus = 'out' | 'viewed' | 'signed' | 'void'

export type SignRecord = {
  /** The typed full name. */
  name: string
  at: string
  ip: string
  userAgent: string
  consent: string
  /** Signer-filled values, as signed. */
  values: Record<string, string>
  forMinor?: boolean
  /** How the signer reached the document: their own link, or signed in to the client portal as this address. */
  via: 'link' | 'portal'
  portalEmail?: string
  /** SHA-256 of the exact text that was signed. */
  docHash: string
  certificateId: string
  /** The signed PDF: a Sanity file asset, and the copy in Drive when the project has a folder. */
  pdfRef?: string
  driveFileId?: string
}

export type SignRequest = {
  _id: string
  templateId: string
  kind: DocKind
  audience: Audience
  /** Frozen at send time: later edits to the template never change what this signer sees. */
  snapshot: { title: string; body: string; fields: DocField[] }
  projectId?: string
  projectTitle?: string
  projectSlug?: string
  clientId?: string
  org?: string
  recipient: { name: string; email: string; contactKey?: string }
  /** Owner-filled values (and project / client, filled automatically). */
  values: Record<string, string>
  token: string
  status: SignStatus
  createdAt: string
  emailedAt?: string
  viewedAt?: string
  signedAt?: string
  voidedAt?: string
  signature?: SignRecord
}

/** Filled in automatically: the signer's typed name, and the project and client at send time. */
export const SYSTEM_FIELDS: Record<string, string> = { signer_name: 'Signer’s full name', project: 'Project', client: 'Client' }

const FIELD_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi

/** Every {{field}} in a body, in order of first use. */
export function detectFields(body: string) {
  const seen: string[] = []
  for (const m of body.matchAll(FIELD_RE)) {
    const k = m[1].toLowerCase()
    if (!seen.includes(k)) seen.push(k)
  }
  return seen
}

/** Fields used in the body that aren't set up in the fill-ins list (and aren't automatic). */
export const undefinedFields = (body: string, fields: DocField[]) => detectFields(body).filter((k) => !SYSTEM_FIELDS[k] && !fields.some((f) => f.key === k))

export const hasWording = (t: Pick<DocTemplate, 'body'>) => t.body.trim().length > 0
export const sendable = (t: DocTemplate) => t.wordingApproved && hasWording(t) && undefinedFields(t.body, t.fields).length === 0

export type Segment = { text: string } | { field: string; label: string; value?: string; who: 'owner' | 'signer' | 'system' }

/** One paragraph per blank-line-separated block (single line breaks stay inside a paragraph). */
export function paragraphs(body: string) {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** A paragraph as plain text and field slots, for highlighting. */
export function segments(para: string, fields: DocField[], values: Record<string, string>): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of para.matchAll(FIELD_RE)) {
    if (m.index! > last) out.push({ text: para.slice(last, m.index) })
    const key = m[1].toLowerCase()
    const f = fields.find((x) => x.key === key)
    const v = values[key]?.trim()
    out.push({ field: key, label: f?.label ?? SYSTEM_FIELDS[key] ?? key, value: v || undefined, who: f ? f.who : 'system' })
    last = m.index! + m[0].length
  }
  if (last < para.length) out.push({ text: para.slice(last) })
  return out
}

export const BLANK = '____________'

/** The body as plain text with values filled, blanks where nothing was given. Choice fields read as the option chosen. */
export function fillText(body: string, fields: DocField[], values: Record<string, string>) {
  return paragraphs(body)
    .map((p) =>
      segments(p, fields, values)
        .map((s) => ('text' in s ? s.text : (s.value ?? choiceBlank(fields.find((f) => f.key === s.field)))))
        .join(''),
    )
    .join('\n\n')
}

/** An unanswered choice shows its options; any other empty field a blank line. */
export const choiceBlank = (f?: DocField) => (f?.type === 'choice' && f.options?.length ? f.options.map((o) => `[  ] ${o}`).join('  ') : BLANK)

export const statusLabel: Record<SignStatus, string> = { out: 'Out for signature', viewed: 'Opened', signed: 'Signed', void: 'Withdrawn' }

export const newKey = () => Math.random().toString(36).slice(2, 10)

/** Is the field asked of this signer? Minor-only fields only when signing for a minor. */
export const asked = (f: DocField, forMinor: boolean) => f.who === 'signer' && (!f.minor || forMinor)
