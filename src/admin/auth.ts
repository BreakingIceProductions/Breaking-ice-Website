import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LINK_MINUTES, sessionSecret } from '@/portal/config'
import { countSignInAttempt } from '@/portal/data'
import { sameOrigin } from '@/portal/http'
import { adminSampleMode, isAdminEmail } from './config'

/**
 * Back-office sign-in: the same email link + 6-digit code as the client portal,
 * but its own cookies and its own token type, and only addresses in ADMIN_EMAILS
 * get anything. A portal session can never open /admin, and the other way round.
 */

const SESSION = 'bi_admin'
const PENDING = 'bi_admin_pending'
const SESSION_DAYS = 14
const key = () => new TextEncoder().encode(sessionSecret())
const secure = process.env.NODE_ENV === 'production'
const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge })

export async function signAdminLink(email: string) {
  return new SignJWT({ e: email, p: 'admin-link' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${LINK_MINUTES}m`).sign(key())
}

export async function readAdminLink(token: string) {
  try {
    const { payload } = await jwtVerify(token, key())
    return payload.p === 'admin-link' && typeof payload.e === 'string' && isAdminEmail(payload.e) ? payload.e : null
  } catch {
    return null
  }
}

const codeFor = (email: string, nonce: string) =>
  (createHmac('sha256', sessionSecret()).update(`admin|${email}|${nonce}`).digest().readUInt32BE(0) % 1_000_000).toString().padStart(6, '0')

export async function startAdminPending(email: string) {
  const nonce = randomBytes(12).toString('base64url')
  const jwt = await new SignJWT({ e: email, r: nonce, a: 0, p: 'admin-pending' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${LINK_MINUTES}m`).sign(key())
  ;(await cookies()).set(PENDING, jwt, cookieOpts(LINK_MINUTES * 60))
  return codeFor(email, nonce)
}

export async function adminPendingEmail() {
  const raw = (await cookies()).get(PENDING)?.value
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, key())
    return payload.p === 'admin-pending' ? String(payload.e) : null
  } catch {
    return null
  }
}

export async function checkAdminCode(code: string): Promise<{ ok: true; email: string } | { ok: false; reason: 'expired' | 'wrong' | 'locked' }> {
  const jar = await cookies()
  const raw = jar.get(PENDING)?.value
  if (!raw) return { ok: false, reason: 'expired' }
  let payload: Record<string, unknown>
  try {
    payload = (await jwtVerify(raw, key())).payload as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'expired' }
  }
  if (payload.p !== 'admin-pending') return { ok: false, reason: 'expired' }
  const email = String(payload.e)
  const attempts = Number(payload.a) || 0
  if (attempts >= 5 || !(await countSignInAttempt(`admin:${email}`))) return { ok: false, reason: 'locked' }
  const expected = Buffer.from(codeFor(email, String(payload.r)))
  const given = Buffer.from(code.replace(/\D/g, '').padEnd(6, 'x').slice(0, 6))
  if (given.length === expected.length && timingSafeEqual(given, expected) && isAdminEmail(email)) {
    jar.delete(PENDING)
    return { ok: true, email }
  }
  const next = await new SignJWT({ ...payload, a: attempts + 1 }).setProtectedHeader({ alg: 'HS256' }).sign(key())
  jar.set(PENDING, next, cookieOpts(LINK_MINUTES * 60))
  return { ok: false, reason: attempts + 1 >= 5 ? 'locked' : 'wrong' }
}

export async function startAdminSession(email: string) {
  const jwt = await new SignJWT({ e: email, p: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${SESSION_DAYS}d`).sign(key())
  ;(await cookies()).set(SESSION, jwt, cookieOpts(SESSION_DAYS * 86_400))
}

export async function getAdminSession(): Promise<{ email: string; sample?: boolean } | null> {
  if (adminSampleMode()) return { email: 'josh@breakingiceproductions.com', sample: true }
  if (!sessionSecret()) return null
  const raw = (await cookies()).get(SESSION)?.value
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, key())
    // Checked on every request, so removing an address from ADMIN_EMAILS locks it out at once.
    return payload.p === 'admin' && typeof payload.e === 'string' && isAdminEmail(payload.e) ? { email: payload.e } : null
  } catch {
    return null
  }
}

export async function endAdminSession() {
  const jar = await cookies()
  jar.delete(SESSION)
  jar.delete(PENDING)
}

/** For pages: the signed-in admin, or off to the sign-in page. */
export async function requireAdmin() {
  const s = await getAdminSession()
  if (!s) redirect('/admin/sign-in')
  return s
}

/** For API routes: same-site and signed in, or null. */
export async function adminFromRequest(req: Request) {
  if (!sameOrigin(req)) return null
  return getAdminSession()
}
