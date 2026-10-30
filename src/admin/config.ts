import 'server-only'
import { portalEnv, portalReady } from '@/portal/config'

/**
 * Back-office switches. Like the portal, each connection turns on when its
 * settings exist in Vercel (see .env.example). Nothing here reaches the browser.
 */
export const adminEnv = {
  /** Who can sign in to /admin. Comma-separated. */
  emails: (process.env.ADMIN_EMAILS || 'josh@breakingiceproductions.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  ticktickId: process.env.TICKTICK_CLIENT_ID || '',
  ticktickSecret: process.env.TICKTICK_CLIENT_SECRET || '',
  zohoId: process.env.ZOHO_CLIENT_ID || '',
  zohoSecret: process.env.ZOHO_CLIENT_SECRET || '',
  /** Zoho data centre. Breaking Ice's books are in Canada (zohocloud.ca). */
  zohoAccounts: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zohocloud.ca',
  zohoApi: process.env.ZOHO_API_URL || 'https://www.zohoapis.ca',
  zohoBooks: process.env.ZOHO_BOOKS_URL || 'https://books.zohocloud.ca',
  /** Optional: which Zoho Books organisation, if the account has more than one. */
  zohoOrgId: process.env.ZOHO_ORG_ID || '',
  /** Optional income account for invoice lines; empty uses Zoho's "Sales". */
  zohoAccountId: process.env.ZOHO_ACCOUNT_ID || '',
  /** Optional tax (e.g. GST 5%) added to invoice lines; empty adds no tax. */
  zohoTaxId: process.env.ZOHO_TAX_ID || '',
  /** Invoice due date, in days after the invoice date. */
  zohoDueDays: Number(process.env.ZOHO_DUE_DAYS || 30),
  /** The "Breaking Ice Projects" calendar, shared with the service account ("Make changes to events"). */
  calendarId: process.env.GOOGLE_CALENDAR_ID || '',
  timeZone: 'America/Edmonton',
}

export const isAdminEmail = (email: string) => adminEnv.emails.includes(email.trim().toLowerCase())

/** Real data needs the same two settings as the portal. */
export const adminReady = () => portalReady()

/** Local development without settings shows sample projects so the screens can be worked on. */
export const adminSampleMode = () => !portalReady() && process.env.NODE_ENV !== 'production'

export const ticktickReady = () => Boolean(adminEnv.ticktickId && adminEnv.ticktickSecret)
export const zohoReady = () => Boolean(adminEnv.zohoId && adminEnv.zohoSecret)
export const calendarReady = () => Boolean(adminEnv.calendarId && portalEnv.googleServiceAccount)
