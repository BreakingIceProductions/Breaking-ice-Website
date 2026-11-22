import 'server-only'
import { randomBytes } from 'node:crypto'
import { SITE_URL } from '@/lib/site'
import { notifyJosh } from '@/portal/email'
import { suggestionButtons } from '@/slack/blocks'
import { portalClient } from '@/portal/data'
import { PROJECT_TYPES, type PipelineStage } from '@/sanity/portal/office-constants'
import { adminSampleMode } from './config'
import { createLead, writeLog, type NewLead } from './data'
import { cleanLeadPatch, isSalesStage, LEAD_BUDGETS, pageHref } from './lead'

/**
 * Automatic lead capture. Nothing here ever emails or messages a lead: the only message sent is
 * one Slack note to Josh (notifyJosh, a no-op until SLACK_WEBHOOK_URL is set).
 *
 *  - leadFromEnquiry: the website's contact form becomes a New lead, or a log line on the lead or
 *    client the address already belongs to.
 *  - Suggested leads: people who look like new clients (from a Wispr Flow call, or an email found by
 *    the email checker on Josh's Mac) wait on Today until Josh adds or dismisses them.
 *
 *   bo-lead-suggestions (_type boLeadSuggestions, free-form like bo-people)
 *     items:          Suggestion[]   newest first, the latest 200
 *     wisprCheckedOn: "YYYY-MM-DD"   the Edmonton day the daily Wispr check last ran (src/admin/wispr-leads.ts)
 */

const key = () => randomBytes(6).toString('hex')
const raw = { cache: 'no-store' as const }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Slack mrkdwn treats < > & as markup: escape them in anything a lead or a call wrote. */
const slackEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/* ── Who an address already belongs to ───────────────────────────────── */

type Match = { id: string; stage: PipelineStage; title: string }

/**
 * The record an address belongs to: an open lead first (a sales-stage project whose lead email or
 * client contact matches), else the client's most recent open project. Null when it's nobody's,
 * or when the client has no open projects (a new lead for that client is right then).
 */
async function findExisting(email: string): Promise<Match | null> {
  const e = email.trim().toLowerCase()
  if (!EMAIL.test(e)) return null
  const rows = await portalClient.fetch<{ _id: string; stage?: PipelineStage; status?: string; title: string }[]>(
    `*[_type == "clientProject" && archived != true && !(_id in path("drafts.**")) && !(_id in path("versions.**")) &&
       (count(client->contacts[lower(email) == $e]) > 0 || lower(*[_id == "bo-state-" + ^._id][0].lead.email) == $e)]
       | order(_updatedAt desc){_id, "stage": pipelineStage, status, title}`,
    { e },
    raw,
  )
  const withStage = rows.map((r) => ({ id: r._id, title: r.title, stage: (r.stage ?? (r.status === 'delivered' ? 'delivered' : 'booked')) as PipelineStage }))
  return withStage.find((r) => isSalesStage(r.stage)) ?? withStage.find((r) => r.stage !== 'paid') ?? null
}

/** True when the address is a client contact's or on any lead (archived ones included): no suggestion is needed for them. */
async function isKnown(email: string) {
  const e = email.trim().toLowerCase()
  if (!EMAIL.test(e)) return false
  const n = await portalClient.fetch<number>(
    `count(*[_type == "client" && count(contacts[lower(email) == $e]) > 0]) + count(*[_type == "boState" && lower(lead.email) == $e])`,
    { e },
    raw,
  )
  return n > 0
}

const adminUrl = (m: { id: string; stage: string }) => `${SITE_URL}${pageHref(m.id, m.stage)}`

/** Makes the lead the way the New lead form does, plus one log line saying where it came from. */
async function makeLead(input: NewLead, from: string) {
  const made = await createLead(input)
  await writeLog(made.id, from, 'lead').catch((e) => console.error('[capture] log line failed', e))
  return made
}

/* ── 1. The website's contact form ───────────────────────────────────── */

/** The fields of the contact form's enquiry (src/app/api/contact/route.ts) that a lead uses. */
export type WebsiteEnquiry = { name: string; email: string; organization: string; type: string; offer: string; story: string; budget: string; timeline: string; heard: string; page: string }

const SOURCE_WORDS: [RegExp, string][] = [
  [/google|search engine|bing/i, 'google'],
  [/referr|word of mouth|friend|colleague/i, 'referral'],
  [/linkedin/i, 'linkedin'],
  [/social|instagram|facebook|tiktok|youtube/i, 'social'],
  [/\bai\b|chatgpt|claude|gemini|perplexity|assistant/i, 'ai'],
  [/repeat|worked with you|past client/i, 'repeat'],
]

const TYPE_WORDS: [RegExp, string][] = [
  [/documentar/i, 'documentary'],
  [/photo/i, 'photo'],
  [/social/i, 'social'],
  [/event/i, 'event'],
  [/retainer|monthly|ongoing/i, 'retainer'],
  [/brand|organi[sz]ation|story film|company film/i, 'brand-film'],
]

/** "$10K–$30K", "Under $5,000", "$100k+": the matching LEAD_BUDGETS value, or empty when the text doesn't say. */
function budgetValue(text: string) {
  const nums = [...text.matchAll(/\$?\s*(\d[\d,.]*)\s*(k|thousand)?/gi)]
    .map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1))
    .filter((n) => Number.isFinite(n) && n >= 500)
  if (!nums.length) return ''
  const low = /under|less than|below|up to|</i.test(text) ? Math.max(...nums) - 1 : Math.min(...nums)
  const v = low < 5000 ? 'under-5k' : low < 10000 ? '5k-10k' : low < 30000 ? '10k-30k' : low < 100000 ? '30k-100k' : '100k-plus'
  return LEAD_BUDGETS.some((b) => b.value === v) ? v : ''
}

const firstMatch = (text: string, table: [RegExp, string][]) => table.find(([re]) => re.test(text))?.[1] ?? ''

/**
 * A contact-form enquiry into the back office. If the address already belongs to a client contact or
 * an open lead, that record gets a log line ("Website enquiry: …") instead of a duplicate lead;
 * otherwise a New lead is made exactly as the New lead form makes one. Returns the record's id and
 * its admin address, or null in sample mode. Throws when the write fails (the caller catches).
 */
export async function leadFromEnquiry(e: WebsiteEnquiry): Promise<{ id: string; url: string; existing: boolean } | null> {
  if (adminSampleMode()) return null
  const email = e.email.trim().toLowerCase()
  const story = e.story.trim()
  const found = await findExisting(email)
  if (found) {
    await writeLog(found.id, `Website enquiry: ${oneLine(story).slice(0, 150)}${oneLine(story).length > 150 ? '…' : ''}`, 'enquiry')
    return { id: found.id, url: adminUrl(found), existing: true }
  }

  const name = oneLine(e.name).slice(0, 120)
  const company = oneLine(e.organization).slice(0, 160) || name
  const projectType = firstMatch(`${e.type} ${e.offer}`, TYPE_WORDS)
  const facts = [
    e.offer && e.offer !== 'Not sure yet' ? `Offer: ${e.offer}` : '',
    e.type && e.type !== e.offer ? `Needs: ${e.type}` : '',
    e.budget ? `Budget: ${e.budget}` : '',
    e.timeline ? `Timeline: ${e.timeline}` : '',
    e.heard ? `Heard about us: ${e.heard}` : '',
    e.page ? `Sent from: ${e.page}` : '',
  ].filter(Boolean)
  const notes = `${story}\n\n(From the website's contact form.${facts.length ? ` ${facts.join(' · ')}` : ''})`
  const lead = cleanLeadPatch({
    budget: budgetValue(e.budget),
    // "Found us": what they picked, when it maps to the list; otherwise the website form itself.
    source: firstMatch(e.heard, SOURCE_WORDS) || 'website',
    notes,
  })
  if (!lead || !name || !EMAIL.test(email)) throw new Error('enquiry did not make a valid lead')
  const made = await makeLead(
    { name, email, company, title: `${company} project`.slice(0, 160), projectType: PROJECT_TYPES.some((t) => t.value === projectType) ? projectType : undefined, lead },
    'From the website contact form',
  )
  return { id: made.id, url: adminUrl({ id: made.id, stage: 'lead' }), existing: false }
}

/* ── 2. Suggested leads ──────────────────────────────────────────────── */

export const SUGGESTION_SOURCES = ['wispr', 'email', 'manual'] as const
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number]

export type Suggestion = {
  _key: string
  source: SuggestionSource
  name: string
  email?: string
  company?: string
  /** One or two sentences, facts only. */
  summary: string
  /** When the call or email happened (ISO). */
  when: string
  /** The Wispr meeting id or email thread id: with the source, what makes a suggestion a duplicate. */
  ref?: string
  /** The meeting title or email subject. */
  title?: string
  status: 'new' | 'added' | 'dismissed'
  addedLeadId?: string
  createdAt: string
}

const DOC = 'bo-lead-suggestions'
const KEEP = 200
type Store = { _rev?: string; items?: Suggestion[]; wisprCheckedOn?: string }

const SAMPLE: Suggestion[] = [
  {
    _key: 'sample-1',
    source: 'wispr',
    name: '[Possible client]',
    email: 'possible@example.com',
    company: '[Regional health authority]',
    summary: '[First call about a short documentary on a community program. They asked about timing for spring filming.]',
    when: new Date(Date.now() - 20 * 3_600_000).toISOString(),
    ref: 'sample-meeting',
    title: '[Intro call]',
    status: 'new',
    createdAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
  },
  {
    _key: 'sample-2',
    source: 'email',
    name: '[Someone who emailed]',
    company: '[Tourism organization]',
    summary: '[Emailed asking whether Breaking Ice does photography for a lodge’s new website.]',
    when: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    ref: 'sample-thread',
    status: 'new',
    createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
  },
]

async function readStore(): Promise<Store> {
  return (await portalClient.fetch<Store | null>(`*[_id == $id][0]{_rev, items, wisprCheckedOn}`, { id: DOC }, raw)) ?? {}
}

/** Every suggestion, newest first. Empty when it can't be read. Sample mode: two made-up ones. */
export async function listSuggestions(): Promise<Suggestion[]> {
  if (adminSampleMode()) return SAMPLE
  try {
    return ((await readStore()).items ?? []).filter((s) => s?._key && s.name)
  } catch (e) {
    console.error('[capture] suggestions read failed', e)
    return []
  }
}

/** One change to the list against the revision it was read at, retried when another write got in first. */
async function change<T>(fn: (s: Store) => { set?: Record<string, unknown>; insert?: Suggestion; result: T } | null): Promise<T | null> {
  await portalClient.createIfNotExists({ _id: DOC, _type: 'boLeadSuggestions', items: [] })
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await readStore()
    const plan = fn(s)
    if (!plan) return null
    let p = portalClient.patch(DOC).ifRevisionId(s._rev ?? '')
    if (plan.set) p = p.set(plan.set)
    if (plan.insert) p = p.setIfMissing({ items: [] }).insert('before', 'items[0]', [plan.insert])
    try {
      await p.commit({ autoGenerateArrayKeys: false })
      if (plan.insert) await portalClient.patch(DOC).unset([`items[${KEEP}:]`]).commit().catch(() => {})
      return plan.result
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 409 && attempt < 2) continue
      throw e
    }
  }
  return null
}

export type NewSuggestion = { source: SuggestionSource; name: string; email?: string; company?: string; summary: string; when?: string; ref?: string; title?: string }

const clip = (v: unknown, max: number) => (typeof v === 'string' ? oneLine(v).slice(0, max) : '')

/** Checks and trims a suggestion from anywhere (the email checker, Claude, the admin). Null when it isn't usable. */
export function cleanSuggestion(input: unknown, forceSource?: SuggestionSource): NewSuggestion | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  const source = forceSource ?? (SUGGESTION_SOURCES.includes(o.source as SuggestionSource) ? (o.source as SuggestionSource) : null)
  const name = clip(o.name, 120)
  const summary = clip(o.summary, 400)
  const email = clip(o.email, 200).toLowerCase()
  const whenMs = typeof o.when === 'string' ? Date.parse(o.when) : NaN
  if (!source || !name || !summary || (email && !EMAIL.test(email))) return null
  return {
    source,
    name,
    summary,
    ...(email && { email }),
    ...(clip(o.company, 160) && { company: clip(o.company, 160) }),
    ...(clip(o.ref, 200) && { ref: clip(o.ref, 200) }),
    ...(clip(o.title, 200) && { title: clip(o.title, 200) }),
    when: Number.isFinite(whenMs) && whenMs < Date.now() + 86_400_000 ? new Date(whenMs).toISOString() : new Date().toISOString(),
  }
}

const SOURCE_LABEL: Record<SuggestionSource, string> = { wispr: 'Wispr', email: 'email', manual: 'the back office' }

/**
 * Adds a suggestion and tells Josh on Slack. False when it's a duplicate (same source and ref, or the
 * same email already waiting) or the email already belongs to a client contact or a lead.
 */
export async function addSuggestion(input: NewSuggestion): Promise<boolean> {
  if (adminSampleMode()) return false
  const s = cleanSuggestion(input, input.source)
  if (!s) return false
  if (s.email && (await isKnown(s.email))) return false
  const item: Suggestion = { _key: key(), ...s, when: s.when ?? new Date().toISOString(), status: 'new', createdAt: new Date().toISOString() }
  const added = await change((st) => {
    const items = st.items ?? []
    const dup = items.some((x) => (s.ref && x.source === s.source && x.ref === s.ref) || (s.email && x.status === 'new' && x.email === s.email))
    return dup ? null : { insert: item, result: true }
  })
  if (!added) return false
  const who = `*${slackEsc(s.name)}*${s.company ? `, ${slackEsc(s.company)}` : ''}`
  await notifyJosh(`New possible lead (from ${SOURCE_LABEL[s.source]}): ${who} — ${slackEsc(s.summary)} <${SITE_URL}/admin|Review on Today>`, {
    buttons: suggestionButtons(item._key, `${SITE_URL}/admin`),
  })
  return true
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', year: 'numeric' })

export class SuggestionError extends Error {}

/**
 * "Add as lead": makes the lead the way the New lead form does (or, when the address now belongs to a
 * client or an open lead, adds a log line there instead) and marks the suggestion added.
 * Returns the record's id and admin path.
 */
export async function acceptSuggestion(itemKey: string): Promise<{ id: string; href: string; existing: boolean }> {
  if (adminSampleMode()) return { id: '', href: '', existing: false }
  const s = (await readStore()).items?.find((x) => x._key === itemKey)
  if (!s) throw new SuggestionError('That suggestion isn’t there any more. Reload the page.')
  if (s.status !== 'new') throw new SuggestionError(s.status === 'added' ? 'That one was already added.' : 'That one was dismissed.')

  const from =
    s.source === 'wispr' ? `From Wispr call: ${s.title || 'untitled meeting'}, ${dayLabel(s.when)}` : s.source === 'email' ? `From an email: ${s.title || 'no subject'}, ${dayLabel(s.when)}` : 'Added from a suggestion'
  let out: { id: string; href: string; existing: boolean }
  const found = s.email ? await findExisting(s.email) : null
  if (found) {
    await writeLog(found.id, `${from}. ${s.summary}`.slice(0, 240), 'lead')
    out = { id: found.id, href: pageHref(found.id, found.stage), existing: true }
  } else {
    const company = s.company || s.name
    const lead = cleanLeadPatch({ notes: `${s.summary}\n\n(${from}.)` })
    if (!lead) throw new SuggestionError('Something in that suggestion isn’t right. Add the lead by hand.')
    const made = await makeLead({ name: s.name, email: s.email ?? '', company, title: `${company} project`.slice(0, 160), lead }, from)
    out = { id: made.id, href: pageHref(made.id, 'lead'), existing: false }
  }
  await change((st) => {
    const i = (st.items ?? []).findIndex((x) => x._key === itemKey)
    return i < 0 ? null : { set: { [`items[_key=="${itemKey}"].status`]: 'added', [`items[_key=="${itemKey}"].addedLeadId`]: out.id }, result: true }
  })
  return out
}

export async function dismissSuggestion(itemKey: string): Promise<void> {
  if (adminSampleMode()) return
  const done = await change((st) => ((st.items ?? []).some((x) => x._key === itemKey) ? { set: { [`items[_key=="${itemKey}"].status`]: 'dismissed' }, result: true } : null))
  if (!done) throw new SuggestionError('That suggestion isn’t there any more. Reload the page.')
}

/* ── For the daily Wispr check ───────────────────────────────────────── */

/**
 * Claims today's Wispr check: true once per Edmonton day (written before the check runs, so two
 * overlapping scheduler runs can't both call Claude). False when it already ran today.
 */
export async function claimWisprCheck(day: string): Promise<boolean> {
  if (adminSampleMode()) return false
  const s = await readStore().catch(() => null)
  if (s?.wisprCheckedOn === day) return false
  try {
    return Boolean(await change((st) => (st.wisprCheckedOn === day ? null : { set: { wisprCheckedOn: day }, result: true })))
  } catch (e) {
    console.error('[capture] wispr claim failed', e)
    return false
  }
}

/** Who the Wispr check should skip: existing client organizations and contact emails, and open leads. */
export async function knownPeople(): Promise<{ orgs: string[]; emails: string[]; leads: string[] }> {
  const r = await portalClient.fetch<{ orgs: string[]; emails: (string | null)[]; leads: { name?: string; org?: string }[] }>(
    `{
      "orgs": *[_type == "client" && !(_id in path("drafts.**"))].organizationName,
      "emails": *[_type == "client" && !(_id in path("drafts.**"))].contacts[].email,
      "leads": *[_type == "clientProject" && archived != true && pipelineStage in ["lead", "call", "proposal", "quoted"] && !(_id in path("drafts.**"))]{
        "name": *[_id == "bo-state-" + ^._id][0].lead.name, "org": client->organizationName }
    }`,
    {},
    raw,
  )
  const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => Boolean(x?.trim())).map((x) => x.trim()))]
  return {
    orgs: uniq(r.orgs).slice(0, 300),
    emails: uniq(r.emails.map((e) => e?.toLowerCase())).slice(0, 500),
    leads: uniq(r.leads.map((l) => [l.name, l.org].filter(Boolean).join(' at '))).slice(0, 200),
  }
}
