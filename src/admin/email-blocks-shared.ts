/**
 * Portal blocks for the email composer: pieces of the client portal (a version to watch, the quote,
 * documents to sign…) dropped into an email as a token on its own line, like [[block:version:abc123]].
 * The token stays in the text (and in the sent record); the server swaps it for the branded section,
 * built from the project's real data, when it previews or sends. Shared by the server and the browser.
 */

export type BlockKind = 'portal' | 'version' | 'quote' | 'sign' | 'finals' | 'payment'

/** One block the composer can offer for a project. */
export type BlockOption = { token: string; kind: BlockKind; label: string; detail?: string }

export const tokenFor = (kind: BlockKind, id?: string) => `[[block:${kind}${id ? `:${id}` : ''}]]`

/** Every token-looking piece of text, well-formed or not, in order of first use. */
export const blockTokens = (body: string) => [...new Set([...body.matchAll(/\[\[block:[^\]\n]*\]\]/g)].map((m) => m[0]))]

/** Tokens that share a line with other text: these can't be turned into a section, so they're pointed out. */
export const inlineTokens = (body: string) =>
  blockTokens(body).filter((t) => body.split('\n').some((line) => line.includes(t) && line.trim() !== t))

/**
 * Puts a token in the body as its own paragraph, at `at` (a caret position) or at the end.
 * Returns the new body and where the caret should go after it.
 */
export function insertToken(body: string, token: string, at?: number) {
  const pos = at === undefined || at < 0 || at > body.length ? body.length : at
  const before = body.slice(0, pos).replace(/[ \t]+$/, '')
  const after = body.slice(pos).replace(/^[ \t]+/, '')
  const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const next = `${before}${lead}${token}${trail}${after}`
  return { body: next, caret: before.length + lead.length + token.length }
}

/** After a drag and drop: every token on its own line with a blank line either side. */
export const tidyTokens = (body: string) =>
  body
    .replace(/[ \t\n]*(\[\[block:[^\]\n]*\]\])[ \t\n]*/g, '\n\n$1\n\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
