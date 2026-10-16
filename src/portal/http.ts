import 'server-only'
import { NextResponse } from 'next/server'
import { getSession } from './auth'
import { getProjectForSession } from './data'

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

const hits = new Map<string, number[]>()
/** Light per-key rate limit (per server instance). */
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > max
}

export const ipOf = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

/** The signed-in person and the project they asked for, or null if they don't own it. */
export async function projectAccess(slug: string | null) {
  const session = await getSession()
  if (!session || !slug) return null
  const r = await getProjectForSession(session, slug)
  return r ? { session, ...r } : null
}

/** Same-site check for state-changing requests. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(req.url).host || origin === process.env.NEXT_PUBLIC_SITE_URL
  } catch {
    return false
  }
}
