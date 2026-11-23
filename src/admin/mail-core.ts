import type { MailAddr, MailBody, MailFile } from './mail-shared'

/**
 * The pure parts of the Emails page, kept free of server-only imports so they can be tested on their own:
 * reading addresses, the Gmail searches per client, which clients a message belongs to, reading a Gmail
 * message's parts, the allow-list HTML sanitiser, and building the MIME message that's sent.
 */

/* ── Addresses ─────────────────────────────────────────────────────── */

const EMAIL = /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\]+\.[^\s@,;<>"()[\]\\]+$/
export const isMailAddress = (s: string) => s.length <= 254 && EMAIL.test(s)

/** RFC 2047 encoded words (=?UTF-8?B?...?= / ?Q?), in case a header arrives still encoded. */
export function decodeWords(s: string) {
  return s.replace(/=\?([\w-]+)\?([bq])\?([^?]*)\?=(\s+(?==\?))?/gi, (whole, charset: string, enc: string, text: string) => {
    try {
      const bytes = enc.toLowerCase() === 'b' ? Buffer.from(text, 'base64') : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
      return new TextDecoder(charset.toLowerCase() === 'utf8' ? 'utf-8' : charset).decode(bytes)
    } catch {
      return whole
    }
  })
}

/** `"Smith, Jo" <jo@x.com>, bob@y.com` → [{name, email}], lower-cased addresses, junk dropped. */
export function parseAddressList(header: string | undefined): MailAddr[] {
  if (!header) return []
  const out: MailAddr[] = []
  // Split on commas that aren't inside quotes or angle brackets.
  const parts: string[] = []
  let cur = ''
  let quoted = false
  let angle = 0
  for (const ch of decodeWords(header)) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '<') angle++
    else if (!quoted && ch === '>') angle = Math.max(0, angle - 1)
    if ((ch === ',' || ch === ';') && !quoted && !angle) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  for (const raw of parts) {
    const p = raw.trim()
    if (!p) continue
    const m = /^(.*?)<([^<>]+)>\s*$/.exec(p)
    const email = (m ? m[2] : p).trim().toLowerCase()
    if (!isMailAddress(email)) continue
    const name = (m ? m[1] : '').trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim()
    out.push({ name, email })
  }
  return out
}

/* ── Matching and searching ────────────────────────────────────────── */

export type DirectoryClient = { id: string; emails: string[] }

/** Every client whose people appear in From, To or Cc. One message can belong to more than one client. */
export function matchClients(addrs: MailAddr[], clients: DirectoryClient[]): string[] {
  const seen = new Set(addrs.map((a) => a.email.toLowerCase()))
  return clients.filter((c) => c.emails.some((e) => seen.has(e.toLowerCase()))).map((c) => c.id)
}

/**
 * Gmail searches for a set of addresses: `{from:a to:a cc:a from:b …} -in:draft -in:chats`, a few addresses per
 * search so each stays short. Braces mean "any of these" in Gmail search.
 */
export function gmailQueries(emails: string[], extra = '', perQuery = 12, fields: readonly string[] = ['from', 'to', 'cc']): string[] {
  const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(isMailAddress))]
  const out: string[] = []
  for (let i = 0; i < clean.length; i += perQuery) {
    const group = clean.slice(i, i + perQuery)
    out.push(`{${group.flatMap((e) => fields.map((f) => `${f}:${e}`)).join(' ')}} -in:draft -in:chats${extra ? ` ${extra}` : ''}`)
  }
  return out
}

/* ── Reading a Gmail message ───────────────────────────────────────── */

export type GPart = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GPart[]
}

export const headerOf = (p: GPart | undefined, name: string) => p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

function charsetOf(p: GPart) {
  const ct = headerOf(p, 'Content-Type') ?? ''
  return /charset="?([\w-]+)"?/i.exec(ct)?.[1]?.toLowerCase() ?? 'utf-8'
}

function decodeText(p: GPart) {
  const bytes = b64url(p.body?.data ?? '')
  try {
    return new TextDecoder(charsetOf(p)).decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}

/** The best text and HTML parts, the attachments, and inline images by Content-ID. */
export function readParts(payload: GPart) {
  let html = ''
  let text = ''
  const files: MailFile[] = []
  const inline = new Map<string, MailFile>()
  const walk = (p: GPart) => {
    const type = (p.mimeType ?? '').toLowerCase()
    if (p.parts?.length) {
      p.parts.forEach(walk)
      return
    }
    const disposition = (headerOf(p, 'Content-Disposition') ?? '').toLowerCase()
    if (p.body?.attachmentId || p.filename) {
      if (!p.body?.attachmentId) return
      const f: MailFile = { id: p.body.attachmentId, name: decodeWords(p.filename || 'attachment'), size: p.body.size ?? 0, type: type || 'application/octet-stream' }
      const cid = headerOf(p, 'Content-ID')?.replace(/^<|>$/g, '')
      if (cid && type.startsWith('image/') && !disposition.startsWith('attachment')) inline.set(cid, f)
      else files.push(f)
      return
    }
    if (type === 'text/html' && !html) html = decodeText(p)
    else if (type === 'text/plain' && !text) text = decodeText(p)
  }
  walk(payload)
  return { html, text, files, inline }
}

/* ── Quoted history ───────────────────────────────────────────────── */

/** Splits plain text at the first quoted reply: "On … wrote:", "-----Original Message-----", a "From:" block or ">" lines. */
export function splitQuotedText(text: string): { main: string; quoted?: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let cut = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    const twoLine = `${l} ${lines[i + 1]?.trim() ?? ''}`
    if (/^-{2,}\s*(original message|forwarded message)\s*-{2,}$/i.test(l) || /^_{10,}$/.test(l)) cut = i
    else if (/^on\b.{3,200}\bwrote:$/i.test(l)) cut = i
    else if (i + 1 < lines.length && /^on\b.{3,200}\bwrote:$/i.test(twoLine) && !/wrote:$/i.test(l)) cut = i
    else if (/^from:\s.+/i.test(l) && lines.slice(i + 1, i + 5).some((x) => /^(sent|date|to|subject):\s/i.test(x.trim()))) cut = i
    else if (l.startsWith('>') && lines.slice(i).filter((x) => x.trim()).every((x) => x.trim().startsWith('>'))) cut = i
    if (cut >= 0) break
  }
  if (cut <= 0) return { main: text.trim() }
  const main = lines.slice(0, cut).join('\n').trim()
  const quoted = lines.slice(cut).join('\n').trim()
  return main ? { main, quoted } : { main: text.trim() }
}

/* ── HTML sanitiser (allow-list) ───────────────────────────────────── */

const ALLOWED = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
])
const VOID = new Set(['br', 'hr', 'img'])
/** Dropped with everything inside them. */
const DROP = new Set(['script', 'style', 'head', 'title', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'textarea', 'select', 'button', 'form', 'video', 'audio', 'canvas', 'applet', 'frameset', 'frame', 'xml', 'o:p'])
const ATTRS: Record<string, string[]> = { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], ol: ['start'], abbr: ['title'] }
const COMMON = ['title', 'dir', 'lang']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Decodes the entities an attribute value may hold, so `javascript&#58;` can't sneak past the URL check. */
const unent = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCodePoint(Math.min(0x10ffff, parseInt(h, 16))))
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCodePoint(Math.min(0x10ffff, Number(d))))
    .replace(/&colon;/gi, ':')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

function safeHref(v: string) {
  const u = unent(v).replace(/[\u0000-\u0020\u007f]/g, '')
  return /^(https?:|mailto:)/i.test(u) ? u : null
}

/** Where a quoted reply starts in common mail apps' HTML. */
const QUOTE_START = (tag: string, attrs: string) =>
  tag === 'blockquote' || /class\s*=\s*["']?[^"'>]*\b(gmail_quote|gmail_attr|yahoo_quoted|moz-cite-prefix)\b/i.test(attrs) || /id\s*=\s*["']?(divRplyFwdMsg|appendonsend|mail-editor-reference-message-container)\b/i.test(attrs)

export type SanitiseOptions = {
  /** Inline images by Content-ID → the URL to show them from (our attachment route). */
  cid?: (cid: string) => string | undefined
}

/**
 * Keeps only plain formatting tags with a few attributes. Scripts, styles, forms, event handlers and inline
 * styles are dropped; links must be http(s) or mailto and open in a new tab; images only show when they're
 * inline in the message (cid:), so remote images and tracking pixels never load. Quoted history from the
 * first blockquote or reply marker on is returned separately.
 */
export function sanitizeHtml(input: string, opts: SanitiseOptions = {}): { main: string; quoted?: string } {
  // Only the body matters when there is one.
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)(<\/body>|$)/i.exec(input)
  const html = (bodyMatch ? bodyMatch[1] : input).replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?\?>/g, '')
  const outs: string[][] = [[], []]
  const stacks: string[][] = [[], []]
  let part = 0
  let drop: string | null = null
  let dropDepth = 0
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g
  let last = 0
  const text = (s: string) => {
    if (drop || !s) return
    // Bare < or > that weren't tags become text.
    outs[part].push(s.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
  }
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    text(html.slice(last, m.index))
    last = tagRe.lastIndex
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    const rawAttrs = m[3] ?? ''
    if (drop) {
      if (tag === drop) dropDepth += closing ? -1 : 1
      if (dropDepth <= 0) drop = null
      continue
    }
    if (DROP.has(tag)) {
      if (!closing && !m[4]) {
        drop = tag
        dropDepth = 1
      }
      continue
    }
    if (!closing && part === 0 && QUOTE_START(tag, rawAttrs) && outs[0].join('').replace(/<[^>]*>|&nbsp;|\s/g, '').length > 0) part = 1
    if (!ALLOWED.has(tag)) continue
    const stack = stacks[part]
    if (closing) {
      const at = stack.lastIndexOf(tag)
      if (at < 0) continue
      while (stack.length > at) outs[part].push(`</${stack.pop()}>`)
      continue
    }
    const keep = [...(ATTRS[tag] ?? []), ...COMMON]
    const attrs: string[] = []
    const attrRe = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    for (let a = attrRe.exec(rawAttrs); a; a = attrRe.exec(rawAttrs)) {
      const name = a[1].toLowerCase()
      const value = a[3] ?? a[4] ?? a[5] ?? ''
      if (!keep.includes(name)) continue
      if (name === 'href') {
        const href = safeHref(value)
        if (href) attrs.push(`href="${esc(href)}"`)
      } else if (name === 'src') {
        const v = unent(value).trim()
        const cid = /^cid:(.+)$/i.exec(v)?.[1]
        const url = cid ? opts.cid?.(cid) : undefined
        if (url) attrs.push(`src="${esc(url)}"`)
      } else if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan' || name === 'start') {
        if (/^\d{1,4}$/.test(value)) attrs.push(`${name}="${value}"`)
      } else if (name === 'dir') {
        if (/^(ltr|rtl|auto)$/i.test(value)) attrs.push(`dir="${value.toLowerCase()}"`)
      } else attrs.push(`${name}="${esc(unent(value)).slice(0, 300)}"`)
    }
    // An image with nowhere safe to load from is left out (remote images and tracking pixels).
    if (tag === 'img' && !attrs.some((x) => x.startsWith('src='))) continue
    if (tag === 'a') attrs.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
    if (tag === 'img') attrs.push('loading="lazy"')
    const outTag = tag === 'font' ? 'span' : tag
    outs[part].push(`<${outTag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`)
    if (!VOID.has(tag)) stack.push(outTag)
  }
  text(html.slice(last))
  for (const p of [0, 1]) while (stacks[p].length) outs[p].push(`</${stacks[p].pop()}>`)
  const clean = (s: string) => s.replace(/(<br>\s*){3,}/g, '<br><br>').trim()
  const main = clean(outs[0].join(''))
  const quoted = clean(outs[1].join(''))
  const hasText = (s: string) => s.replace(/<(?!img)[^>]*>|&nbsp;|\s/g, '').length > 0
  if (!hasText(main) && hasText(quoted)) return { main: quoted }
  return hasText(quoted) ? { main, quoted } : { main }
}

/** A message's body as the page shows it: sanitised HTML when there is some, else plain text. */
export function messageBody(html: string, text: string, opts: SanitiseOptions = {}): MailBody {
  if (html.trim()) {
    const s = sanitizeHtml(html, opts)
    if (s.main.replace(/<[^>]*>|&nbsp;|\s/g, '') || s.main.includes('<img')) return { kind: 'html', ...s }
  }
  return { kind: 'text', ...splitQuotedText(text) }
}

/* ── Building the message that's sent ─────────────────────────────── */

export type OutFile = { name: string; type: string; data: Uint8Array }
export type OutMessage = {
  from?: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  files?: OutFile[]
  /** Fixed in tests; random otherwise. */
  boundary?: string
  date?: Date
}

const oneLine = (s: string) => s.replace(/[\r\n\u0000]+/g, ' ').trim()
/** Header text: plain ASCII as is, anything else as a UTF-8 encoded word. */
export function encodeHeader(s: string) {
  const v = oneLine(s)
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`
}
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n')
const msgIdRe = /^<[^<>\s]{1,300}>$/
const safeType = (t: string) => (/^[\w.+-]+\/[\w.+-]+$/.test(t) ? t.toLowerCase() : 'application/octet-stream')
const asciiName = (n: string) => oneLine(n).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'attachment'

/** Raw RFC 5322 message: plain-text UTF-8 body, attachments as base64 parts, threading headers when replying. */
export function buildMime(m: OutMessage): string {
  for (const a of [...m.to, ...(m.cc ?? [])]) if (!isMailAddress(a)) throw new Error(`bad address: ${a.slice(0, 80)}`)
  if (!m.to.length) throw new Error('no recipients')
  const boundary = m.boundary ?? `bi_${Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')}`
  const head: string[] = []
  if (m.from) head.push(`From: ${oneLine(m.from)}`)
  head.push(`To: ${m.to.join(', ')}`)
  if (m.cc?.length) head.push(`Cc: ${m.cc.join(', ')}`)
  head.push(`Subject: ${encodeHeader(m.subject)}`)
  head.push(`Date: ${(m.date ?? new Date()).toUTCString().replace('GMT', '+0000')}`)
  if (m.inReplyTo && msgIdRe.test(m.inReplyTo)) head.push(`In-Reply-To: ${m.inReplyTo}`)
  const refs = (m.references ?? '').split(/\s+/).filter((r) => msgIdRe.test(r))
  if (m.inReplyTo && msgIdRe.test(m.inReplyTo) && !refs.includes(m.inReplyTo)) refs.push(m.inReplyTo)
  if (refs.length) head.push(`References: ${refs.slice(-20).join(' ')}`)
  head.push('MIME-Version: 1.0')
  const text = wrap76(Buffer.from(m.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64'))
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', text].join('\r\n')
  if (!m.files?.length) return [...head, textPart].join('\r\n')
  const parts = [textPart]
  for (const f of m.files) {
    const name = oneLine(f.name).slice(0, 200) || 'attachment'
    const star = `UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
    parts.push(
      [
        `Content-Type: ${safeType(f.type)}; name="${asciiName(name)}"`,
        `Content-Disposition: attachment; filename="${asciiName(name)}"; filename*=${star}`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(Buffer.from(f.data).toString('base64')),
      ].join('\r\n'),
    )
  }
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', ...parts.map((p) => `--${boundary}\r\n${p}`), `--${boundary}--`, ''].join('\r\n')
}
