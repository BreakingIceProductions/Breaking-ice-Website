import type { PipelineStage } from '@/sanity/portal/office-constants'

/**
 * Email templates for the composer on the lead and project pages. Shared by the server and the
 * browser, so no server-only imports. Stored in the "bo-email-templates" record (see email-templates.ts);
 * until that exists, the starters below are used.
 */

export type EmailTemplate = {
  _key: string
  name: string
  subject: string
  body: string
  /** Josh has read the wording. Unapproved templates can still be used, with a note to check them. */
  approved: boolean
  /** The pipeline stage it's written for. Listed first in the composer for projects in that stage. */
  stage?: PipelineStage
}

/** A message sent from the composer, kept on the office record (newest first). */
export type SentEmail = { _key: string; at: string; to: string[]; subject: string; body: string; template?: string }

export const LIMITS = { name: 80, subject: 200, body: 10_000, to: 5, templates: 60 }

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'firstName', label: 'Their first name' },
  { key: 'name', label: 'Their full name' },
  { key: 'company', label: 'Their company' },
  { key: 'project', label: 'The project title' },
  { key: 'signOff', label: 'Your sign-off (portal settings)' },
  { key: 'portalUrl', label: 'The client portal address' },
]

export type TemplateVars = Partial<Record<'firstName' | 'name' | 'company' | 'project' | 'signOff' | 'portalUrl', string>>

/** Same {placeholder} syntax as the portal's emails. Unknown or empty ones are left in, so they're easy to spot before sending. */
export const fillTemplate = (t: string, vars: TemplateVars) =>
  t.replace(/\{(\w+)\}/g, (whole, k: string) => {
    const v = vars[k as keyof TemplateVars]
    return v ? v : whole
  })

export const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s)

/** "a@x.com, b@y.com" → cleaned, lower-cased, de-duplicated addresses, plus anything that doesn't look like one. */
export function parseRecipients(input: string | string[]) {
  const parts = (Array.isArray(input) ? input : input.split(/[,;\s]+/)).map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  const list = [...new Set(parts)]
  return { valid: list.filter(isEmail), invalid: list.filter((s) => !isEmail(s)) }
}

/** Plain starting points. Never a price, a date or legal wording; Josh approves each before it reads as approved. */
export const STARTER_TEMPLATES: EmailTemplate[] = [
  {
    _key: 'starter-thanks',
    name: 'Thanks for reaching out',
    stage: 'lead',
    approved: false,
    subject: 'Thanks for getting in touch, {firstName}',
    body: `Hi {firstName},

Thanks for reaching out about {project}. It’s great to hear from {company}, and I’d love to learn more about what you have in mind.

The best next step is a short call, so I can hear the story you want to tell and who it’s for. Just reply with a few times that suit you and I’ll make one of them work.

Talk soon,
{signOff}`,
  },
  {
    _key: 'starter-call',
    name: 'Booking a call',
    stage: 'lead',
    approved: false,
    subject: 'A quick call about {project}',
    body: `Hi {firstName},

I’d love to set up a short call to talk through {project}. It’s a relaxed chat: what you’re hoping to make, who it’s for, and how you’d like people to feel when they watch it.

Reply with a couple of times that work for you, or send me your number and I’ll give you a ring.

Looking forward to it,
{signOff}`,
  },
  {
    _key: 'starter-after-call',
    name: 'After our call',
    stage: 'call',
    approved: false,
    subject: 'Great talking with you, {firstName}',
    body: `Hi {firstName},

Thanks for taking the time to talk. I really enjoyed hearing about {project} and what it means to {company}.

I’m putting together a quote based on what we discussed, and I’ll send it your way as soon as it’s ready. If anything else comes to mind in the meantime, just reply here.

Thanks again,
{signOff}`,
  },
  {
    _key: 'starter-quote',
    name: 'Checking in on the quote',
    stage: 'quoted',
    approved: false,
    subject: 'Checking in on your quote for {project}',
    body: `Hi {firstName},

I wanted to check in on the quote for {project}. Have you had a chance to look it over?

I’m happy to answer any questions or adjust anything that doesn’t quite fit. You can find it any time in your client portal: {portalUrl}

All the best,
{signOff}`,
  },
  {
    _key: 'starter-checkin',
    name: 'Just checking in',
    approved: false,
    subject: 'Just checking in',
    body: `Hi {firstName},

Just checking in to see how things are going on your end. Is there anything you need from me on {project}, or anything I can help with?

No rush at all. Reply whenever it suits you.

Cheers,
{signOff}`,
  },
]

/** The composer's order: templates for this stage first, then the rest, each group as saved. */
export const forStage = (templates: EmailTemplate[], stage?: string) => [
  ...templates.filter((t) => stage && t.stage === stage),
  ...templates.filter((t) => !stage || t.stage !== stage),
]
