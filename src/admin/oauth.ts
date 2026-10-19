import 'server-only'
import { randomBytes } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { sessionSecret } from '@/portal/config'

/** OAuth "state": a random value in a short-lived cookie and in the signed state, which must match on the way back. */
const COOKIE = 'bi_admin_oauth'
const key = () => new TextEncoder().encode(sessionSecret())

export async function startOAuth(app: string) {
  const nonce = randomBytes(16).toString('base64url')
  ;(await cookies()).set(COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 })
  return new SignJWT({ a: app, n: nonce }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(key())
}

export async function checkOAuth(app: string, state: string) {
  const jar = await cookies()
  const nonce = jar.get(COOKIE)?.value
  jar.delete(COOKIE)
  try {
    const { payload } = await jwtVerify(state, key())
    return Boolean(nonce) && payload.a === app && payload.n === nonce
  } catch {
    return false
  }
}
