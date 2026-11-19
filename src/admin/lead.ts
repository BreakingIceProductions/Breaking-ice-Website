import { PROJECT_TYPES } from '@/sanity/portal/office-constants'
import type { LeadDetails } from './types'

/** Lead lists and helpers shared by the server and the browser. No server-only imports. */

export const SALES_STAGES = ['lead', 'call', 'proposal', 'quoted']
export const isSalesStage = (stage: string) => SALES_STAGES.includes(stage)

/** A lead opens its lead page; a booked project opens the full project page. */
export const pageHref = (id: string, stage: string) => `/admin/${isSalesStage(stage) ? 'leads' : 'projects'}/${encodeURIComponent(id)}`

export const LEAD_SOURCES = [
  { title: 'Google search', value: 'google' },
  { title: 'Referral', value: 'referral' },
  { title: 'LinkedIn', value: 'linkedin' },
  { title: 'Instagram or Facebook', value: 'social' },
  { title: 'AI assistant', value: 'ai' },
  { title: 'Repeat client', value: 'repeat' },
  { title: 'Other', value: 'other' },
]

/** The empty value reads "Not discussed". */
export const LEAD_BUDGETS = [
  { title: 'Under $5K', value: 'under-5k' },
  { title: '$5K to $10K', value: '5k-10k' },
  { title: '$10K to $30K', value: '10k-30k' },
  { title: '$30K to $100K', value: '30k-100k' },
  { title: '$100K+', value: '100k-plus' },
]

export const CONTACT_KINDS = [
  { title: 'Phone call', value: 'phone' },
  { title: 'Text', value: 'text' },
  { title: 'In person', value: 'in-person' },
  { title: 'Video call', value: 'video' },
  { title: 'Email', value: 'email' },
  { title: 'Other', value: 'other' },
]

/** `declined` files it under Declined in the archive (and counts against the win rate); the rest are plain archives. */
export const LOST_REASONS = [
  { title: 'Lost (they went another way)', value: 'lost', declined: true },
  { title: 'Not a fit', value: 'not-a-fit', declined: true },
  { title: 'No-show', value: 'no-show', declined: true },
  { title: 'Just archive', value: 'archive', declined: false },
]

export const budgetTitle = (value?: string) => LEAD_BUDGETS.find((b) => b.value === value)?.title
export const typeTitle = (value?: string) => PROJECT_TYPES.find((t) => t.value === value)?.title

/** Log kinds written by "Log contact" are "contact-<kind>". */
export const isContactLog = (kind?: string) => Boolean(kind?.startsWith('contact-'))

const TEXT: Record<Exclude<keyof LeadDetails, 'source' | 'budget' | 'lostReason' | 'startDate' | 'callDate' | 'callTime'>, number> = {
  name: 120,
  email: 200,
  phone: 40,
  website: 300,
  notes: 6000,
}
const LISTS = { source: LEAD_SOURCES, budget: LEAD_BUDGETS, lostReason: LOST_REASONS }

/**
 * Checks a patch from the browser: known fields only, trimmed and capped, list values from their lists.
 * An empty string clears the field. Returns null when anything is off.
 */
export function cleanLeadPatch(input: unknown): Partial<Record<keyof LeadDetails, string>> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out: Partial<Record<keyof LeadDetails, string>> = {}
  for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
    if (typeof raw !== 'string') return null
    const v = raw.trim()
    if (k in TEXT) out[k as keyof typeof TEXT] = v.slice(0, TEXT[k as keyof typeof TEXT])
    else if (k in LISTS) {
      if (v && !LISTS[k as keyof typeof LISTS].some((x) => x.value === v)) return null
      out[k as keyof typeof LISTS] = v
    } else if (k === 'startDate' || k === 'callDate') {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
      out[k] = v
    } else if (k === 'callTime') {
      if (v && !/^\d{2}:\d{2}$/.test(v)) return null
      out[k] = v
    } else return null
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return null
  return out
}

/** "14:30" → "2:30 p.m." */
export const fmtTime = (hhmm?: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return ''
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

/** A typed web address as a link that opens: adds https:// when it's missing. Empty when it isn't a web address. */
export const webHref = (site?: string) => {
  const s = (site ?? '').trim()
  if (!s || /\s/.test(s) || !s.includes('.')) return ''
  return /^https?:\/\//i.test(s) ? s : /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : `https://${s}`
}
