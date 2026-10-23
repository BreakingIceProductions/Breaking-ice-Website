import 'server-only'

/**
 * Portal switches. Each feature turns on when its settings exist in Vercel
 * (see .env.example). Nothing here is ever sent to the browser.
 */
export const portalEnv = {
  /** Signs sign-in links, codes and session cookies. Any long random string. */
  secret: process.env.PORTAL_SECRET || '',
  /** Sanity token with Editor access, for the private "portal" dataset. */
  sanityToken: process.env.SANITY_PORTAL_TOKEN || '',
  /** Google service account JSON (raw or base64) with access to the Shared Drive. */
  googleServiceAccount: process.env.GOOGLE_SERVICE_ACCOUNT || '',
  /** The Shared Drive's ID (from its address in Google Drive). */
  sharedDriveId: process.env.GOOGLE_SHARED_DRIVE_ID || '',
  /** Vimeo personal access token (scopes: public, private). Fills in thumbnails and spots new versions. */
  vimeoToken: process.env.VIMEO_ACCESS_TOKEN || '',
  /** Shared with the scheduler (Vercel Cron sends it automatically). */
  cronSecret: process.env.CRON_SECRET || '',
  resendKey: process.env.RESEND_API_KEY || '',
  /** Portal emails come from Josh so replies land in his inbox. */
  from: process.env.PORTAL_FROM || 'Josh Ferguson, Breaking Ice <josh@breakingiceproductions.com>',
  replyTo: process.env.PORTAL_REPLY_TO || 'josh@breakingiceproductions.com',
  slackWebhook: process.env.SLACK_WEBHOOK_URL || '',
  /** "off" hides the sample-project preview on the sign-in page. */
  demo: process.env.PORTAL_DEMO !== 'off',
}

export const portalReady = () => Boolean(portalEnv.secret && portalEnv.sanityToken)
export const driveReady = () => Boolean(portalEnv.googleServiceAccount && portalEnv.sharedDriveId)
export const emailReady = () => Boolean(portalEnv.resendKey)
export const vimeoReady = () => Boolean(portalEnv.vimeoToken)

/** Development fallback so the demo works locally without settings. */
export const sessionSecret = () =>
  portalEnv.secret || (process.env.NODE_ENV !== 'production' || portalEnv.demo ? 'demo-only-secret-not-for-real-clients' : '')

export const SESSION_DAYS = 30
export const LINK_MINUTES = 15
export const MAX_UPLOAD_BYTES = 3 * 1024 ** 3
