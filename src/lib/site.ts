/** The site's public address: set NEXT_PUBLIC_SITE_URL at launch; until then Vercel's own domain. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  'https://breakingiceproductions.com'
).replace(/\/$/, '')

export const SITE_NAME = 'Breaking Ice Productions'
