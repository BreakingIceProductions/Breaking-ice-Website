import 'server-only'

/**
 * Small checks shared by the back-office gallery routes. Everything from the browser is
 * treated as untrusted: wrong types become undefined, strings are trimmed and cut to length.
 */

export const KEY_RE = /^[\w-]{1,40}$/
const ID_RE = /^[\w.-]{1,100}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A trimmed string no longer than max, or undefined if it isn't a string. */
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)

/** YYYY-MM-DD that is a real calendar day; '' means "clear it". undefined if invalid. */
export function day(v: unknown): string | undefined {
  if (v === '' || v === null) return ''
  if (typeof v !== 'string' || !DAY_RE.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v
}

/** A Sanity document id; '' means "clear it". undefined if invalid. */
export function docId(v: unknown): string | undefined {
  if (v === '' || v === null) return ''
  return typeof v === 'string' && ID_RE.test(v) ? v : undefined
}

/** A list of photo or set keys, all valid, de-duplicated; null if anything is off. */
export function keyList(v: unknown, max = 5000): string[] | null {
  if (!Array.isArray(v) || !v.length || v.length > max) return null
  if (!v.every((k) => typeof k === 'string' && KEY_RE.test(k))) return null
  return [...new Set(v as string[])]
}
