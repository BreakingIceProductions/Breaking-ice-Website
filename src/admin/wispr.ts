import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { SITE_URL } from '@/lib/site'
import { getConnection, saveConnection } from './data'

/**
 * Wispr Flow's remote MCP server (read-only meeting notes and transcripts), for "Draft from a call →
 * Find it for me". There's no API key: Josh signs in to Wispr once from Settings, the way any MCP
 * client does. Wispr doesn't document how, so this follows the standard MCP authorization spec:
 *
 *  1. Ask the MCP URL who protects it: the `resource_metadata` in the WWW-Authenticate header of a
 *     401, else /.well-known/oauth-protected-resource (RFC 9728), path-inserted first, then root.
 *  2. Read that authorization server's metadata (RFC 8414 oauth-authorization-server, else OpenID).
 *  3. Register this site as an app with Dynamic Client Registration (RFC 7591), once; the client
 *     ID/secret are kept encrypted. WISPR_CLIENT_ID / WISPR_CLIENT_SECRET in Vercel skip this step.
 *  4. Authorization code + PKCE (S256), with `resource` (RFC 8707) set to the MCP server.
 *  5. Tokens are stored encrypted like TickTick's and Zoho's, and refreshed when near expiry.
 *
 * Needs WISPR_MCP_URL: Wispr Flow → Settings → MCP → "All other apps" → Server URL.
 * Any step Wispr refuses is shown in Settings as "Wispr Flow didn't allow this app to connect: …".
 */

export const wisprRedirect = () => `${SITE_URL}/api/admin/connect/wispr/callback`
export const wisprMcpUrl = () => (process.env.WISPR_MCP_URL || '').trim().replace(/\/+$/, '')
export const wisprReady = () => Boolean(wisprMcpUrl())

export class WisprError extends Error {}
const refused = (why: string) => new WisprError(`Wispr Flow didn’t allow this app to connect: ${why}`)

type Client = {
  mcpUrl: string
  redirectUri: string
  resource: string
  authorizationEndpoint: string
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic'
  scope?: string
  registeredAt: string
}
type Conn = { access: string; refresh?: string; exp?: number; connectedAt: string; mcpUrl: string; clientId: string }

const PKCE_COOKIE = 'bi_admin_wispr_pkce'
const ERROR_COOKIE = 'bi_admin_wispr_error'
const cookieOpts = (maxAge: number, path = '/') => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path, maxAge })

/** Only https addresses (http only on this machine), so metadata can't point the server somewhere odd. */
function safeUrl(raw: unknown, what: string): string {
  try {
    const u = new URL(String(raw))
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol === 'https:' || (local && u.protocol === 'http:' && process.env.NODE_ENV !== 'production')) return u.toString()
  } catch {}
  throw refused(`its ${what} address isn’t a secure web address.`)
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** "/.well-known/<name>" inserted before the path (RFC 8414 / 9728), then at the root. */
function wellKnown(base: string, name: string) {
  const u = new URL(base)
  const path = u.pathname.replace(/\/+$/, '')
  return [...new Set([`${u.origin}/.well-known/${name}${path}`, `${u.origin}/.well-known/${name}`])]
}

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Step 1: the protected resource metadata, found from a 401's header or the well-known address. */
async function protectedResource(mcpUrl: string) {
  let fromHeader: string | undefined
  let scopeHint: string | undefined
  try {
    // An unauthenticated MCP "initialize" should come back 401 with a WWW-Authenticate header.
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'breaking-ice-back-office', version: '1' } } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const h = res.headers.get('www-authenticate') ?? ''
    fromHeader = /resource_metadata="([^"]+)"/i.exec(h)?.[1]
    scopeHint = /scope="([^"]+)"/i.exec(h)?.[1]
    await res.body?.cancel().catch(() => {})
  } catch {
    // Unreachable is reported below if nothing else works either.
  }
  for (const url of [...(fromHeader ? [safeUrl(fromHeader, 'resource metadata')] : []), ...wellKnown(mcpUrl, 'oauth-protected-resource')]) {
    const j = await getJson(url)
    if (j && strs(j.authorization_servers).length) return { meta: j, scopeHint }
  }
  return { meta: null, scopeHint }
}

/** Step 2: the authorization server's metadata. */
async function authServer(issuer: string) {
  const urls = [...wellKnown(issuer, 'oauth-authorization-server'), ...wellKnown(issuer, 'openid-configuration'), `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`]
  for (const url of [...new Set(urls)]) {
    const j = await getJson(url)
    if (j && typeof j.authorization_endpoint === 'string' && typeof j.token_endpoint === 'string') return j
  }
  return null
}

/** Steps 1–3, once: where to sign in, where to get tokens, and this site's client ID there. */
async function wisprClient(): Promise<Client> {
  const mcpUrl = wisprMcpUrl()
  if (!mcpUrl) throw new WisprError('Add WISPR_MCP_URL in Vercel first (Wispr Flow → Settings → MCP → Server URL).')
  safeUrl(mcpUrl, 'MCP server')
  const redirectUri = wisprRedirect()
  const manualId = process.env.WISPR_CLIENT_ID?.trim()
  const saved = await getConnection<Client>('wisprClient')
  if (saved && saved.mcpUrl === mcpUrl && saved.redirectUri === redirectUri && (!manualId || saved.clientId === manualId)) return saved

  const { meta, scopeHint } = await protectedResource(mcpUrl)
  // No protected-resource metadata: older MCP servers are their own authorization server.
  const issuer = meta ? strs(meta.authorization_servers)[0] : new URL(mcpUrl).origin
  const as = await authServer(safeUrl(issuer, 'sign-in server'))
  if (!as) throw refused(meta ? 'its sign-in server doesn’t publish the usual OAuth details.' : 'it doesn’t say how apps should sign in (no OAuth details found at the MCP address). Check WISPR_MCP_URL.')
  const methods = strs(as.code_challenge_methods_supported)
  if (methods.length && !methods.includes('S256')) throw refused('it doesn’t support the secure sign-in method (PKCE S256) this app uses.')
  const resource = typeof meta?.resource === 'string' ? meta.resource : mcpUrl
  const scopes = new Set(scopeHint ? scopeHint.split(/\s+/) : strs(meta?.scopes_supported))
  if (strs(as.scopes_supported).includes('offline_access')) scopes.add('offline_access') // so a refresh token comes back
  const scope = [...scopes].filter(Boolean).join(' ') || undefined

  const base = {
    mcpUrl,
    redirectUri,
    resource,
    authorizationEndpoint: safeUrl(as.authorization_endpoint, 'sign-in'),
    tokenEndpoint: safeUrl(as.token_endpoint, 'token'),
    scope,
    registeredAt: new Date().toISOString(),
  }
  const authMethods = strs(as.token_endpoint_auth_methods_supported)

  let client: Client
  if (manualId) {
    const secret = process.env.WISPR_CLIENT_SECRET?.trim()
    client = { ...base, clientId: manualId, clientSecret: secret || undefined, authMethod: !secret ? 'none' : authMethods.includes('client_secret_post') ? 'client_secret_post' : 'client_secret_basic' }
  } else {
    if (typeof as.registration_endpoint !== 'string') throw refused('it doesn’t let new apps register themselves (no dynamic client registration). It may only work with the apps Wispr lists.')
    // A server-side app can keep a secret, so ask for one when offered; otherwise a public client with PKCE.
    const wanted = authMethods.includes('client_secret_post') ? 'client_secret_post' : authMethods.includes('none') || !authMethods.length ? 'none' : authMethods.includes('client_secret_basic') ? 'client_secret_basic' : 'none'
    let res: Response
    try {
      res = await fetch(safeUrl(as.registration_endpoint, 'registration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_name: 'Breaking Ice back office',
          client_uri: SITE_URL,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: wanted,
          ...(scope ? { scope } : {}),
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw refused('its app registration didn’t answer. Try again in a minute.')
    }
    const j = (await res.json().catch(() => ({}))) as { client_id?: string; client_secret?: string; token_endpoint_auth_method?: string; error?: string; error_description?: string }
    if (!res.ok || !j.client_id) throw refused(`it turned down the app registration (${(j.error_description || j.error || `HTTP ${res.status}`).slice(0, 200)}). It may not accept web apps or this redirect address.`)
    const m = j.token_endpoint_auth_method
    const authMethod: Client['authMethod'] = m === 'client_secret_post' || m === 'client_secret_basic' || m === 'none' ? m : j.client_secret ? 'client_secret_basic' : 'none'
    client = { ...base, clientId: j.client_id, clientSecret: j.client_secret, authMethod }
  }
  await saveConnection('wisprClient', client)
  return client
}

const b64url = (b: Buffer) => b.toString('base64url')

/** "Connect Wispr Flow": the sign-in address, with PKCE. The verifier waits in a short-lived cookie for the callback. */
export async function wisprAuthorizeUrl(state: string) {
  const c = await wisprClient()
  const verifier = b64url(randomBytes(32))
  ;(await cookies()).set(PKCE_COOKIE, verifier, cookieOpts(600, '/api/admin/connect/wispr'))
  const u = new URL(c.authorizationEndpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', c.clientId)
  u.searchParams.set('redirect_uri', c.redirectUri)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', b64url(createHash('sha256').update(verifier).digest()))
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('resource', c.resource)
  if (c.scope) u.searchParams.set('scope', c.scope)
  return u.toString()
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

async function token(c: Client, body: Record<string, string>) {
  const params = new URLSearchParams({ ...body, resource: c.resource })
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  if (c.authMethod === 'client_secret_basic' && c.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`).toString('base64')}`
  } else {
    params.set('client_id', c.clientId)
    if (c.authMethod === 'client_secret_post' && c.clientSecret) params.set('client_secret', c.clientSecret)
  }
  let res: Response
  try {
    res = await fetch(c.tokenEndpoint, { method: 'POST', headers, body: params, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new WisprError('Wispr Flow’s sign-in server didn’t answer. Try again in a minute.')
  }
  const t = (await res.json().catch(() => ({}))) as TokenReply
  if (!res.ok || t.error || !t.access_token) {
    // Our registration was dropped on Wispr's side: forget it so the next Connect registers again.
    if (t.error === 'invalid_client' || t.error === 'unauthorized_client') await saveConnection('wisprClient', null).catch(() => {})
    const err = Object.assign(new WisprError((t.error_description || t.error || `HTTP ${res.status}`).slice(0, 200)), { code: t.error })
    throw err
  }
  return t as TokenReply & { access_token: string }
}

const save = (c: Client, t: TokenReply & { access_token: string }, prev?: Conn) =>
  saveConnection('wispr', {
    access: t.access_token,
    refresh: t.refresh_token || prev?.refresh,
    exp: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
    connectedAt: prev?.connectedAt ?? new Date().toISOString(),
    mcpUrl: c.mcpUrl,
    clientId: c.clientId,
  } satisfies Conn)

/** The callback: code → tokens, saved encrypted. */
export async function wisprExchange(code: string) {
  const jar = await cookies()
  const verifier = jar.get(PKCE_COOKIE)?.value
  jar.delete({ name: PKCE_COOKIE, path: '/api/admin/connect/wispr' })
  if (!verifier) throw new WisprError('The sign-in took too long or started in another browser. Press Connect again.')
  const c = await wisprClient()
  try {
    await save(c, await token(c, { grant_type: 'authorization_code', code, redirect_uri: c.redirectUri, code_verifier: verifier }))
  } catch (e) {
    if (e instanceof WisprError) throw refused(`it wouldn’t hand over access (${e.message}).`)
    throw e
  }
}

export async function wisprConnection() {
  if (!wisprReady()) return null
  const c = await getConnection<Conn>('wispr')
  return c?.access && c.mcpUrl === wisprMcpUrl() ? c : null
}

export const wisprConnected = async () => Boolean(await wisprConnection().catch(() => null))

let refreshing: Promise<string> | null = null

/** A live access token for the MCP server, refreshed when it's within two minutes of expiring. */
export async function wisprAccessToken(): Promise<string> {
  const conn = await wisprConnection()
  if (!conn) throw new WisprError('Wispr Flow isn’t connected. Connect it in Settings.')
  if (!conn.exp || conn.exp > Date.now() + 120_000) return conn.access
  if (!conn.refresh) throw new WisprError('The Wispr Flow sign-in has expired. Connect it again in Settings.')
  refreshing ??= (async () => {
    try {
      const c = await wisprClient()
      const t = await token(c, { grant_type: 'refresh_token', refresh_token: conn.refresh! })
      await save(c, t, conn)
      return t.access_token
    } catch (e) {
      if ((e as { code?: string }).code === 'invalid_grant') {
        await saveConnection('wispr', null).catch(() => {})
        throw new WisprError('The Wispr Flow sign-in has expired. Connect it again in Settings.')
      }
      if (e instanceof WisprError) throw new WisprError(`Couldn’t refresh the Wispr Flow sign-in: ${e.message}`)
      throw e
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** A failed connect leaves its reason here for one look at Settings (a cookie, so nothing from the address bar is shown). */
export async function rememberWisprError(message: string) {
  ;(await cookies()).set(ERROR_COOKIE, message.slice(0, 400), cookieOpts(120, '/admin'))
}
export async function lastWisprError() {
  return (await cookies()).get(ERROR_COOKIE)?.value ?? ''
}
