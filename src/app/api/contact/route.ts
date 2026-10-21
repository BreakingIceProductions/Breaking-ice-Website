import { NextResponse } from 'next/server'

/**
 * Contact form endpoint.
 *
 * Each destination switches on when its environment variable is set in Vercel:
 *   RESEND_API_KEY      email to CONTACT_TO (default josh@breakingiceproductions.com)
 *   CONTACT_FROM        sender, on a domain verified in Resend
 *   SLACK_WEBHOOK_URL   Slack incoming webhook
 *   SHEET_WEBHOOK_URL   Google Apps Script web app that appends a row (docs/google-sheet-webhook.gs)
 *
 * With none set, it answers 503 so the form can tell the visitor to email instead.
 */

export const runtime = 'nodejs'

type Enquiry = {
  name: string
  email: string
  organization: string
  type: string
  story: string
  budget: string
  timeline: string
  heard: string
  page: string
}

const MAX = { name: 120, email: 200, organization: 200, type: 120, story: 5000, budget: 80, timeline: 80, heard: 80, page: 300 }

// Light rate limit per IP (per server instance; enough to blunt a burst).
const hits = new Map<string, number[]>()
function limited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 5
}

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
/** Slack mrkdwn treats < > & as markup (<!channel>, links): escape them in visitor text. */
const slackEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-request' }, { status: 400 })
  }

  // Spam traps: a hidden field people never fill, and a minimum time on the page.
  const startedAt = Number(body.startedAt) || 0
  // A real form always sends startedAt; a missing one is treated as a bot too.
  if (clean(body.website, 200) || !startedAt || Date.now() - startedAt < 3000) {
    return NextResponse.json({ ok: true }) // look successful to bots
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ ok: false, error: 'too-many' }, { status: 429 })

  const e: Enquiry = {
    name: clean(body.name, MAX.name),
    email: clean(body.email, MAX.email),
    organization: clean(body.organization, MAX.organization),
    type: clean(body.type, MAX.type),
    story: clean(body.story, MAX.story),
    budget: clean(body.budget, MAX.budget),
    timeline: clean(body.timeline, MAX.timeline),
    heard: clean(body.heard, MAX.heard),
    page: clean(body.page, MAX.page),
  }
  if (!e.name || !e.story || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  }

  const jobs: Promise<string>[] = []
  if (process.env.RESEND_API_KEY) jobs.push(sendEmail(e))
  if (process.env.SLACK_WEBHOOK_URL) jobs.push(sendSlack(e))
  if (process.env.SHEET_WEBHOOK_URL) jobs.push(sendSheet(e))

  if (!jobs.length) return NextResponse.json({ ok: false, error: 'not-configured' }, { status: 503 })

  const results = await Promise.allSettled(jobs)
  const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  failed.forEach((f) => console.error('[contact]', String(f.reason)))
  // One destination landing is enough: the enquiry isn't lost.
  if (failed.length === results.length) return NextResponse.json({ ok: false, error: 'send-failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}

const rows = (e: Enquiry): [string, string][] => [
  ['Name', e.name],
  ['Email', e.email],
  ['Organization', e.organization || '—'],
  ['Needs', e.type || '—'],
  ['Budget', e.budget || '—'],
  ['Timeline', e.timeline || '—'],
  ['Heard about us', e.heard || '—'],
]

async function check(res: Response, label: string) {
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return label
}

async function sendEmail(e: Enquiry) {
  const to = process.env.CONTACT_TO || 'josh@breakingiceproductions.com'
  const from = process.env.CONTACT_FROM || 'Breaking Ice website <website@breakingiceproductions.com>'
  const html = `
    <table style="font:15px/1.5 Arial,sans-serif;color:#18202F;border-collapse:collapse">
      ${rows(e).map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#68748A">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}
    </table>
    <p style="font:15px/1.6 Arial,sans-serif;color:#18202F;white-space:pre-wrap;border-left:3px solid #C9773F;padding-left:12px">${esc(e.story)}</p>
    <p style="font:12px Arial,sans-serif;color:#68748A">Sent from ${esc(e.page || 'the contact page')}. Reply to this email to answer ${esc(e.name)} directly.</p>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: e.email,
      subject: `New enquiry: ${e.name}${e.organization ? ` (${e.organization})` : ''}`,
      html,
      text: `${rows(e).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${e.story}`,
    }),
  })
  return check(res, 'email')
}

async function sendSlack(e: Enquiry) {
  const res = await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `New enquiry from ${e.name}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `New enquiry: ${e.name}`.slice(0, 150) } },
        { type: 'section', fields: rows(e).map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${slackEsc(String(v))}`.slice(0, 2000) })).slice(0, 10) },
        { type: 'section', text: { type: 'mrkdwn', text: `>${slackEsc(e.story.slice(0, 2900)).replace(/\n/g, '\n>')}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `<mailto:${e.email}|Reply to ${slackEsc(e.name)}>` }] },
      ],
    }),
  })
  return check(res, 'slack')
}

async function sendSheet(e: Enquiry) {
  const res = await fetch(process.env.SHEET_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.SHEET_WEBHOOK_SECRET || '', received: new Date().toISOString(), ...e }),
    redirect: 'follow',
  })
  return check(res, 'sheet')
}
