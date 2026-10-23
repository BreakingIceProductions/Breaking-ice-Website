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
  xeroId: process.env.XERO_CLIENT_ID || '',
  xeroSecret: process.env.XERO_CLIENT_SECRET || '',
  /** Revenue account invoice lines are coded to (Xero's default "Sales" is 200). */
  xeroAccountCode: process.env.XERO_ACCOUNT_CODE || '200',
  /** Optional Xero tax type for lines; empty uses the account's default tax rate. */
  xeroTaxType: process.env.XERO_TAX_TYPE || '',
  /** Invoice due date, in days after the invoice date. */
  xeroDueDays: Number(process.env.XERO_DUE_DAYS || 30),
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
export const xeroReady = () => Boolean(adminEnv.xeroId && adminEnv.xeroSecret)
export const calendarReady = () => Boolean(adminEnv.calendarId && portalEnv.googleServiceAccount)
