import 'server-only'
import { SITE_URL } from '@/lib/site'
import { getPortalSettings, portalClient } from '@/portal/data'
import { messageEmail, notifyJosh, sendEmail } from '@/portal/email'
import { portalReady } from '@/portal/config'
import { recapButtons } from '@/slack/blocks'
import { allRetainerClients, canWrite, claimRecapSend, edmontonDate, getRetainerMonth, monthKey, monthLabel, piecesForMonth, saveRecap, shiftMonth, type RetainerClient } from './data'
import type { ItemType, MonthKey, Network, PublerPiece, RetainerItem } from './types'

/**
 * Month-end recap for a retainer client. Drafted automatically (scheduler, from the 1st) for the month
 * before; Josh reads it in the back office, edits it if he likes, and presses Send. Never sent on its own.
 * Facts only, from the month's own records and Publer: no invented numbers, no prices, no promises.
 */

const NETWORK_NAMES: Record<Network, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
  google: 'Google Business',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  other: 'other networks',
}

const TYPE_NAMES: Record<ItemType, [string, string]> = {
  social: ['social post', 'social posts'],
  video: ['video', 'videos'],
  photo: ['photo piece', 'photo pieces'],
  design: ['design', 'designs'],
  other: ['other piece', 'other pieces'],
}

const n = (x: number) => x.toLocaleString('en-CA')
const count = (k: number, t: ItemType) => `${k} ${TYPE_NAMES[t][k === 1 ? 0 : 1]}`
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const networksOf = (p: PublerPiece) => andList([...new Set(p.networks.map((x) => NETWORK_NAMES[x.network]))])

/** The opening words of a post, for a list: one line, cut at a word, in quotes. */
function quote(text: string, max = 70) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return '(a post with no text)'
  if (t.length <= max) return `“${t}”`
  const cut = t.slice(0, max)
  return `“${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s.,;:!?–-]+$/, '')}…”`
}

export const recapSubject = (month: MonthKey) => `Your ${monthLabel(month).split(' ')[0]} with Breaking Ice`

export const recapRecipients = (c: RetainerClient) => c.contacts.filter((x) => x.getsEmails !== false && x.email)

export const portalLink = (c: RetainerClient) => `${SITE_URL}/portal/retainer/${encodeURIComponent(c._id)}`

/** Writes the recap from the month's delivered items and Publer pieces. Pure: no reads, no writes. */
export function composeRecap(c: RetainerClient, month: MonthKey, items: RetainerItem[], pieces: PublerPiece[], signOff = 'Josh') {
  const monthName = monthLabel(month).split(' ')[0]
  const done = items.filter((i) => i.status === 'delivered')
  const names = recapRecipients(c).map((x) => x.name.split(' ')[0]).filter(Boolean)
  const hello = names.length && names.length <= 3 ? `Hi ${andList(names)},` : 'Hi everyone,'
  const lines: string[] = [hello, `Here’s a short look back at ${monthName}.`]

  const total = done.length + pieces.length
  if (!total) {
    lines.push(`Nothing was marked as delivered for ${monthName}.`)
  } else {
    const byType = new Map<ItemType, number>()
    for (const i of done) byType.set(i.type, (byType.get(i.type) ?? 0) + 1)
    byType.set('social', (byType.get('social') ?? 0) + pieces.length)
    const parts = (['social', 'video', 'photo', 'design', 'other'] as ItemType[]).filter((t) => byType.get(t)).map((t) => count(byType.get(t)!, t))
    lines.push(`We delivered ${total} ${total === 1 ? 'piece' : 'pieces'} this month: ${andList(parts)}.`)

    const list = [
      ...done.map((i) => ({ at: i.deliveredAt ?? '', line: `- ${i.title} (${TYPE_NAMES[i.type][0]})` })),
      ...pieces.map((p) => ({ at: p.at.slice(0, 10), line: `- ${quote(p.text)} on ${networksOf(p)}` })),
    ].sort((a, b) => a.at.localeCompare(b.at))
    const shown = list.slice(0, 15).map((x) => x.line)
    if (list.length > 15) shown.push(`- and ${list.length - 15} more`)
    lines.push(`What went out:\n${shown.join('\n')}`)

    const nets = [...new Set(pieces.flatMap((p) => p.networks.map((x) => NETWORK_NAMES[x.network])))]
    if (nets.length) lines.push(`Social posts went out on ${andList(nets)}.`)
  }

  const measured = pieces.filter((p) => p.state === 'published' && p.metrics)
  if (measured.length) {
    const reach = measured.reduce((s, p) => s + (p.metrics?.reach ?? 0), 0)
    const engagement = measured.reduce((s, p) => s + (p.metrics?.engagement ?? 0), 0)
    const facts: string[] = []
    if (reach) facts.push(`- Reach, added up across posts: ${n(reach)}`)
    if (engagement) facts.push(`- Engagements (likes, comments, shares and more): ${n(engagement)}`)
    const top = measured.filter((p) => p.metrics?.engagement).sort((a, b) => (b.metrics!.engagement ?? 0) - (a.metrics!.engagement ?? 0)).slice(0, 3)
    if (facts.length) lines.push(`How the posts did, from Publer (${measured.length} published ${measured.length === 1 ? 'post' : 'posts'} with numbers):\n${facts.join('\n')}`)
    if (top.length)
      lines.push(
        `Top ${top.length === 1 ? 'post' : `${top.length} posts`} by engagement:\n${top
          .map((p, i) => `${i + 1}. ${quote(p.text, 60)} on ${networksOf(p)}: ${n(p.metrics!.engagement!)} engagements${p.metrics?.reach ? `, ${n(p.metrics.reach)} reach` : ''}`)
          .join('\n')}`,
      )
  }

  lines.push(total ? 'Everything we made is in your portal, ready to download.' : 'Your portal has the month at a glance.')
  if (/^https:\/\//.test(SITE_URL)) lines.push(`[button: Open your portal](${portalLink(c)})`)
  else lines.push(portalLink(c))
  lines.push(`Thanks,\n${signOff}`)
  return { subject: recapSubject(month), body: lines.join('\n\n') }
}

/** Reads the month and drafts its recap (doesn't save it). `failed`: Publer is set up but didn't answer, so numbers may be missing. */
export async function draftRecap(c: RetainerClient, month: MonthKey) {
  const [doc, pub, settings] = await Promise.all([getRetainerMonth(c._id, month), piecesForMonth(c, month), getPortalSettings()])
  return { ...composeRecap(c, month, doc?.items ?? [], pub.pieces, settings.signOff || 'Josh'), failed: Boolean(pub.failed), note: pub.note }
}

/**
 * Scheduler step: from the 1st, drafts last month's recap for each active retainer client that doesn't
 * have one yet. Saves the draft and tells Josh. Never sends. If Publer doesn't answer, it waits for the
 * next run, until the 3rd, then drafts with what it has.
 */
export async function draftDueRecaps(deadline: number): Promise<string[]> {
  if (!portalReady()) return []
  const log: string[] = []
  const month = shiftMonth(monthKey(), -1)
  const clients = (await allRetainerClients()).filter(
    (c) => (!c.retainer.startMonth || month >= c.retainer.startMonth) && (!c.retainer.endMonth || month <= c.retainer.endMonth) && canWrite(c._id),
  )
  if (!clients.length) return log
  const drafted = new Set(
    (await portalClient.fetch<string[]>(`*[_type == "retainerMonth" && month == $month && defined(recap.draftedAt)].clientId`, { month }, { cache: 'no-store' }).catch(() => null)) ??
      clients.map((c) => c._id), // can't tell: draft nothing this run
  )
  const lateEnough = Number(edmontonDate().slice(8, 10)) >= 3
  for (const c of clients) {
    if (drafted.has(c._id)) continue
    if (Date.now() > deadline) break
    try {
      const d = await draftRecap(c, month)
      if (d.failed && !lateEnough) {
        log.push(`retainer recap waiting on Publer: ${c.organizationName} ${month}`)
        continue
      }
      await saveRecap(c._id, month, { draftedAt: new Date().toISOString(), subject: d.subject, body: d.body })
      log.push(`retainer recap drafted: ${c.organizationName} ${month}`)
      const page = `${SITE_URL}/admin/retainers/${encodeURIComponent(c._id)}?month=${month}`
      await notifyJosh(`Recap for ${c.organizationName} (${monthLabel(month)}) is drafted. Read it and press Send when it's right: ${page}`, { buttons: recapButtons(c._id, month, page) })
    } catch (e) {
      log.push(`retainer recap failed: ${c.organizationName}: ${String(e).slice(0, 120)}`)
    }
  }
  return log
}

/**
 * Sends the recap, only when Josh presses Send: one email per contact who gets emails, BCC to the
 * portal's copy-to address, claimed first so it can't go twice. Records when and to whom.
 */
export async function sendRecap(c: RetainerClient, month: MonthKey, mail: { subject: string; body: string }): Promise<{ ok: true; sent: number; total: number; failed: string[] } | { ok: false; error: string; message: string }> {
  const to = recapRecipients(c)
  if (!to.length) return { ok: false, error: 'no-to', message: 'No contact on this client gets emails. Add one in the Studio first.' }
  const stamp = new Date().toISOString()
  const claim = await claimRecapSend(c._id, month, stamp)
  if (claim === 'sent') return { ok: false, error: 'already-sent', message: 'This recap has already been sent.' }
  if (claim === 'busy') return { ok: false, error: 'busy', message: 'Someone else is saving this recap right now. Reload the page and try again.' }
  // Saved first, so what's on record is exactly what went out.
  await saveRecap(c._id, month, { subject: mail.subject, body: mail.body })
  const settings = await getPortalSettings()
  const email = messageEmail({ subject: mail.subject, body: mail.body })
  const sentTo: string[] = []
  const failed: string[] = []
  for (const x of to) {
    try {
      const r = await sendEmail({ to: [x.email], bcc: settings.copyTo && settings.copyTo.toLowerCase() !== x.email.toLowerCase() ? [settings.copyTo] : undefined, ...email })
      if (!r.ok) {
        await saveRecap(c._id, month, { sentAt: null })
        return { ok: false, error: 'email-off', message: 'Email isn’t set up on this site yet (no Resend key), so nothing was sent.' }
      }
      sentTo.push(x.email)
    } catch (e) {
      failed.push(`${x.email}: ${String(e).slice(0, 120)}`)
    }
    await new Promise((r) => setTimeout(r, 600)) // stay under the email service's rate limit
  }
  if (!sentTo.length) {
    await saveRecap(c._id, month, { sentAt: null })
    return { ok: false, error: 'failed', message: 'The recap didn’t go out to anyone. Nothing was sent. Try again in a minute.' }
  }
  await saveRecap(c._id, month, { sentTo })
  return { ok: true, sent: sentTo.length, total: to.length, failed }
}
