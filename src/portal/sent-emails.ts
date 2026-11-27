import 'server-only'
import { randomBytes } from 'node:crypto'
import { isSiteEmailKind, type SiteEmail, type SiteEmailCopy, type SiteEmailKind } from '@/admin/mail-shared'
import { adminSampleMode } from '@/admin/config'
import { portalClient } from './data'

/**
 * A copy of every client email the website sends through Resend (src/portal/email.ts sendEmail), one `sentEmail`
 * document each in the private portal dataset. The back office Emails page shows them as cards in the client's
 * thread, and Resend's webhook (src/app/api/resend/webhook) marks them delivered, opened or bounced by Resend id.
 * Sign-in codes are never kept (their callers pass `log: false`), and nor are notifications that only go to Josh:
 * a copy is kept only when the email is for a known client.
 */

/** What a caller of sendEmail says about the email, so its card reads right and lands in the right thread. */
export type EmailLog = {
  kind: SiteEmailKind
  projectId?: string
  clientId?: string
  /** Short card text after the kind, e.g. "From $72,000 + GST" or "Rough cut v2". */
  summary?: string
}

const ID_OK = /^[\w.-]{1,200}$/
const MAX_HTML = 400_000

/** The client whose contacts include one of these addresses, for emails sent without a clientId. */
async function clientFor(emails: string[], projectId?: string): Promise<{ clientId?: string; projectTitle?: string }> {
  if (projectId && ID_OK.test(projectId)) {
    const p = await portalClient.fetch<{ clientId?: string; title?: string } | null>(`*[_id == $id][0]{ "clientId": client._ref, title }`, { id: projectId }, { cache: 'no-store' })
    if (p?.clientId) return { clientId: p.clientId, projectTitle: p.title }
  }
  const lower = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (!lower.length) return {}
  const id = await portalClient.fetch<string | null>(`*[_type == "client" && !(_id in path("drafts.**")) && count(contacts[lower(email) in $emails]) > 0][0]._id`, { emails: lower }, { cache: 'no-store' })
  return id ? { clientId: id } : {}
}

/**
 * Keeps the copy. Never throws: a send that went out must never read as failed because the copy didn't save.
 * Nothing is written in sample mode.
 */
/** Swaps every sign-in link (anything carrying token=) for the plain portal address. */
function noTokens(s: string): string {
  return s.replace(/https?:\/\/[^\s"'<>]*[?&]token=[^\s"'<>]*/g, "https://breakingiceproductions.com/portal")
}

export async function keepSentEmail(sent: { resendId?: string; to: string[]; subject: string; html: string; text: string }, log: EmailLog | undefined): Promise<void> {
  try {
    if (adminSampleMode()) return
    const kind = log && isSiteEmailKind(log.kind) ? log.kind : 'other'
    let clientId = log?.clientId && ID_OK.test(log.clientId) ? log.clientId : undefined
    const projectId = log?.projectId && ID_OK.test(log.projectId) ? log.projectId : undefined
    let projectTitle: string | undefined
    if (!clientId || projectId) {
      const found = await clientFor(sent.to, projectId)
      clientId ??= found.clientId
      projectTitle = found.projectTitle
    }
    // Only client email belongs in a client's thread.
    if (!clientId) return
    const idPart = sent.resendId && /^[\w-]{1,100}$/.test(sent.resendId) ? sent.resendId : randomBytes(12).toString('hex')
    await portalClient.createIfNotExists({
      _id: `sentEmail-${idPart}`,
      _type: 'sentEmail',
      ...(sent.resendId && { resendId: sent.resendId }),
      kind,
      to: sent.to.slice(0, 20),
      subject: sent.subject.slice(0, 300),
      ...(log?.summary && { summary: log.summary.slice(0, 120) }),
      // Portal sign-in links are live keys for 7 days; the copy never keeps them.
      html: noTokens(sent.html).slice(0, MAX_HTML),
      text: noTokens(sent.text).slice(0, 50_000),
      client: { _type: 'reference', _ref: clientId, _weak: true },
      ...(projectId && { project: { _type: 'reference', _ref: projectId, _weak: true } }),
      ...(projectTitle && { projectTitle }),
      sentAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[email] keeping a copy of the sent email failed', e)
  }
}

const CARD = `{ "id": _id, "at": sentAt, kind, subject, summary, to, "projectId": project._ref, projectTitle, deliveredAt, openedAt, opens, bouncedAt, bounce }`

const clean = (x: SiteEmail): SiteEmail => {
  const out = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null && v !== undefined)) as SiteEmail
  return { ...out, kind: isSiteEmailKind(out.kind) ? out.kind : 'other', to: Array.isArray(out.to) ? out.to : [] }
}

/** One client's site emails, oldest first (the newest 150). */
export async function listSentEmails(clientId: string): Promise<SiteEmail[]> {
  if (adminSampleMode()) return (await import('@/admin/mail-samples')).sampleSiteEmails(clientId)
  const rows = await portalClient.fetch<SiteEmail[]>(`*[_type == "sentEmail" && client._ref == $id] | order(sentAt desc)[0...150]${CARD}`, { id: clientId }, { cache: 'no-store' })
  return rows.map(clean).reverse()
}

/** Each client's newest site email, for the conversation list's preview line. */
export async function latestSentEmails(): Promise<Map<string, SiteEmail>> {
  const out = new Map<string, SiteEmail>()
  if (adminSampleMode()) {
    const { sampleLatestSiteEmails } = await import('@/admin/mail-samples')
    return sampleLatestSiteEmails()
  }
  const rows = await portalClient.fetch<(SiteEmail & { clientId: string })[]>(
    `*[_type == "sentEmail" && defined(client._ref)] | order(sentAt desc)[0...400]{ "clientId": client._ref, ...${CARD} }`,
    {},
    { cache: 'no-store' },
  )
  for (const r of rows) if (!out.has(r.clientId)) out.set(r.clientId, clean(r))
  return out
}

/**
 * The full copy, for the preview sheet. Links are taken out of the HTML: the real ones carry the client's
 * one-tap portal sign-in, which must never open from the back office.
 */
export async function getSentEmail(id: string): Promise<SiteEmailCopy | null> {
  if (!ID_OK.test(id)) return null
  const doc = adminSampleMode()
    ? await (await import('@/admin/mail-samples')).sampleSiteEmailCopy(id)
    : await portalClient.fetch<SiteEmailCopy | null>(`*[_type == "sentEmail" && _id == $id][0]{ ..., "id": _id, "at": sentAt, "projectId": project._ref, html, text }`, { id }, { cache: 'no-store' })
  if (!doc) return null
  const html = String(doc.html ?? '')
    .replace(/\s(href|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
  const text = String(doc.text ?? '').replace(/https?:\/\/\S*token=\S+/g, '[portal sign-in link]')
  const card = clean(doc)
  return { ...card, html, text }
}

export type SentEmailEvent = { kind: 'opened' | 'delivered' | 'bounced'; resendId: string; at: string; hookId: string; bounce?: string }

/**
 * Resend's webhook → the copy with that Resend id. Delivered and the first open are kept once; opens count up
 * and the latest open moves on; a bounce sets bouncedAt. A webhook id already seen is skipped (Resend retries).
 */
export async function recordSentEmailEvent(e: SentEmailEvent): Promise<{ found: boolean }> {
  if (adminSampleMode()) return { found: false }
  const doc = await portalClient.fetch<{ _id: string; hooks?: string[] } | null>(`*[_type == "sentEmail" && resendId == $id][0]{ _id, hooks }`, { id: e.resendId }, { cache: 'no-store' })
  if (!doc) return { found: false }
  if (doc.hooks?.includes(e.hookId)) return { found: true }
  let patch = portalClient.patch(doc._id).set({ hooks: [...(doc.hooks ?? []), e.hookId].slice(-10) })
  if (e.kind === 'opened') patch = patch.setIfMissing({ openedAt: e.at, opens: 0 }).inc({ opens: 1 }).set({ lastOpenedAt: e.at })
  else if (e.kind === 'delivered') patch = patch.setIfMissing({ deliveredAt: e.at })
  else patch = patch.set({ bouncedAt: e.at, ...(e.bounce ? { bounce: e.bounce.slice(0, 300) } : {}) })
  await patch.commit()
  return { found: true }
}
