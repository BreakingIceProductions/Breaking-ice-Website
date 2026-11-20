/** Shared by server pages and the client gallery (a 'use client' module's helpers can't be called on the server). */

const MONTHS = new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** "2026-10-28" → "October 28, 2026", the same on server and browser. */
export const longDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? MONTHS.format(new Date(`${d}T12:00:00Z`)) : '')

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-CA')} ${n === 1 ? one : many}`
