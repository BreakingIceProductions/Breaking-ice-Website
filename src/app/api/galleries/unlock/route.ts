import { NextResponse } from 'next/server'
import { setUnlocked } from '@/galleries/access'
import { checkPassword, getGalleryBySlug } from '@/galleries/store'
import { isExpired } from '@/galleries/types'
import { ipOf, json, limited, sameOrigin } from '@/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The password form on /g/<slug>. Works as a plain form post (no JavaScript: redirects back to
 * the gallery, with ?wrong=1 on a miss) or as JSON. Rate-limited per address and gallery so a
 * password can't be guessed by brute force.
 */
export async function POST(req: Request) {
  const isJson = (req.headers.get('content-type') ?? '').includes('application/json')
  let slug = ''
  let password = ''
  if (isJson) {
    const b = (await req.json().catch(() => null)) as { slug?: unknown; password?: unknown } | null
    slug = String(b?.slug ?? '')
    password = String(b?.password ?? '')
  } else {
    const f = await req.formData().catch(() => null)
    slug = String(f?.get('slug') ?? '')
    password = String(f?.get('password') ?? '')
  }
  slug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 120)
  password = password.slice(0, 200)

  const back = (q = '') => NextResponse.redirect(new URL(`/g/${encodeURIComponent(slug)}${q}`, req.url), { status: 303, headers: { 'Cache-Control': 'no-store' } })
  const answer = (ok: boolean, error?: string, status = 200) => (isJson ? json(ok ? { ok } : { error }, status) : back(ok ? '' : `?wrong=${error === 'slow-down' ? 'limit' : '1'}`))

  if (!sameOrigin(req)) return isJson ? json({ error: 'bad-origin' }, 403) : back()
  if (!slug) return isJson ? json({ error: 'not-found' }, 404) : back()
  if (limited(`gal-unlock:${ipOf(req)}:${slug}`, 8, 10 * 60_000)) return answer(false, 'slow-down', 429)

  const gallery = await getGalleryBySlug(slug)
  if (!gallery || gallery.status !== 'live' || !gallery.share.on || isExpired(gallery)) return isJson ? json({ error: 'not-found' }, 404) : back()
  if (!(await checkPassword(gallery, password))) return answer(false, 'wrong', 401)

  await setUnlocked(gallery)
  return answer(true)
}
