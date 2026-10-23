import 'server-only'
import { importPKCS8, SignJWT } from 'jose'
import { portalEnv } from '@/portal/config'

/**
 * Access tokens for the portal's Google service account, one per scope.
 * (Drive keeps its own in src/portal/drive.ts; this one is for Calendar.)
 */

const cache = new Map<string, { value: string; exp: number }>()

function serviceAccount(): { client_email: string; private_key: string } {
  const raw = portalEnv.googleServiceAccount.trim()
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
}

export const serviceAccountEmail = () => {
  try {
    return serviceAccount().client_email
  } catch {
    return ''
  }
}

export async function googleToken(scope: string) {
  const hit = cache.get(scope)
  if (hit && hit.exp > Date.now() + 60_000) return hit.value
  const sa = serviceAccount()
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, 'RS256'))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`google token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  cache.set(scope, { value: j.access_token, exp: Date.now() + j.expires_in * 1000 })
  return j.access_token
}
