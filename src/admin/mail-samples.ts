import { quoteEmail, reviewBatchEmail } from '@/portal/email'
import { messageBody } from './mail-core'
import type { Conversation, ConversationRow, MailMessage, MailPerson, MailProject, SiteEmail, SiteEmailCopy } from './mail-shared'

/**
 * Local development only (no Google): made-up conversations for the sample clients, so the Emails page can be
 * worked on. Placeholder names in brackets and example.com addresses; nothing here is real or reaches Gmail.
 */

const JOSH = { name: 'Josh Ferguson', email: 'josh@breakingiceproductions.com' }

const EXTRA: Record<string, MailPerson[]> = {
  'sample-ab': [{ name: '[Alberta comms lead]', email: 'ab.comms@example.com', role: 'Communications' }],
  'sample-society': [{ name: '[Society director]', email: 'society.director@example.com', role: 'Executive director' }],
}

export const sampleExtraPeople = (clientId: string) => EXTRA[clientId] ?? []

type Seed = { ago: number; from: 'josh' | string; to?: string[]; thread: string; subject: string; text: string; /** An HTML body instead, read the way a real Gmail message is (sanitised, quoted history split off). */ html?: string; quoted?: string; unread?: boolean; files?: { name: string; size: number; type: string }[] }

const h = 3_600_000
const d = 24 * h

const SEEDS: Record<string, Seed[]> = {
  'sample-ab': [
    { ago: 9 * d, from: 'ab@example.com', thread: 't1', subject: 'Brand film for next spring', text: 'Hi Josh,\n\nWe saw the films you made for a couple of organisations up north and would love to talk about a short brand film for our spring campaign. Would you have time for a call next week?\n\nThanks,\n[Client contact]' },
    { ago: 8 * d + 20 * h, from: 'josh', to: ['ab@example.com'], thread: 't1', subject: 'Re: Brand film for next spring', text: 'Hi there,\n\nThanks for reaching out. I’d love to hear more. Tuesday or Wednesday morning both work on my end; send me a time and I’ll put a call link in the invite.\n\nJosh', quoted: 'On Mon, [Client contact] wrote:\n> We saw the films you made…' },
    {
      ago: 6 * d,
      from: 'ab.comms@example.com',
      to: ['josh@breakingiceproductions.com'],
      thread: 't2',
      subject: 'Brand guidelines for the film',
      text: '',
      // An Outlook-style HTML email: signature block, a disclaimer, and earlier mail quoted under a divider.
      html: '<html><body><div><p>Hi Josh,</p><p>I’m on the comms side and will be your day-to-day contact for the film. Attaching our brand guide and last year’s campaign deck so you can see the look we’ve used.</p><p>Best,</p><p><b>[Alberta comms lead]</b><br>Communications Advisor<br>Alberta Example Agency<br>T: 780-555-0100 | M: 780-555-0199<br>www.example.com</p><p style="font-size:9px">CONFIDENTIALITY NOTICE: This email and any attachments are for the sole use of the intended recipient(s) and may contain confidential information. If you are not the intended recipient, please delete it and notify the sender.</p></div><div id="divRplyFwdMsg"><hr><b>From:</b> [Client contact] &lt;ab@example.com&gt;<br><b>Sent:</b> Monday<br><b>To:</b> Josh Ferguson<br><b>Subject:</b> Brand film for next spring</div><div>Hi Josh, we saw the films you made…</div></body></html>',
      files: [{ name: 'Brand guide 2026.pdf', size: 4_200_000, type: 'application/pdf' }, { name: 'Campaign deck.pptx', size: 9_800_000, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }] },
    { ago: 5 * d + 3 * h, from: 'josh', to: ['ab.comms@example.com'], thread: 't2', subject: 'Re: Brand guidelines for the film', text: 'Thanks, these are great. The colour palette will translate nicely to the titles. I’ll have a first treatment to you by Friday.\n\nJosh' },
    // The whole reply as typed, quoted history and signature included (no split): the bubble strips it, the tap shows it all.
    {
      ago: 1 * d + 2 * h,
      from: 'ab.comms@example.com',
      to: ['josh@breakingiceproductions.com'],
      thread: 't2',
      subject: 'Re: Brand guidelines for the film',
      text: 'Hi Josh,\n\nThe treatment reads really well. Two small things from our director: could we add a line about our volunteers, and could the shoot move to the second week of May?\n\nThanks!\n[Alberta comms lead]\nCommunications Advisor | Alberta Example Agency\n780-555-0100\n\nSent from my iPhone\n\nOn Thu, Nov 19, 2026 at 2:14 PM Josh Ferguson <josh@breakingiceproductions.com> wrote:\n> Thanks, these are great. The colour palette will translate nicely to the titles.\n> I’ll have a first treatment to you by Friday.\n>\n> Josh\n>\n> On Wed, Nov 18, 2026 at 9:02 AM [Alberta comms lead] <ab.comms@example.com> wrote:\n>> Hi Josh, I’m on the comms side…',
      unread: true,
    },
    { ago: 5 * h, from: 'ab@example.com', to: ['josh@breakingiceproductions.com'], thread: 't3', subject: 'Quick question about the budget', text: 'Hi Josh, one more from me: does the quote include captions in French as well as English? Our board asked.', unread: true },
  ],
  'sample-lodge': [
    { ago: 14 * d, from: 'lodge@example.com', thread: 't1', subject: 'Season launch film', text: 'Hi Josh,\n\nWe open in June and want a short film for the website and socials before then. Can we set up a call?\n\n[Client contact]' },
    { ago: 13 * d, from: 'josh', to: ['lodge@example.com'], thread: 't1', subject: 'Re: Season launch film', text: 'Absolutely. I’ve sent an invite for Thursday at 10. Looking forward to it.\n\nJosh' },
    { ago: 2 * d + 4 * h, from: 'josh', to: ['lodge@example.com'], thread: 't1', subject: 'Re: Season launch film', text: 'Hi again,\n\nGreat talking on Thursday. I’m writing up the quote now and will send it through the portal early next week. Could you send me a rough list of the spots you’d like us to film?\n\nJosh' },
  ],
  'sample-society': [
    { ago: 20 * d, from: 'society@example.com', thread: 't1', subject: 'Community stories series', text: 'Hello Josh,\n\nWe’re planning a series of short community stories and our director suggested your name. Would you be open to sending a proposal?\n\nWarmly,\n[Client contact]' },
    { ago: 19 * d, from: 'josh', to: ['society@example.com'], thread: 't1', subject: 'Re: Community stories series', text: 'Hello,\n\nThank you, I’d be glad to. A couple of questions first: how many stories are you thinking of, and is there a date you need them by?\n\nJosh' },
    { ago: 3 * d, from: 'society.director@example.com', to: ['josh@breakingiceproductions.com', 'society@example.com'], thread: 't2', subject: 'Proposal timing', text: 'Hi Josh,\n\nJumping in from the director’s side. We’re hoping for four stories, finished by the end of March. The proposal by the 15th would be perfect for our grant deadline.\n\nThank you,\n[Society director]', unread: true },
  ],
}

/** Conversations opened in this dev server (sample "mark read", in memory only). */
const opened = new Set<string>()
export const markSampleRead = (clientId: string) => {
  const n = (SEEDS[clientId] ?? []).filter((s) => s.unread).length
  if (opened.has(clientId)) return 0
  opened.add(clientId)
  return n
}
export const sampleUnread = () => Object.entries(SEEDS).reduce((n, [id, seeds]) => n + (opened.has(id) ? 0 : seeds.filter((s) => s.unread).length), 0)

function messages(clientId: string, people: MailPerson[]): MailMessage[] {
  const who = (email: string) => (email === JOSH.email ? JOSH : (people.find((p) => p.email === email) ?? { name: email, email }))
  return (SEEDS[clientId] ?? []).map((s, i) => {
    const mine = s.from === 'josh'
    const at = new Date(Date.now() - s.ago).toISOString()
    return {
      id: `${clientId}-${i}`,
      threadId: `${clientId}-${s.thread}`,
      at,
      from: mine ? JOSH : who(s.from),
      to: (s.to ?? [JOSH.email]).map(who),
      cc: [],
      subject: s.subject,
      mine,
      unread: Boolean(s.unread) && !opened.has(clientId),
      body: s.html ? messageBody(s.html, s.text) : { kind: 'text', main: s.text, ...(s.quoted && { quoted: s.quoted }) },
      files: (s.files ?? []).map((f, n) => ({ id: `sample-${i}-${n}`, ...f })),
      messageId: `<${clientId}-${i}@sample.example.com>`,
    }
  })
}

type Dir = { id: string; name: string; people: MailPerson[]; projects: MailProject[] }

export function sampleRows(dir: Dir[]): ConversationRow[] {
  return dir
    .filter((c) => c.people.length)
    .map((c) => {
      const all = messages(c.id, c.people)
      const last = all.at(-1)
      return {
        clientId: c.id,
        clientName: c.name,
        people: c.people,
        unread: all.filter((m) => m.unread).length,
        ...(last && { last: { at: last.at, snippet: last.body.main.replace(/\s+/g, ' ').slice(0, 160), fromName: last.mine ? 'You' : last.from.name, mine: last.mine } }),
      }
    })
    .sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''))
}

export const sampleConversation = (c: Dir): Omit<Conversation, 'siteEmails'> => ({ clientId: c.id, clientName: c.name, people: c.people, projects: c.projects, messages: messages(c.id, c.people) })

/* ── Site emails (the sentEmail copies Resend sends would leave) ── */

type SiteSeed = SiteEmail & { make: () => { html: string; text: string } }

const PORTAL = 'https://breakingiceproductions.com/portal/auth?token=sample'
const quoteFor = (name: string) => () =>
  quoteEmail({ name, projectTitle: 'Brand film', org: '[Alberta client]', total: 72000, from: true, validUntil: 'December 31, 2026', again: false, portalUrl: PORTAL, signOff: 'Josh', producerPhone: '807-621-2780' })
const reviewFor = (name: string) => () =>
  reviewBatchEmail({ name, projectTitle: 'Annual report film', org: '[Alberta client]', items: [{ title: 'Rough cut', length: '3:12' }], portalUrl: PORTAL, signOff: 'Josh', producerPhone: '807-621-2780' })

function siteSeeds(clientId: string): SiteSeed[] {
  if (clientId !== 'sample-ab') return []
  const at = (ago: number) => new Date(Date.now() - ago).toISOString()
  const quote = { kind: 'quote' as const, subject: 'Your quote: Brand film', summary: 'From $72,000 + GST', projectId: 'sample-alberta', projectTitle: 'Brand film' }
  return [
    // One send to two contacts: two copies, one card.
    { id: 'sample-sent-quote-1', at: at(3 * d), to: ['ab@example.com'], ...quote, deliveredAt: at(3 * d - 60_000), openedAt: at(3 * d - 3 * h), opens: 2, make: quoteFor('[Client contact]') },
    { id: 'sample-sent-quote-2', at: at(3 * d - 1500), to: ['ab.comms@example.com'], ...quote, deliveredAt: at(3 * d - 60_000), make: quoteFor('[Alberta comms lead]') },
    { id: 'sample-sent-review-1', at: at(20 * h), kind: 'review', subject: 'Ready for review: Rough cut', summary: 'Rough cut v1', to: ['ab.comms@example.com'], projectId: 'sample-onboarding', projectTitle: 'Annual report film', deliveredAt: at(20 * h - 60_000), make: reviewFor('[Alberta comms lead]') },
  ]
}

const card = ({ make: _make, ...s }: SiteSeed): SiteEmail => s

export const sampleSiteEmails = (clientId: string): SiteEmail[] => siteSeeds(clientId).map(card)

export function sampleLatestSiteEmails(): Map<string, SiteEmail> {
  const latest = sampleSiteEmails('sample-ab').at(-1)
  return new Map(latest ? [['sample-ab', latest]] : [])
}

export async function sampleSiteEmailCopy(id: string): Promise<SiteEmailCopy | null> {
  const s = siteSeeds('sample-ab').find((x) => x.id === id)
  return s ? { ...card(s), ...s.make() } : null
}
