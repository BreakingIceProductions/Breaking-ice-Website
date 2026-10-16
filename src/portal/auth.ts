import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { LINK_MINUTES, SESSION_DAYS, sessionSecret } from './config'
import { DEMO_EMAIL } from './samples'
import type { Session } from './types'

/**
 * Sign-in without passwords or a database:
 *  - "Email me a sign-in link" sends one email holding a link AND a 6-digit code.
 *  - The link carries a signed token that expires in 15 minutes.
 *  - The code is tied to a random value in a short-lived cookie on the device that
 *    asked, so it only works there, and only 5 wrong tries are allowed per request.
 *  - Success sets a signed session cookie for 30 days. Access itself is checked
 *    against the client's contact list on every page, so removing someone in the
 *    Studio locks them out straight away.
 */

const SESSION = 'bi_portal'
const PENDING = 'bi_portal_pending'
const key = () => new TextEncoder().encode(sessionSecret())
const secure = process.env.NODE_ENV === 'production'

export const normEmail = (e: string) => e.trim().toLowerCase()

/** Sign-in link. Emails about a new version carry a longer-lived one (7 days) so one tap opens the project. */
export async function signLinkToken(email: string, next = '/portal', minutes = LINK_MINUTES) {
  return new SignJWT({ e: email, n: next, p: 'link' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${minutes}m`)
    .sign(key())
}

export async function readLinkToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, key())
    if (payload.p !== 'link' || typeof payload.e !== 'string') return null
    return { email: payload.e, next: typeof payload.n === 'string' && payload.n.startsWith('/portal') ? payload.n : '/portal' }
  } catch {
    return null
  }
}

const codeFor = (email: string, nonce: string) => {
  const n = createHmac('sha256', sessionSecret()).update(`${email}|${nonce}`).digest().readUInt32BE(0) % 1_000_000
  return n.toString().padStart(6, '0')
}

/** Starts a sign-in on this device and returns the code to put in the email. */
export async function startPending(email: string) {
  const nonce = randomBytes(12).toString('base64url')
  const jwt = await new SignJWT({ e: email, r: nonce, a: 0, p: 'pending' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${LINK_MINUTES}m`)
    .sign(key())
  ;(await cookies()).set(PENDING, jwt, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: LINK_MINUTES * 60 })
  return codeFor(email, nonce)
}

export async function pendingEmail() {
  const raw = (await cookies()).get(PENDING)?.value
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, key())
    return payload.p === 'pending' ? String(payload.e) : null
  } catch {
    return null
  }
}

export async function checkCode(code: string): Promise<{ ok: true; email: string } | { ok: false; reason: 'expired' | 'wrong' | 'locked' }> {
  const jar = await cookies()
  const raw = jar.get(PENDING)?.value
  if (!raw) return { ok: false, reason: 'expired' }
  let payload: Record<string, unknown>
  try {
    payload = (await jwtVerify(raw, key())).payload as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'expired' }
  }
  const email = String(payload.e)
  const attempts = Number(payload.a) || 0
  if (attempts >= 5) return { ok: false, reason: 'locked' }
  const expected = Buffer.from(codeFor(email, String(payload.r)))
  const given = Buffer.from(code.replace(/\D/g, '').padEnd(6, 'x').slice(0, 6))
  if (given.length === expected.length && timingSafeEqual(given, expected)) {
    jar.delete(PENDING)
    return { ok: true, email }
  }
  const left = new SignJWT({ ...payload, a: attempts + 1 }).setProtectedHeader({ alg: 'HS256' })
  jar.set(PENDING, await left.sign(key()), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: LINK_MINUTES * 60 })
  return { ok: false, reason: attempts + 1 >= 5 ? 'locked' : 'wrong' }
}

export async function startSession(email: string, demo = false) {
  const jwt = await new SignJWT({ e: email, d: demo, p: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${demo ? 1 : SESSION_DAYS}d`)
    .sign(key())
  ;(await cookies()).set(SESSION, jwt, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: (demo ? 1 : SESSION_DAYS) * 86_400,
  })
}

export async function getSession(): Promise<Session | null> {
  if (!sessionSecret()) return null
  const raw = (await cookies()).get(SESSION)?.value
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, key())
    if (payload.p !== 'session' || typeof payload.e !== 'string') return null
    return { email: payload.e, demo: payload.d === true || payload.e === DEMO_EMAIL }
  } catch {
    return null
  }
}

export async function endSession() {
  const jar = await cookies()
  jar.delete(SESSION)
  jar.delete(PENDING)
}
