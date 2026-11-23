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

export type Conversation = {
  clientId: string
  clientName: string
  people: MailPerson[]
  projects: MailProject[]
  messages: MailMessage[]
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
