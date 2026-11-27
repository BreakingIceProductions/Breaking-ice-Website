import type { MailBody } from './mail-shared'

/**
 * Turns an email into the short text a Messages-style bubble shows. Pure (no DOM, no server imports), so the browser
 * runs it and it can be tested on its own. The full original stays on the message; the bubble only hides the clutter.
 *
 * The rules, in order:
 *  1. HTML becomes plain text (block tags and <br> become line breaks, entities decoded). Quoted history the server
 *     already split off (`body.quoted`) is never shown.
 *  2. Cut at the first quoted reply: "On … wrote:" (on one or two lines), "-----Original Message-----",
 *     "---------- Forwarded message ----------", a "From:" line with Sent/Date/To/Subject under it, a long "____" rule,
 *     or the first line starting with ">".
 *  3. Cut at a signature: the "-- " delimiter, or a phone footer ("Sent from my iPhone", "Get Outlook for iOS"…).
 *  4. Cut at a disclaimer: a line that starts like one ("CONFIDENTIALITY NOTICE", "This email and any attachments…",
 *     "Please consider the environment…").
 *  5. After a closing line ("Thanks,", "Best,", "Cheers!"…), drop the signature block under it when it is up to six
 *     short lines (name, title, company, phone, website). The closing itself stays.
 *  6. Tidy: trailing spaces off, runs of blank lines down to one.
 * If all that leaves nothing, the bubble falls back to the start of the original text.
 */

export type Stripped = { text: string; /** Something was hidden, so the bubble hints that tapping shows more. */ trimmed: boolean }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•', copy: '©' }

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|table|ul|ol|h[1-6]|blockquote|pre|hr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole
      }
      return ENTITIES[e.toLowerCase()] ?? whole
    })
    .replace(/ /g, ' ')
}

const ON_WROTE = /^on\b.{3,240}\bwrote:\s*$/i
const QUOTE_HEADER = [/^-{2,}\s*(original message|forwarded message)\s*-{2,}$/i, /^begin forwarded message:?$/i, /^_{10,}$/]
const SIGNATURE = [/^--\s?$/, /^—\s?$/, /^sent from my (iphone|ipad|android|samsung|galaxy|pixel|mobile|blackberry)/i, /^sent from (mail|outlook) for /i, /^get outlook for (ios|android)/i, /^sent via /i, /^sent from yahoo mail/i]
const DISCLAIMER = [
  /^(confidentiality|privileged|disclaimer|legal notice|important notice)\b/i,
  /^this (e-?mail|message|communication|transmission)( and any (attachments?|files?))?( transmitted with it)? (is|are|may|contains?|was) /i,
  /^the information (contained )?in this (e-?mail|message|communication)/i,
  /^if you (are not|have received this)/i,
  /^please consider the environment/i,
  /^(avis de confidentialité|ce courriel)/i,
]
const CLOSING = /^(thanks|thank you|many thanks|thx|cheers|best|best regards|best wishes|kind regards|warm regards|regards|warmly|sincerely|all the best|talk soon|take care|respectfully)(\s+(so much|again|very much|a lot|in advance|all|everyone|for everything))?\s*[,.!…]*\s*$/i

function cutAt(lines: string[]): { lines: string[]; cut: boolean } {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    const next = lines[i + 1]?.trim() ?? ''
    const hit =
      ON_WROTE.test(l) ||
      (next && !/wrote:\s*$/i.test(l) && /^on\b/i.test(l) && ON_WROTE.test(`${l} ${next}`)) ||
      QUOTE_HEADER.some((r) => r.test(l)) ||
      (/^from:\s.+/i.test(l) && lines.slice(i + 1, i + 5).some((x) => /^(sent|date|to|subject|cc):\s/i.test(x.trim()))) ||
      l.startsWith('>') ||
      SIGNATURE.some((r) => r.test(lines[i].replace(/\s+$/, ' ').trimStart()) || r.test(l)) ||
      (i > 0 && DISCLAIMER.some((r) => r.test(l)))
    if (hit) return { lines: lines.slice(0, i), cut: true }
  }
  return { lines, cut: false }
}

/** Drops a short signature block under the last closing line ("Thanks,\nJo Smith\nComms lead\n780-555-0100"). */
function dropSignOffBlock(lines: string[]): { lines: string[]; cut: boolean } {
  let end = lines.length
  while (end > 0 && !lines[end - 1].trim()) end--
  for (let i = end - 1; i >= Math.max(0, end - 7); i--) {
    if (!CLOSING.test(lines[i].trim())) continue
    const after = lines.slice(i + 1, end).filter((l) => l.trim())
    if (after.length && after.length <= 6 && after.every((l) => l.trim().length <= 70)) return { lines: lines.slice(0, i + 1), cut: true }
    return { lines: lines.slice(0, end), cut: false }
  }
  return { lines: lines.slice(0, end), cut: false }
}

/** The short version of a plain-text email. */
export function stripText(text: string): Stripped {
  const original = text.replace(/\r\n?/g, '\n')
  const a = cutAt(original.split('\n'))
  const b = dropSignOffBlock(a.lines)
  const out = b.lines
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!out) {
    const start = original.trim().slice(0, 280)
    return { text: start, trimmed: start.length < original.trim().length }
  }
  return { text: out, trimmed: a.cut || b.cut || out.length < original.trim().length - 2 }
}

/** The bubble text for a message body: HTML read as text, the server's quoted part left out, then the rules above. */
export function bubbleText(body: MailBody): Stripped {
  const plain = body.kind === 'html' ? htmlToText(body.main) : body.main
  const s = stripText(plain)
  return { text: s.text, trimmed: s.trimmed || Boolean(body.quoted?.trim()) }
}
