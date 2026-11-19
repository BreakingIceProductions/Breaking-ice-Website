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

/** A document to sign, sent from the back office when the owner presses "Create and email". */
export function toSignEmail(m: { name: string; title: string; projectTitle?: string; org?: string; url: string; portal: boolean; signOff: string; producerPhone?: string }) {
  const headline = `${esc(m.title)} is ready for you to sign`
  const intro = `Hi ${m.name}, ${m.title} is ready for you to read and sign${m.portal ? ' in your client portal' : ''}. It takes a minute: read it through, fill in anything it asks for, type your name and sign.`
  const html = layout({
    eyebrow: 'To sign',
    preview: m.portal ? 'Read it and sign in your client portal.' : 'Read it and sign online.',
    body: `
${m.projectTitle ? `<tr><td style="padding:14px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(m.projectTitle)}${m.org ? ` · ${esc(m.org)}` : ''}</td></tr>` : ''}
${para(`<span style="font:bold 24px/30px ${FONT}">${headline}</span>`, 'padding-top:8px')}
${para(esc(intro))}
<tr><td style="padding:22px 32px 0">${button(m.url, 'Read & sign')}</td></tr>
${m.portal
  ? para(`The button works for 7 days. After that, sign in at ${SITE_URL.replace(/^https?:\/\//, '')}/portal with this email address.`, `color:${MUTED};font-size:13px`)
  : para('The link is just for you, so please don’t forward it. You can download a signed copy as soon as you’ve signed.', `color:${MUTED};font-size:13px`)}
${para('Questions? Just reply to this email.', `color:${MUTED};font-size:14px`)}
${para(`${esc(m.signOff)}${m.producerPhone ? ` · ${esc(m.producerPhone)}` : ''}`, 'padding-top:20px;padding-bottom:24px')}`,
  })
  const text = `${m.title} is ready for you to sign\n\n${intro}\n\nRead & sign: ${m.url}\n\n${m.signOff}`
  return { subject: `To sign: ${m.title}`, html, text }
}

/* ── A free-written email from the back office ─────────────────────── */

const BUTTON_LINE = /^\s*\[button:\s*([^\]]{1,60})\]\((https:\/\/[^\s)]+)\)\s*$/i

/** Escapes a line of plain text and turns bare https addresses into links (trailing punctuation stays outside). */
const linkify = (raw: string) =>
  raw
    .split(/(https:\/\/[^\s<>"]+)/g)
    .map((part, i) => {
      if (i % 2 === 0) return esc(part)
      const [, url, trail] = /^(.*?)([.,;:!?)\]']*)$/.exec(part) ?? [part, part, '']
      return `<a href="${esc(url)}" style="color:${COPPER_DEEP}">${esc(url)}</a>${esc(trail)}`
    })
    .join('')

/**
 * An email Josh writes himself (from a lead or project page), in the portal's branded layout.
 * The body is plain text: a blank line starts a new paragraph, a single line break stays a line break,
 * bare https links become links, and a line on its own like [button: Label](https://…) becomes a button.
 */
export function messageEmail({ subject, body, preview, sections }: { subject: string; body: string; preview?: string; sections?: Record<string, EmailSection> }) {
  let source = body.replace(/\r\n?/g, '\n').trim()
  // A portal block's token always stands as its own paragraph, whatever is typed around it.
  if (sections) source = source.replace(/^[ \t]*(\[\[block:[^\]\n]*\]\])[ \t]*$/gm, '\n\n$1\n\n').trim()
  const blockFor = (p?: string) => (sections && p ? sections[p.trim()] : undefined)
  const paragraphs = source.split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim())
  const rows = paragraphs.map((p, i) => {
    const last = i === paragraphs.length - 1 ? 'padding-bottom:24px;' : ''
    const block = blockFor(p)
    // A rule closes a block, unless another block follows straight on (it opens with its own).
    if (block) return `${block.html}${blockFor(paragraphs[i + 1]) ? '' : `\n${RULE_ROW}`}${last ? '\n<tr><td style="height:24px;line-height:24px;font-size:0">&nbsp;</td></tr>' : ''}`
    const btn = BUTTON_LINE.exec(p)
    if (btn) return `<tr><td style="padding:18px 32px ${last ? '24px' : '6px'}">${button(esc(btn[2]), btn[1].trim())}</td></tr>`
    return para(p.split('\n').map(linkify).join('<br>'), last)
  })
  const text = paragraphs.map((p) => {
    const block = blockFor(p)
    if (block) return block.text
    const btn = BUTTON_LINE.exec(p)
    return btn ? `${btn[1].trim()}: ${btn[2]}` : p
  }).join('\n\n')
  const firstLine = (paragraphs.find((p) => !BUTTON_LINE.test(p) && !blockFor(p)) ?? '').replace(/\s+/g, ' ').trim()
  const html = layout({
    eyebrow: 'Breaking Ice Productions',
    preview: (preview ?? firstLine).slice(0, 140) || undefined,
    body: `<tr><td style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>\n${rows.join('\n')}`,
  })
  return { subject, html, text }
}

/* ── Portal blocks dropped into a free-written email ──────────────────── */

/** One block's rows for messageEmail's table, and its plain-text version (heading and address). */
export type EmailSection = { html: string; text: string }

const RULE_ROW = `<tr><td style="padding:22px 32px 0"><div style="border-top:1px solid #E6E1D8;height:1px;line-height:1px;font-size:0">&nbsp;</div></td></tr>`
const thumbRow = (url?: string) =>
  url && /^https:\/\//.test(url) ? `<tr><td style="padding:16px 32px 0"><img src="${esc(url)}" width="536" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''

/**
 * A portal block, set off from Josh's words by a thin rule (messageEmail adds the closing one):
 * a small label, a heading, a short line, an optional list and details, then the button.
 * Everything is plain text in, escaped here.
 */
function section(s: {
  label: string
  thumbUrl?: string
  heading: string
  line?: string
  list?: { mark: '▶' | '✓' | '•'; items: string[] }
  meta?: string[]
  button: { href: string; label: string }
  extra?: { href: string; label: string }
  after?: string
}): EmailSection {
  const list = s.list?.items.length
    ? `<tr><td style="padding:10px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0">${s.list.items
        .map((f) => `<tr><td style="padding:3px 10px 3px 0;color:${COPPER};font:bold 15px ${FONT}">${s.list!.mark}</td><td style="padding:3px 0;font:15px/22px ${FONT};color:${NAVY}">${esc(f)}</td></tr>`)
        .join('')}</table></td></tr>`
    : ''
  const meta = (s.meta ?? []).filter(Boolean).map(esc).join('&nbsp;&nbsp;&nbsp;')
  const html = `${RULE_ROW}
${thumbRow(s.thumbUrl)}
<tr><td style="padding:16px 32px 0;font:600 12px ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED}">${esc(s.label)}</td></tr>
${para(`<span style="font:bold 20px/26px ${FONT}">${esc(s.heading)}</span>`, 'padding-top:6px')}
${s.line ? para(esc(s.line)) : ''}
${list}
${meta ? para(meta, `font-size:13px;color:${MUTED}`) : ''}
<tr><td style="padding:18px 32px 0">${button(esc(s.button.href), s.button.label)}</td></tr>
${s.extra ? para(`<a href="${esc(s.extra.href)}" style="color:${COPPER_DEEP}">${esc(s.extra.label)}</a>`, 'font-size:14px') : ''}
${s.after ? para(esc(s.after), `color:${MUTED};font-size:13px`) : ''}`
  const text = [
    s.heading,
    s.line,
    s.list?.items.length ? s.list.items.map((f) => `${s.list!.mark} ${f}`).join('\n') : '',
    (s.meta ?? []).filter(Boolean).join(' · '),
    `${s.button.label}: ${s.button.href}`,
    s.extra ? `${s.extra.label}: ${s.extra.href}` : '',
  ].filter(Boolean).join('\n')
  return { html, text }
}

/** "Sign in to your portal". A plain link to the sign-in page: never a code (those last 15 minutes), never the address. */
export const portalSignInSection = (m: { projectTitle?: string; portalUrl: string }) =>
  section({
    label: 'Client portal',
    heading: 'Your client portal',
    line: `${m.projectTitle ? `Everything for ${m.projectTitle} is in your client portal.` : 'Everything for your projects is in your client portal.'} Sign in with this email address and we’ll send you a code. No password needed.`,
    button: { href: m.portalUrl, label: 'Sign in to your portal' },
  })

/** Same wording and button as the "New version ready" email. */
export const versionSection = (m: { title: string; version: number; notes?: string; length?: string; due?: string; thumbUrl?: string; portalUrl: string; shareUrl?: string }) =>
  section({
    label: 'New version ready',
    thumbUrl: m.thumbUrl,
    heading: `Version ${m.version} of ${m.title} is ready for you`,
    line: 'Watch it in your client portal, then approve it or leave your notes right there.',
    meta: [m.length ? `Length · ${m.length}` : '', m.due ? `Feedback by · ${m.due}` : ''],
    button: { href: m.portalUrl, label: 'Review & leave feedback' },
    extra: m.shareUrl && /^https:\/\//.test(m.shareUrl) ? { href: m.shareUrl, label: 'Or open it directly on Vimeo' } : undefined,
  })

/** Same amounts and wording as the "Quote ready" email. Amounts come from the stored quote only. */
export const quoteSection = (m: { projectTitle: string; total?: number; from?: boolean; noGst?: boolean; validUntil?: string; portalUrl: string }) =>
  section({
    label: 'Quote',
    heading: `Your quote for ${m.projectTitle} is ready`,
    line: 'You can read it in your client portal and sign it there when you’re happy with it. Signing books your project in.',
    meta: [m.total ? `${m.from ? 'From' : 'Total'} · ${money(m.total)}${m.noGst ? '' : ' + GST'}` : '', m.validUntil ? `Valid until · ${m.validUntil}` : ''],
    button: { href: m.portalUrl, label: 'View quote' },
  })

/** Same wording and button as the "To sign" email, for one document or several. */
export const signSection = (m: { titles: string[]; portalUrl: string }) =>
  section({
    label: 'To sign',
    heading: m.titles.length === 1 ? `${m.titles[0]} is ready for you to sign` : `${m.titles.length} documents are ready for you to sign`,
    line: `${m.titles.length === 1 ? 'It’s' : 'They’re'} ready for you to read and sign in your client portal. It takes a minute: read it through, fill in anything it asks for, type your name and sign.`,
    list: m.titles.length > 1 ? { mark: '•', items: m.titles } : undefined,
    button: { href: m.portalUrl, label: 'Read & sign' },
  })

/** Same wording and button as the "Final files ready" email. */
export const finalsSection = (m: { projectTitle: string; films: string[]; thumbUrl?: string; portalUrl: string }) =>
  section({
    label: 'Delivered',
    thumbUrl: m.thumbUrl,
    heading: `Your final files for ${m.projectTitle} are ready`,
    line: 'Your final videos and every file that goes with them are waiting in your portal, ready to download.',
    list: m.films.length ? { mark: '✓', items: m.films } : undefined,
    button: { href: m.portalUrl, label: 'Download your files' },
    after: 'Keep a copy somewhere safe. If a file is too big to download from the portal, ask for it there and we’ll send you a link.',
  })

/**
 * A payment from the stored records: due, on its way, or received (same wording as the "Payment received" email).
 * `total` is left out when the record has no amount to show; nothing is ever worked out here.
 */
export const paymentSection = (m: { label: string; projectTitle: string; status: 'due' | 'processing' | 'paid'; total?: number; portalUrl: string; payInPortal: boolean }) =>
  section({
    label: 'Payment',
    heading: `${m.status === 'due' ? 'Payment due' : m.status === 'processing' ? 'Payment started' : 'Payment received'}: ${m.label}`,
    line:
      m.status === 'due'
        ? `${m.total ? `${money(m.total)} for ${m.projectTitle} is due.` : `This is due for ${m.projectTitle}.`}${m.payInPortal ? ' You can pay it in your portal by bank transfer or card.' : ''}`
        : m.status === 'processing'
          ? `Your payment${m.total ? ` of ${money(m.total)}` : ''} for ${m.projectTitle} is on its way. We’ll mark it paid in your portal once it clears.`
          : `We’ve received ${m.total ? money(m.total) : 'your payment'} for ${m.projectTitle}. ${m.payInPortal ? 'It shows as paid in your client portal.' : 'Thank you.'}`,
    button: { href: m.portalUrl, label: 'Open your portal' },
  })

export async function notifyJosh(text: string) {
  if (portalEnv.slackWebhook) {
    await fetch(portalEnv.slackWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch((e) =>
      console.error('[portal] slack failed', e),
    )
  }
}
