/**
 * Browser helpers for the back-office gallery screens: one way to call the gallery API,
 * and plain-English messages for its error codes.
 */

export type ApiResult = { ok: boolean; status: number; error?: string; [k: string]: unknown }

export async function galleryAction(id: string, body: Record<string, unknown>): Promise<ApiResult> {
  try {
    const r = await fetch(`/api/admin/galleries/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    return { ...j, ok: r.ok && j.ok !== false, status: r.status }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}

export function errorText(r: ApiResult) {
  if (r.status === 401) return 'This sign-in can’t change things, or it has expired.'
  switch (r.error) {
    case 'network':
      return 'Couldn’t reach the server. Check the connection and try again.'
    case 'bad-date':
      return 'That date doesn’t look right.'
    case 'short':
      return 'Passwords need at least 4 characters.'
    case 'set-not-empty':
      return 'That set still has photos. Choose where they should go first.'
    case 'confirm':
      return 'The title you typed doesn’t match.'
    case 'not-found':
      return 'This gallery no longer exists.'
    default:
      return 'That didn’t save. Try again.'
  }
}

/** Formats YYYY-MM-DD as "Nov 20, 2026" without time-zone drift. */
export const fmtDay = (d?: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '')
