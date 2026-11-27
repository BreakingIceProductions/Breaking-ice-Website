/**
 * The Emails page: one conversation per client company, built from Josh's Gmail. Types and limits shared by the
 * server (gmail.ts, mail-core.ts) and the browser (ui/emails.tsx). No server-only imports.
 */

export type MailAddr = { name: string; email: string }

/** Someone at a client: a contact on the client, or the person on one of its leads. */
export type MailPerson = MailAddr & { role?: string; lead?: boolean }

export type MailFile = { /** Gmail attachment id */ id: string; name: string; size: number; type: string }

export type MailBody = { kind: 'html' | 'text'; /** Sanitised on the server when html. */ main: string; /** Earlier messages quoted under the reply. */ quoted?: string }

export type MailMessage = {
  id: string
  threadId: string
  at: string
  from: MailAddr
  to: MailAddr[]
  cc: MailAddr[]
  subject: string
  /** Sent by Josh. */
  mine: boolean
  unread: boolean
  body: MailBody
  files: MailFile[]
  /** The Message-ID and References headers, for threading a reply. */
  messageId?: string
  references?: string
}

export type ConversationRow = {
  clientId: string
  clientName: string
  people: MailPerson[]
  last?: { at: string; snippet: string; fromName: string; mine: boolean }
  unread: number
}

export type MailProject = { id: string; title: string; href: string }

/**
 * What a site email (sent through Resend by src/portal/email.ts sendEmail) was for. Shown as a compact card in
 * the client’s thread; the copy itself is a `sentEmail` document in the portal dataset.
 */
export const SITE_EMAIL_KINDS = {
  quote: 'Quote sent',
  'quote-updated': 'Updated quote sent',
  review: 'Review link sent',
  version: 'New version sent',
  reminder: 'Feedback reminder sent',
  delivery: 'Final files sent',
  paid: 'Payment receipt sent',
  signed: 'Signed quote sent',
  'sign-request': 'Sign request sent',
  message: 'Email sent from the site',
  'chat-reply': 'Chat reply emailed',
  recap: 'Month-end recap sent',
  other: 'Site email sent',
} as const
export type SiteEmailKind = keyof typeof SITE_EMAIL_KINDS
export const isSiteEmailKind = (k: unknown): k is SiteEmailKind => typeof k === 'string' && Object.hasOwn(SITE_EMAIL_KINDS, k)

/** One site email as the thread shows it (no HTML: that loads when the card is opened). */
export type SiteEmail = {
  id: string
  at: string
  kind: SiteEmailKind
  subject: string
  /** Short card text, e.g. 'From $72,000 + GST'. */
  summary?: string
  to: string[]
  projectId?: string
  projectTitle?: string
  deliveredAt?: string
  openedAt?: string
  opens?: number
  bouncedAt?: string
  bounce?: string
}

/** "Quote sent · From $72,000 + GST": the card's first line, and the list preview. */
export const siteEmailLine = (e: Pick<SiteEmail, 'kind' | 'summary'>) => `${SITE_EMAIL_KINDS[e.kind] ?? SITE_EMAIL_KINDS.other}${e.summary ? ` · ${e.summary}` : ''}`

/** "Delivered", "Opened 2×", "Bounced" or nothing (before Resend's webhook reports). */
export const siteEmailStatus = (e: Pick<SiteEmail, 'deliveredAt' | 'openedAt' | 'opens' | 'bouncedAt'>) =>
  e.bouncedAt ? 'Bounced' : e.openedAt || e.opens ? `Opened${(e.opens ?? 1) > 1 ? ` ${e.opens}×` : ''}` : e.deliveredAt ? 'Delivered' : ''

/** The full copy of a site email, for the preview sheet. */
export type SiteEmailCopy = SiteEmail & { html: string; text: string }

export type Conversation = {
  clientId: string
  clientName: string
  people: MailPerson[]
  projects: MailProject[]
  messages: MailMessage[]
  /** Emails the website sent this client (quotes, review links, receipts…), oldest first. Shown as cards. */
  siteEmails: SiteEmail[]
  /** More messages exist in Gmail than are shown. */
  more?: boolean
}

/** Why the page can't show mail, when it can't. */
export type MailState = 'ready' | 'sample' | 'not-set-up' | 'not-connected' | 'needs-scope' | 'signed-out'

export const MAIL_LIMITS = {
  to: 10,
  subject: 300,
  body: 50_000,
  /** All attachments together, as chosen (before encoding). */
  files: 20 * 1024 * 1024,
  fileCount: 10,
  /** Above this, files go to R2 first instead of riding in the send request (Vercel caps request bodies near 4.5 MB). */
  inline: 3 * 1024 * 1024,
  /** Messages shown per conversation. */
  messages: 150,
}

export const initialsOf = (name: string) => {
  const words = name.replace(/[[\]()]/g, '').trim().split(/[\s@._-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

/** "Re: Re: Fwd: Hello" → "hello", to tell whether a reply keeps the thread's subject. */
export const baseSubject = (s: string) => s.replace(/^\s*((re|fwd?|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, '').trim().toLowerCase()

export const replySubject = (s: string) => (/^\s*re\s*:/i.test(s) ? s.trim() : `Re: ${s.trim()}`)

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Card money: "$72,000", or "$9,420.50" when there are cents. */
export const cardMoney = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
