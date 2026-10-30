import 'server-only'
import { SITE_URL } from '@/lib/site'
import { adminEnv, zohoReady } from './config'
import { getConnection, getZohoContactId, saveConnection, setZohoContactId } from './data'
import { addDays, today } from './dates'
import type { OfficeClient } from './types'

/**
 * Zoho Books: the back office finds or creates the customer and saves DRAFT
 * invoices; you send them from Zoho Books. Access tokens last an hour; the
 * refresh token doesn't expire, so one Connect lasts until you disconnect.
 * Breaking Ice's books are on Zoho's Canadian data centre (zohocloud.ca).
 */

const SCOPES = 'ZohoBooks.contacts.ALL,ZohoBooks.invoices.ALL,ZohoBooks.settings.READ'
export const zohoRedirect = () => `${SITE_URL}/api/admin/connect/zoho/callback`

type Conn = { access: string; refresh: string; exp: number; api: string; orgId: string; orgName?: string; connectedAt: string }

export function zohoAuthorizeUrl(state: string) {
  const u = new URL(`${adminEnv.zohoAccounts}/oauth/v2/auth`)
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: adminEnv.zohoId,
    redirect_uri: zohoRedirect(),
    scope: SCOPES,
    // offline + consent is what gets a refresh token back.
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString()
  return u.toString()
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; api_domain?: string; error?: string }

async function token(body: Record<string, string>) {
  const res = await fetch(`${adminEnv.zohoAccounts}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: adminEnv.zohoId, client_secret: adminEnv.zohoSecret, ...body }),
  })
  // Zoho reports token problems as 200 with an "error" field.
  const t = (await res.json().catch(() => ({}))) as TokenReply
  if (!res.ok || t.error || !t.access_token) throw new Error(`zoho token ${res.status}: ${t.error ?? 'no access token'}`)
  return t as Required<Pick<TokenReply, 'access_token' | 'expires_in'>> & TokenReply
}

/** Only ever talk to Zoho's own API hosts, whatever the token reply says. */
const apiBase = (domain?: string) => (domain && /^https:\/\/www\.zohoapis\.[a-z.]+$/.test(domain) ? domain : adminEnv.zohoApi)

export async function zohoExchange(code: string) {
  const t = await token({ grant_type: 'authorization_code', code, redirect_uri: zohoRedirect() })
  if (!t.refresh_token) throw new Error('Zoho didn’t return a refresh token. Disconnect the app in Zoho and connect again.')
  const api = apiBase(t.api_domain)
  const res = await fetch(`${api}/books/v3/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${t.access_token}` }, cache: 'no-store' })
  const j = (await res.json().catch(() => ({}))) as { organizations?: { organization_id: string; name: string; is_default_org?: boolean }[] }
  const orgs = j.organizations ?? []
  const org = orgs.find((o) => o.organization_id === adminEnv.zohoOrgId) ?? orgs.find((o) => o.is_default_org) ?? orgs[0]
  if (!org) throw new Error('No Zoho Books organisation on this account.')
  await saveConnection('zoho', {
    access: t.access_token,
    refresh: t.refresh_token,
    exp: Date.now() + t.expires_in * 1000,
    api,
    orgId: org.organization_id,
    orgName: org.name,
    connectedAt: new Date().toISOString(),
  } satisfies Conn)
}

export async function zohoConnection() {
  if (!zohoReady()) return null
  return getConnection<Conn>('zoho')
}

let refreshing: Promise<Conn> | null = null

async function liveConnection(): Promise<Conn> {
  const c = await zohoConnection()
  if (!c) throw new Error('Zoho Books isn’t connected')
  if (c.exp > Date.now() + 120_000) return c
  refreshing ??= (async () => {
    try {
      const t = await token({ grant_type: 'refresh_token', refresh_token: c.refresh })
      const next = { ...c, access: t.access_token, exp: Date.now() + t.expires_in * 1000 }
      await saveConnection('zoho', next)
      return next
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

type Reply = { code: number; message?: string }

async function call<T>(path: string, init: RequestInit = {}, query: Record<string, string> = {}): Promise<T & Reply> {
  const c = await liveConnection()
  const qs = new URLSearchParams({ organization_id: c.orgId, ...query })
  const res = await fetch(`${c.api}/books/v3${path}?${qs}`, {
    ...init,
    headers: { Authorization: `Zoho-oauthtoken ${c.access}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('Zoho Books connection expired. Reconnect it in Settings.')
  const j = (await res.json().catch(() => ({ code: -1, message: `HTTP ${res.status}` }))) as T & Reply
  // Zoho explains problems in "message"; code 0 is success.
  if (!res.ok || j.code !== 0) throw Object.assign(new Error(`zoho ${path} ${res.status}: ${(j.message ?? '').slice(0, 200)}`), { status: res.status, zohoCode: j.code })
  return j
}

type Contact = { contact_id: string; contact_name: string; email?: string }

/** The Zoho Books customer for a portal client: remembered, found by email or name, or created. */
export async function ensureZohoContact(c: OfficeClient) {
  const known = await getZohoContactId(c._id)
  if (known) return known
  const email = (c.billingEmail || c.contacts?.[0]?.email || '').toLowerCase()
  let found: Contact | undefined
  if (email) found = (await call<{ contacts: Contact[] }>('/contacts', {}, { email, contact_type: 'customer' })).contacts?.[0]
  // Display names are unique in Zoho Books, so an existing one with this name is the same client.
  found ??= (await call<{ contacts: Contact[] }>('/contacts', {}, { contact_name: c.organizationName, contact_type: 'customer' })).contacts?.[0]
  if (!found) {
    const person = c.contacts?.[0]
    const [first, ...rest] = (person?.name ?? '').split(' ')
    const r = await call<{ contact: Contact }>('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        contact_name: c.organizationName,
        company_name: c.organizationName,
        contact_type: 'customer',
        currency_code: 'CAD',
        contact_persons: email ? [{ first_name: first || undefined, last_name: rest.join(' ') || undefined, email, is_primary_contact: true }] : [],
      }),
    })
    found = r.contact
  }
  await setZohoContactId(c._id, found.contact_id)
  return found.contact_id
}

export type ZohoInvoice = { invoice_id: string; invoice_number?: string; status: string; balance?: number; total?: number }

/**
 * Always a draft: nothing reaches the client until you send it from Zoho Books.
 * Zoho has no idempotency key, so the reference (unique per project and kind) is
 * checked first and a double click returns the same draft.
 */
export async function createDraftInvoice(customerId: string, line: { name: string; description: string; amount: number; reference: string }) {
  const reference = line.reference.slice(0, 50)
  const existing = (await call<{ invoices: ZohoInvoice[] }>('/invoices', {}, { customer_id: customerId, reference_number: reference })).invoices?.find((i) => i.status !== 'void')
  if (existing) return existing
  const r = await call<{ invoice: ZohoInvoice }>('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customerId,
      date: today(),
      due_date: addDays(today(), adminEnv.zohoDueDays),
      reference_number: reference,
      // Amounts are before tax; Zoho adds GST when a tax is set (ZOHO_TAX_ID).
      is_inclusive_tax: false,
      line_items: [
        {
          name: line.name.slice(0, 100),
          description: line.description,
          quantity: 1,
          rate: Math.round(line.amount * 100) / 100,
          ...(adminEnv.zohoAccountId ? { account_id: adminEnv.zohoAccountId } : {}),
          ...(adminEnv.zohoTaxId ? { tax_id: adminEnv.zohoTaxId } : {}),
        },
      ],
    }),
  })
  return r.invoice
}

/** Null when the invoice was deleted in Zoho Books. */
export async function getInvoice(id: string) {
  try {
    return (await call<{ invoice: ZohoInvoice }>(`/invoices/${encodeURIComponent(id)}`)).invoice
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null
    throw e
  }
}

/** Zoho statuses: draft, sent, viewed, overdue, unpaid, partially_paid, paid, void. */
export const statusOf = (inv: ZohoInvoice) => inv.status.toLowerCase()

export const invoiceUrl = (orgId: string, id: string) => `${adminEnv.zohoBooks}/app/${encodeURIComponent(orgId)}#/invoices/${encodeURIComponent(id)}`
