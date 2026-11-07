import 'server-only'
import { SITE_URL } from '@/lib/site'
import { portalEnv } from './config'

/**
 * Portal emails. Plain table-based HTML, 600px, so Outlook and Gmail agree.
 * Sent through Resend from josh@breakingiceproductions.com; replies go to Josh.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
export const fill = (t: string, vars: Record<string, string | number | undefined>) =>
  t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''))

export async function sendEmail(msg: {
  to: string[]
  subject: string
  html: string
  text: string
  bcc?: string[]
  preview?: string
  attachments?: { filename: string; content: Uint8Array }[]
}) {
  if (!portalEnv.resendKey) {
    console.info('[portal] email not configured; would send:', msg.subject, '→', msg.to.join(', '))
    return { ok: false as const, reason: 'not-configured' }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${portalEnv.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: portalEnv.from,
      to: msg.to,
      bcc: msg.bcc?.length ? msg.bcc : undefined,
      reply_to: portalEnv.replyTo,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })),
    }),
  })
  if (!res.ok) throw new Error(`email ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return { ok: true as const }
}

const NAVY = '#18202F'
const COPPER = '#C9773F'
const COPPER_DEEP = '#A85F2E'
const WARM = '#FAF7F2'
const MUTED = '#4A5468'
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif"

function layout({ eyebrow, preview, body }: { eyebrow: string; preview?: string; body: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light only"><title>Breaking Ice</title></head>
<body style="margin:0;padding:0;background:${WARM}">
${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preview)}&#8199;&#65279;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${WARM}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #E6E1D8">
<tr><td style="background:${NAVY};padding:22px 32px">
  <img src="${SITE_URL}/brand/bi-horizontal-dark-email.png" width="180" alt="Breaking Ice Productions" style="display:block;border:0;width:180px;height:auto;color:${WARM};font:bold 16px ${FONT}">
</td></tr>
<tr><td style="padding:28px 32px 0;font:600 11px/16px ${FONT};letter-spacing:3px;text-transform:uppercase;color:${COPPER_DEEP}">${esc(eyebrow)}</td></tr>
${body}
<tr><td style="padding:24px 32px 28px;border-top:1px solid #E6E1D8;font:12px/18px ${FONT};color:${MUTED}">
  Breaking Ice Productions · Stony Plain, AB · Norman Wells, NT<br>Questions? Just reply to this email.
</td></tr>
</table></td></tr></table></body></html>`
}

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${COPPER};border-radius:999px">
  <a href="${href}" style="display:inline-block;padding:14px 26px;font:bold 15px ${FONT};color:${NAVY};text-decoration:none;border-radius:999px">${esc(label)}</a>
  </td></tr></table>`

const para = (t: string, style = '') => `<tr><td style="padding:12px 32px 0;font:15px/24px ${FONT};color:${NAVY};${style}">${t}</td></tr>`

export function signInEmail({ link, code }: { link: string; code: string }) {
  const html = layout({
    eyebrow: 'Client portal',
    preview: `Your sign-in code is ${code}`,
    body: `
${para(`<span style="font:bold 24px/30px ${FONT}">Sign in to your projects</span>`, 'padding-top:10px')}
${para('Tap the button on this device, or type the code on the sign-in page. Both work for 15 minutes.')}
<tr><td style="padding:22px 32px 0">${button(link, 'Sign in')}</td></tr>
<tr><td style="padding:22px 32px 0;font:13px ${FONT};color:${MUTED}">Your code</td></tr>
<tr><td style="padding:4px 32px 4px;font:bold 34px/40px 'Courier New',monospace;letter-spacing:8px;color:${NAVY}">${code}</td></tr>
${para('Didn’t ask for this? You can ignore it; nothing changes.', `color:${MUTED};font-size:13px`)}`,
  })
  return { subject: `Your Breaking Ice sign-in code: ${code}`, html, text: `Sign in: ${link}\n\nOr type this code on the sign-in page: ${code}\n\nBoth work for 15 minutes.` }
}

export function adminSignInEmail({ link, code }: { link: string; code: string }) {
  const html = layout({
    eyebrow: 'Back office',
    preview: `Your back-office code is ${code}`,
    body: `
${para(`<span style="font:bold 24px/30px ${FONT}">Sign in to the back office</span>`, 'padding-top:10px')}
${para('Tap the button on this device, or type the code on the sign-in page. Both work for 15 minutes.')}
<tr><td style="padding:22px 32px 0">${button(link, 'Open the back office')}</td></tr>
<tr><td style="padding:22px 32px 0;font:13px ${FONT};color:${MUTED}">Your code</td></tr>
<tr><td style="padding:4px 32px 4px;font:bold 34px/40px 'Courier New',monospace;letter-spacing:8px;color:${NAVY}">${code}</td></tr>
${para('Didn’t ask for this? Someone typed your address on the sign-in page. Nothing happens unless the code is used.', `color:${MUTED};font-size:13px`)}`,
  })
  return { subject: `Back office sign-in code: ${code}`, html, text: `Sign in: ${link}\n\nOr type this code: ${code}\n\nBoth work for 15 minutes.` }
}

type VersionMail = {
  kind: 'new' | 'reminder'
  subject: string
  intro: string
  projectTitle: string
  org: string
  title: string
  version: number
  notes?: string
  length?: string
  due?: string
  thumbUrl?: string
  portalUrl: string
  shareUrl?: string
  signOff: string
  producerPhone?: string
}

export function versionEmail(m: VersionMail) {
  const meta = [m.length && `Length · ${esc(m.length)}`, m.due && `Feedback by · ${esc(m.due)}`].filter(Boolean).join('&nbsp;&nbsp;&nbsp;')
  const headline =
    m.kind === 'new' ? `Version ${m.version} of ${esc(m.title)} is ready for you` : `${esc(m.title)} is still waiting for your eyes`
  const html = layout({
    eyebrow: m.kind === 'new' ? 'New version ready' : 'Reminder',
    preview: [m.due && `Feedback by ${m.due}`, m.length && `takes about ${m.length} to watch`].filter(Boolean).join(' · '),
    body: `
${m.thumbUrl && m.kind === 'new' ? `<tr><td style="padding:16px 32px 0"><img src="${m.thumbUrl}" width="536" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}
<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)} · ${esc(m.org)}</td></tr>
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${para(esc(m.intro))}
${m.notes && m.kind === 'new' ? para(esc(m.notes), `border-left:3px solid ${COPPER};padding-left:14px;margin-left:32px`) : ''}
${meta ? para(meta, `font-size:13px;color:${MUTED}`) : ''}
<tr><td style="padding:22px 32px 0">${button(m.portalUrl, 'Review & leave feedback')}</td></tr>
${m.shareUrl ? para(`<a href="${m.shareUrl}" style="color:${COPPER_DEEP}">Or open it directly on Vimeo</a>`, 'font-size:14px') : ''}
${m.kind === 'reminder' ? para('Need more time? Just reply to this email.', `color:${MUTED};font-size:14px`) : ''}
${para(`${esc(m.signOff)}${m.producerPhone ? ` · ${esc(m.producerPhone)}` : ''}`, 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `${headline.replace(/&amp;/g, '&')}\n\n${m.intro}\n\n${m.notes && m.kind === 'new' ? m.notes + '\n\n' : ''}Review & leave feedback: ${m.portalUrl}${m.shareUrl ? `\nOr open it on Vimeo: ${m.shareUrl}` : ''}\n\n${m.signOff}`
  return { subject: m.subject, html, text }
}

/** Several versions sent from the back office together: one email instead of one per video. */
export function reviewBatchEmail(m: { name: string; projectTitle: string; org: string; items: { title: string; length?: string }[]; thumbUrl?: string; portalUrl: string; signOff: string; producerPhone?: string; note?: string }) {
  const n = m.items.length
  const what = n === 1 ? m.items[0].title : `${n} new videos`
  const headline = n === 1 ? `${esc(what)} is ready for you` : `${n} new videos are ready for you`
  const intro = `Hi ${m.name}, ${n === 1 ? 'a new video is' : 'these are'} ready for your review in your client portal. Watch ${n === 1 ? 'it' : 'each one'}, then approve it or leave your notes right there.`
  const list = `<tr><td style="padding:12px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0">${m.items
    .map((f) => `<tr><td style="padding:3px 10px 3px 0;color:${COPPER};font:bold 15px ${FONT}">▶</td><td style="padding:3px 0;font:15px/22px ${FONT};color:${NAVY}">${esc(f.title)}${f.length ? `<span style="color:${MUTED};font-size:13px">&nbsp;&nbsp;${esc(f.length)}</span>` : ''}</td></tr>`)
    .join('')}</table></td></tr>`
  const html = layout({
    eyebrow: 'Ready for review',
    preview: n === 1 ? 'Ready for your review in the client portal.' : `${m.items.map((f) => f.title).join(', ')}`.slice(0, 140),
    body: `
${m.thumbUrl ? `<tr><td style="padding:16px 32px 0"><img src="${m.thumbUrl}" width="536" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}
<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)} · ${esc(m.org)}</td></tr>
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${m.note ? para(`<div style="border-left:3px solid ${MUTED};padding-left:14px">${esc(m.note).replace(/\n/g, '<br>')}</div>`) : ''}
${para(esc(intro))}
${list}
<tr><td style="padding:22px 32px 0">${button(m.portalUrl, 'Review & leave feedback')}</td></tr>
${para(`The button works for 7 days. After that, sign in at ${SITE_URL.replace(/^https?:\/\//, '')}/portal with this email address.`, `color:${MUTED};font-size:13px`)}
${para(`${esc(m.signOff)}${m.producerPhone ? ` · ${esc(m.producerPhone)}` : ''}`, 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `${headline.replace(/&amp;/g, '&')}\n\n${m.note ? m.note + '\n\n' : ''}${intro}\n\n${m.items.map((f) => `▶ ${f.title}${f.length ? ` (${f.length})` : ''}`).join('\n')}\n\nReview & leave feedback: ${m.portalUrl}\n\n${m.signOff}`
  return { subject: n === 1 ? `Ready for review: ${m.items[0].title}` : `Ready for review: ${n} new videos for ${m.projectTitle}`, html, text }
}

/** Once, when a project is marked Delivered: the finals and every file are waiting in the portal. */
export function deliveryEmail(m: { name: string; projectTitle: string; org: string; films: string[]; thumbUrl?: string; portalUrl: string; signOff: string; producerPhone?: string }) {
  const headline = `Your final files for ${esc(m.projectTitle)} are ready`
  const intro = `Hi ${m.name}, everything for ${m.projectTitle} is finished. Your final videos and every file that goes with them are waiting in your portal, ready to download.`
  const list = m.films.length
    ? `<tr><td style="padding:12px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0">${m.films
        .map((f) => `<tr><td style="padding:3px 10px 3px 0;color:${COPPER};font:bold 15px ${FONT}">✓</td><td style="padding:3px 0;font:15px/22px ${FONT};color:${NAVY}">${esc(f)}</td></tr>`)
        .join('')}</table></td></tr>`
    : ''
  const html = layout({
    eyebrow: 'Delivered',
    preview: 'Your final videos and files are ready to download.',
    body: `
${m.thumbUrl ? `<tr><td style="padding:16px 32px 0"><img src="${m.thumbUrl}" width="536" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}
<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)} · ${esc(m.org)}</td></tr>
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${para(esc(intro))}
${list}
<tr><td style="padding:22px 32px 0">${button(m.portalUrl, 'Download your files')}</td></tr>
${para('Keep a copy somewhere safe. If a file is too big to download from the portal, ask for it there and we’ll send you a link.', `color:${MUTED};font-size:14px`)}
${para(`${esc(m.signOff)}${m.producerPhone ? ` · ${esc(m.producerPhone)}` : ''}`, 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `Your final files for ${m.projectTitle} are ready\n\n${intro}\n\n${m.films.map((f) => `✓ ${f}`).join('\n')}${m.films.length ? '\n\n' : ''}Download your files: ${m.portalUrl}\n\n${m.signOff}`
  return { subject: `Your final files are ready: ${m.projectTitle}`, html, text }
}

const money = (n?: number) => (n ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '')

/** A quote shared from the back office: review it and sign in the portal. */
export function quoteEmail(m: { name: string; projectTitle: string; org: string; total?: number; from?: boolean; validUntil?: string; again: boolean; portalUrl: string; signOff: string; producerPhone?: string; note?: string; noGst?: boolean }) {
  const headline = m.again ? `Your updated quote for ${esc(m.projectTitle)}` : `Your quote for ${esc(m.projectTitle)} is ready`
  // A personal note already greets them, so the standard line doesn't say hi again.
  const lead = m.again ? 'here’s the latest version of the quote' : 'the quote for ' + m.projectTitle + ' is ready'
  const intro = `${m.note ? lead[0].toUpperCase() + lead.slice(1) : `Hi ${m.name}, ${lead}`}. You can read it in your client portal and sign it there when you’re happy with it. Signing books your project in.`
  const steps = [
    'Press Review & sign below. It signs you in to your portal, no password needed.',
    m.from ? 'Read through the quote and pick the package that suits you.' : 'Read through the quote.',
    'Sign at the bottom of the page when you’re ready. You’ll get a signed copy by email.',
  ]
  const meta = [m.total && `${m.from ? 'From' : 'Total'} · ${money(m.total)}${m.noGst ? '' : ' + GST'}`, m.validUntil && `Valid until · ${esc(m.validUntil)}`].filter(Boolean).join('&nbsp;&nbsp;&nbsp;')
  const html = layout({
    eyebrow: 'Quote',
    preview: 'Review your quote and sign it in your client portal.',
    body: `
<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)} · ${esc(m.org)}</td></tr>
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${m.note ? para(`<div style="border-left:3px solid ${MUTED};padding-left:14px">${esc(m.note).replace(/\n/g, '<br>')}</div>`) : ''}
${para(esc(intro))}
${meta ? para(meta, `font-size:13px;color:${MUTED}`) : ''}
${para(steps.map((t, i) => `${i + 1}.&nbsp; ${esc(t)}`).join('<br>'), 'font-size:14px')}
<tr><td style="padding:22px 32px 0">${button(m.portalUrl, 'Review & sign')}</td></tr>
${para(`The button works for 7 days. After that, sign in at ${SITE_URL.replace(/^https?:\/\//, '')}/portal with this email address.`, `color:${MUTED};font-size:13px`)}
${para('Questions, or something to change? Just reply to this email.', `color:${MUTED};font-size:14px`)}
${para(`${esc(m.signOff)}${m.producerPhone ? ` · ${esc(m.producerPhone)}` : ''}`, 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `${headline.replace(/&amp;/g, '&')}\n\n${m.note ? `${m.note}\n\n` : ''}${intro}\n\n${steps.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nReview & sign: ${m.portalUrl}\n(Works for 7 days. After that, sign in at ${SITE_URL}/portal with this email address.)\n\n${m.signOff}`
  return { subject: m.again ? `Updated quote: ${m.projectTitle}` : `Your quote: ${m.projectTitle}`, html, text }
}

/** To whoever paid: a short confirmation (Stripe's own receipt is linked when there is one). */
export function paidEmail(m: { name: string; projectTitle: string; org: string; label: string; total: number; processing: boolean; receiptUrl?: string; portalUrl: string; signOff: string }) {
  const headline = m.processing ? `Payment started: ${esc(m.label)}` : `Payment received: ${esc(m.label)}`
  const intro = m.processing
    ? `Thanks ${m.name}. Your payment of ${money(m.total)} for ${m.projectTitle} is on its way. We’ll mark it paid in your portal once it clears.`
    : `Thanks ${m.name}. We’ve received ${money(m.total)} for ${m.projectTitle}. It shows as paid in your client portal.`
  const html = layout({
    eyebrow: 'Payment',
    preview: m.processing ? 'Your payment is on its way.' : 'Thanks, your payment is in.',
    body: `
<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)} · ${esc(m.org)}</td></tr>
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${para(esc(intro))}
${m.receiptUrl ? para(`<a href="${m.receiptUrl}" style="color:${NAVY}">View your receipt</a>`, 'font-size:14px') : ''}
<tr><td style="padding:22px 32px 0">${button(m.portalUrl, 'Open your portal')}</td></tr>
${para(esc(m.signOff), 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `${headline}\n\n${intro}${m.receiptUrl ? `\n\nReceipt: ${m.receiptUrl}` : ''}\n\n${m.portalUrl}\n\n${m.signOff}`
  return { subject: `${m.processing ? 'Payment started' : 'Payment received'}: ${m.projectTitle}`, html, text }
}

/** To the signer, with the signed PDF attached. */
export function signedEmail(m: { name: string; projectTitle: string; org: string; at: string; deposit?: number; booked: boolean; portalUrl: string; signOff: string; producerPhone?: string; payInPortal?: boolean; noGst?: boolean }) {
  const headline = `Signed: ${esc(m.projectTitle)}`
  const intro = `Thanks ${m.name}. Your signed quote is attached, with a certificate page that records when and how it was signed. You’ll also find it in your client portal any time.`
  const next = m.payInPortal && m.deposit && !m.booked
    ? `Your project is booked as soon as your deposit (${money(m.deposit)}) arrives. You can pay it in your portal by bank transfer or card.`
    : m.booked
    ? `Your project is booked.${m.deposit ? (m.payInPortal ? ` You can pay the deposit (${money(m.deposit)}) in your portal by bank transfer or card.` : ` The deposit invoice (${money(m.deposit)}${m.noGst ? '' : ' + GST'}) follows separately.`) : ''} We’ll be in touch shortly to lock in dates.`
    : 'We’ll be in touch shortly about next steps.'
  const html = layout({
    eyebrow: 'Quote signed',
    preview: 'Your signed quote is attached.',
    body: `
<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)} · ${esc(m.org)}</td></tr>
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${para(esc(intro))}
${para(esc(next))}
${para(`Signed ${esc(m.at)}`, `font-size:13px;color:${MUTED}`)}
<tr><td style="padding:22px 32px 0">${button(m.portalUrl, 'Open your portal')}</td></tr>
${para(`${esc(m.signOff)}${m.producerPhone ? ` · ${esc(m.producerPhone)}` : ''}`, 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `Signed: ${m.projectTitle}\n\n${intro}\n\n${next}\n\nSigned ${m.at}\n\n${m.portalUrl}\n\n${m.signOff}`
  return { subject: `Signed quote: ${m.projectTitle}`, html, text }
}

export async function notifyJosh(text: string) {
  if (portalEnv.slackWebhook) {
    await fetch(portalEnv.slackWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch((e) =>
      console.error('[portal] slack failed', e),
    )
  }
}
