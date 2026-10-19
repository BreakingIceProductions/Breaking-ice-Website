import 'server-only'
import { SITE_URL } from '@/lib/site'
import { adminEnv, xeroReady } from './config'
import { getConnection, getXeroContactId, saveConnection, setXeroContactId } from './data'
import { addDays, today } from './dates'
import type { OfficeClient } from './types'

/**
 * Xero: the back office finds or creates the contact and saves DRAFT sales
 * invoices; you approve and send them from Xero. Access tokens last 30 minutes
 * and refresh tokens are single-use (60 days), so every refresh saves the new
 * pair straight away. The scheduler refreshes often enough that the
 * connection never lapses while the site is running.
 */

const API = 'https://api.xero.com/api.xro/2.0'
const SCOPES = 'openid profile email offline_access accounting.transactions accounting.contacts'
export const xeroRedirect = () => `${SITE_URL}/api/admin/connect/xero/callback`

type Conn = { access: string; refresh: string; exp: number; tenantId: string; tenantName?: string; connectedAt: string }

export function xeroAuthorizeUrl(state: string) {
  const u = new URL('https://login.xero.com/identity/connect/authorize')
  u.search = new URLSearchParams({ response_type: 'code', client_id: adminEnv.xeroId, redirect_uri: xeroRedirect(), scope: SCOPES, state }).toString()
  return u.toString()
}

async function token(body: Record<string, string>) {
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${adminEnv.xeroId}:${adminEnv.xeroSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams(body),
  })
  if (!res.ok) throw new Error(`xero token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
}

export async function xeroExchange(code: string) {
  const t = await token({ grant_type: 'authorization_code', code, redirect_uri: xeroRedirect() })
  const res = await fetch('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`xero connections ${res.status}`)
  const orgs = (await res.json()) as { tenantId: string; tenantName?: string; tenantType: string }[]
  const org = orgs.find((o) => o.tenantType === 'ORGANISATION')
  if (!org) throw new Error('No Xero organisation was shared with the app. Connect again and pick Breaking Ice.')
  await saveConnection('xero', {
    access: t.access_token,
    refresh: t.refresh_token,
    exp: Date.now() + t.expires_in * 1000,
    tenantId: org.tenantId,
    tenantName: org.tenantName,
    connectedAt: new Date().toISOString(),
  } satisfies Conn)
}

export async function xeroConnection() {
  if (!xeroReady()) return null
  return getConnection<Conn>('xero')
}

let refreshing: Promise<Conn> | null = null

async function liveConnection(): Promise<Conn> {
  const c = await xeroConnection()
  if (!c) throw new Error('Xero isn’t connected')
  if (c.exp > Date.now() + 120_000) return c
  // One refresh at a time: the old refresh token stops working the moment it's used.
  refreshing ??= (async () => {
    try {
      const t = await token({ grant_type: 'refresh_token', refresh_token: c.refresh })
      const next = { ...c, access: t.access_token, refresh: t.refresh_token, exp: Date.now() + t.expires_in * 1000 }
      await saveConnection('xero', next)
      return next
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Keeps the 60-day refresh token alive; called by the scheduler. */
export async function keepXeroAlive() {
  const c = await xeroConnection()
  if (c && Date.now() - (c.exp - 1_800_000) > 7 * 86_400_000) await liveConnection()
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = await liveConnection()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.access}`, 'xero-tenant-id': c.tenantId, Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('Xero connection expired. Reconnect it in Settings.')
  if (!res.ok) {
    const text = await res.text()
    // Xero explains validation problems inside the body; surface the first one.
    const why = text.match(/"Message"\s*:\s*"([^"]+)"/g)?.slice(-1)[0]?.replace(/.*"Message"\s*:\s*"/, '').replace(/"$/, '')
    throw new Error(`xero ${path.split('?')[0]} ${res.status}: ${(why ?? text).slice(0, 200)}`)
  }
  return (await res.json()) as T
}

const where = (expr: string) => `?where=${encodeURIComponent(expr)}`
const groqSafe = (s: string) => s.replace(/"/g, '\\"')

type Contact = { ContactID: string; Name: string; EmailAddress?: string }

/** The Xero contact for a portal client: remembered, found by email or name, or created. */
export async function ensureXeroContact(c: OfficeClient) {
  const known = await getXeroContactId(c._id)
  if (known) return known
  const email = (c.billingEmail || c.contacts?.[0]?.email || '').toLowerCase()
  let found: Contact | undefined
  if (email) found = (await call<{ Contacts: Contact[] }>(`/Contacts${where(`EmailAddress=="${groqSafe(email)}"`)}`)).Contacts?.[0]
  // Contact names are unique in Xero, so an existing one with this name is the same client.
  found ??= (await call<{ Contacts: Contact[] }>(`/Contacts${where(`Name=="${groqSafe(c.organizationName)}"`)}`)).Contacts?.[0]
  if (!found) {
    const person = c.contacts?.[0]
    const [first, ...rest] = (person?.name ?? '').split(' ')
    const r = await call<{ Contacts: Contact[] }>('/Contacts', {
      method: 'POST',
      body: JSON.stringify({ Contacts: [{ Name: c.organizationName, EmailAddress: email || undefined, FirstName: first || undefined, LastName: rest.join(' ') || undefined }] }),
    })
    found = r.Contacts[0]
  }
  await setXeroContactId(c._id, found.ContactID)
  return found.ContactID
}

export type XeroInvoice = { InvoiceID: string; InvoiceNumber?: string; Status: string; AmountDue?: number; Total?: number }

/** Always a draft: nothing reaches the client until you approve and send it in Xero. */
export async function createDraftInvoice(contactId: string, line: { description: string; amount: number; reference?: string }, idempotencyKey: string) {
  const r = await call<{ Invoices: XeroInvoice[] }>('/Invoices', {
    method: 'POST',
    // A double click or a retried request returns the same invoice instead of making a second one.
    headers: { 'Idempotency-Key': idempotencyKey.slice(0, 128) },
    body: JSON.stringify({
      Invoices: [
        {
          Type: 'ACCREC',
          Status: 'DRAFT',
          Contact: { ContactID: contactId },
          Date: today(),
          DueDate: addDays(today(), adminEnv.xeroDueDays),
          Reference: line.reference?.slice(0, 255),
          CurrencyCode: 'CAD',
          // Amounts are before tax; Xero adds GST from the account's (or TaxType's) rate.
          LineAmountTypes: 'Exclusive',
          LineItems: [
            {
              Description: line.description,
              Quantity: 1,
              UnitAmount: Math.round(line.amount * 100) / 100,
              AccountCode: adminEnv.xeroAccountCode,
              ...(adminEnv.xeroTaxType ? { TaxType: adminEnv.xeroTaxType } : {}),
            },
          ],
        },
      ],
    }),
  })
  return r.Invoices[0]
}

export async function getInvoice(id: string) {
  return (await call<{ Invoices: XeroInvoice[] }>(`/Invoices/${encodeURIComponent(id)}`)).Invoices[0]
}

/** Xero statuses, lower-cased for storage: draft, submitted, authorised, paid, voided, deleted. */
export const statusOf = (inv: XeroInvoice) => inv.Status.toLowerCase()

export const invoiceUrl = (id: string) => `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(id)}`
