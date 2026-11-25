import 'server-only'
import { listInvoicesForRecurring, statusOf, zohoConnection, type RecurringInvoice } from '@/admin/zoho'
import { portalReady } from './config'
import { portalClient } from './data'
import type { PortalPayment } from './types'

/**
 * Retainer billing. Zoho Books makes and emails the monthly invoices itself, from a recurring
 * invoice profile per retainer client (the profile ids sit on the client's `boClient` record as
 * zohoRecurringIds). This mirrors each generated invoice as a `portalPayment` of kind "retainer"
 * (no project), so the client sees it and can pay it in the portal. Everything comes from the
 * Zoho invoice: amounts, number, date, paid or not. Read-only towards Zoho, and it sends nothing:
 * Zoho already emailed the invoice. Once mirrored, syncPaymentsFromZoho turns it paid.
 */

type Linked = { client: string; zohoContactId?: string; zohoRecurringIds: string[]; name?: string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * "November 2026 retainer". Retainers are billed at the end of the month they cover, so the
 * invoice date's own month is the month it's for (the Nov 30 invoice is November).
 */
export function retainerLabel(date: string) {
  const [y, m] = date.slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1]} ${y} retainer`
}

/** Sanity ids allow letters, digits, dots, dashes and underscores. */
const idPart = (s: string) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined)

/** Runs with the scheduler, before syncPaymentsFromZoho. Returns log lines. */
export async function importRecurringInvoices() {
  const log: string[] = []
  if (!portalReady() || !(await zohoConnection().catch(() => null))) return log
  const linked =
    (await portalClient.fetch<Linked[]>(
      `*[_type == "boClient" && count(zohoRecurringIds) > 0]{client, zohoContactId, zohoRecurringIds, "name": *[_type == "client" && _id == ^.client][0].organizationName}`,
    )) ?? []
  for (const b of linked) {
    const who = b.name ?? b.client
    // Invoices already mirrored (from this import or anywhere else) are skipped without reading them.
    const known = new Set((await portalClient.fetch<string[]>(`*[_type == "portalPayment" && clientId == $c && defined(zohoInvoiceId)].zohoInvoiceId`, { c: b.client })) ?? [])
    for (const profileId of b.zohoRecurringIds) {
      let invoices: RecurringInvoice[]
      try {
        invoices = await listInvoicesForRecurring(profileId, b.zohoContactId, known)
      } catch (e) {
        log.push(`retainer invoices failed for ${who} (profile ${profileId}): ${String(e).slice(0, 120)}`)
        continue
      }
      for (const inv of invoices) {
        const status = statusOf(inv)
        if (status === 'void' || status === 'draft' || known.has(inv.invoice_id)) continue
        const amount = num(inv.sub_total)
        const total = num(inv.total)
        const gst = num(inv.tax_total) ?? 0
        if (amount === undefined || total === undefined || !inv.date) {
          log.push(`retainer invoice ${inv.invoice_number ?? inv.invoice_id} · ${who}: skipped, Zoho didn’t give its amounts or date`)
          continue
        }
        const paid = status === 'paid'
        const doc: Omit<PortalPayment, 'projectId'> & { _type: 'portalPayment' } = {
          _id: `pay-${b.client}-${idPart(inv.invoice_number || inv.invoice_id)}`,
          _type: 'portalPayment',
          clientId: b.client,
          kind: 'retainer',
          label: retainerLabel(inv.date),
          amount,
          gst,
          total,
          status: paid ? 'paid' : 'due',
          createdAt: `${inv.date.slice(0, 10)}T12:00:00.000Z`,
          ...(paid ? { paidAt: `${(inv.last_payment_date || inv.date).slice(0, 10)}T12:00:00.000Z` } : {}),
          zohoInvoiceId: inv.invoice_id,
          ...(inv.invoice_number ? { zohoInvoiceNumber: inv.invoice_number } : {}),
        }
        try {
          await portalClient.createIfNotExists(doc)
          known.add(inv.invoice_id)
          log.push(`retainer invoice ${inv.invoice_number ?? inv.invoice_id} · ${who}: mirrored (${doc.label}, ${paid ? 'paid' : 'due'})`)
        } catch (e) {
          log.push(`retainer invoice ${inv.invoice_number ?? inv.invoice_id} · ${who}: not saved: ${String(e).slice(0, 120)}`)
        }
      }
    }
  }
  return log
}

/** A client's retainer payments, newest first (for the portal and the back office). */
export async function retainerPaymentsFor(clientId: string) {
  if (!portalReady()) return [] as PortalPayment[]
  return (
    (await portalClient.fetch<PortalPayment[]>(
      `*[_type == "portalPayment" && clientId == $c && kind == "retainer" && status != "canceled"] | order(createdAt desc){_id, clientId, kind, label, amount, gst, total, status, createdAt, paidAt, method, receiptUrl, cardFee, cardFeeGst, zohoInvoiceId, zohoInvoiceNumber}`,
      { c: clientId },
    )) ?? []
  )
}
