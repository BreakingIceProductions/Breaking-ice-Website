import 'server-only'
import type { Network, PostMetrics, PublerPiece } from './types'

/**
 * Publer, read-only. Each retainer client has its own Publer workspace; one API key (PUBLER_API_KEY,
 * set in Vercel) reads them all. Never throws to a page: every call returns what it could get plus a
 * plain-English note when something is missing or Publer didn't answer.
 *
 *   GET /posts?state[]=scheduled&state[]=published&from&to&page   (page starts at 0)
 *   GET /accounts                                                   (account id → network and name)
 *   GET /analytics/post_insights?from&to&page                       (10 a page; its ids are NOT post ids)
 *
 * Rate limit: 100 requests per 2 minutes. Posts and accounts are cached 15 minutes, insights an hour,
 * and identical requests already on their way share one answer.
 */

const BASE = 'https://app.publer.com/api/v1/'
const MAX_PAGES = 10

export const publerReady = () => Boolean(process.env.PUBLER_API_KEY)

export type PublerResult = { pieces: PublerPiece[]; note?: string }

type RawPost = {
  id: string | number
  text?: string
  url?: string
  state?: string
  type?: string
  account_id?: string | number
  scheduled_at?: string
  post_link?: string
  has_media?: boolean
  network?: string
}
type RawAccount = { id: string | number; provider?: string; name?: string; type?: string }
type RawInsight = {
  id?: number
  text?: string
  scheduled_at?: string
  post_type?: string
  account_id?: string | number
  analytics?: {
    reach?: number
    engagement?: number
    engagement_rate?: number
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    video_views?: number
    link_clicks?: number
    post_clicks?: number
  }
}

class PublerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const inflight = new Map<string, Promise<unknown>>()

async function get<T>(path: string, workspaceId: string, revalidate: number): Promise<T> {
  const url = BASE + path
  const dedupe = `${workspaceId}|${url}`
  const running = inflight.get(dedupe)
  if (running) return running as Promise<T>
  const job = (async () => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer-API ${process.env.PUBLER_API_KEY}`,
        'Publer-Workspace-Id': workspaceId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      next: { revalidate },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; errors?: unknown[] } | null
      const msg = body?.error ?? (Array.isArray(body?.errors) ? body.errors.map(String).join('; ') : '') ?? ''
      throw new PublerError(res.status, String(msg).slice(0, 200))
    }
    return (await res.json()) as T
  })().finally(() => inflight.delete(dedupe))
  inflight.set(dedupe, job)
  return job
}

const noteFor = (e: unknown) => {
  if (e instanceof PublerError) {
    if (e.status === 429) return 'Publer is busy right now (too many requests). Social posts will show again in a few minutes.'
    if (e.status === 401 || e.status === 403) return 'Publer turned the connection down: check the API key and the workspace id.'
    return `Publer didn’t answer properly (${e.status}). Social posts may be missing for now.`
  }
  return 'Publer couldn’t be reached. Social posts may be missing for now.'
}

/* ── Shaping ─────────────────────────────────────────────────────────── */

const NETWORKS: Network[] = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'twitter', 'threads', 'pinterest', 'google', 'bluesky', 'mastodon']

export function toNetwork(raw?: string): Network {
  const s = (raw ?? '').toLowerCase()
  if (s === 'x' || s.startsWith('twitter')) return 'twitter'
  if (s.startsWith('ig') || s.includes('instagram')) return 'instagram'
  if (s.startsWith('fb') || s.includes('facebook')) return 'facebook'
  if (s.includes('linkedin')) return 'linkedin'
  if (s.includes('google') || s === 'gmb') return 'google'
  return NETWORKS.find((n) => s.includes(n)) ?? 'other'
}

/** Publer's states: published, published_posted, scheduled, scheduled_approved… Drafts and failures are skipped. */
function toState(raw?: string): PublerPiece['state'] | null {
  const s = (raw ?? '').toLowerCase()
  if (s.startsWith('published') || s === 'posted') return 'published'
  if (s.startsWith('scheduled')) return 'scheduled'
  return null
}

export const normText = (t?: string) => (t ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
const minuteOf = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')

const METRIC_KEYS: [keyof NonNullable<RawInsight['analytics']>, keyof PostMetrics][] = [
  ['reach', 'reach'],
  ['engagement', 'engagement'],
  ['likes', 'likes'],
  ['comments', 'comments'],
  ['shares', 'shares'],
  ['saves', 'saves'],
  ['video_views', 'videoViews'],
  ['link_clicks', 'linkClicks'],
]

function addMetrics(into: PostMetrics, a: NonNullable<RawInsight['analytics']>) {
  for (const [from, to] of METRIC_KEYS) {
    const v = a[from]
    if (typeof v === 'number' && Number.isFinite(v)) into[to] = (into[to] ?? 0) + v
  }
}

type Flat = { post: RawPost; state: PublerPiece['state']; at: string; text: string; network: Network; accountName?: string; metrics?: PostMetrics }

/** Same text, scheduled within the same hour → one piece across several networks. */
export function groupPieces(flat: Flat[]): PublerPiece[] {
  const sorted = [...flat].sort((a, b) => a.at.localeCompare(b.at))
  const groups: { key: string; first: number; items: Flat[] }[] = []
  for (const f of sorted) {
    const key = normText(f.text).toLowerCase()
    const t = Date.parse(f.at)
    const g = groups.find((x) => x.key === key && Math.abs(t - x.first) < 3_600_000)
    if (g) g.items.push(f)
    else groups.push({ key, first: t, items: [f] })
  }
  return groups.map(({ items }) => {
    const published = items.filter((i) => i.state === 'published')
    let metrics: PostMetrics | undefined
    for (const i of published) {
      if (!i.metrics) continue
      metrics ??= {}
      for (const [k, v] of Object.entries(i.metrics)) if (typeof v === 'number') metrics[k as keyof PostMetrics] = (metrics[k as keyof PostMetrics] ?? 0) + v
    }
    if (metrics && metrics.reach && metrics.engagement !== undefined) metrics.engagementRate = Math.round((metrics.engagement / metrics.reach) * 10000) / 100
    return {
      id: String(items[0].post.id),
      text: items[0].text,
      at: items[0].at,
      state: published.length ? 'published' : 'scheduled',
      postType: items[0].post.type,
      networks: items.map((i) => ({ network: i.network, accountName: i.accountName, link: i.post.post_link || undefined, postId: String(i.post.id) })),
      ...(metrics ? { metrics } : {}),
    }
  })
}

/* ── Calls ───────────────────────────────────────────────────────────── */

async function allPages<T>(workspaceId: string, path: (page: number) => string, revalidate: number, pick: (r: unknown) => { list: T[]; totalPages?: number; total?: number; perPage?: number }) {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = pick(await get<unknown>(path(page), workspaceId, revalidate))
    out.push(...r.list)
    const pages = r.totalPages ?? (r.total !== undefined && r.perPage ? Math.ceil(r.total / r.perPage) : undefined)
    if (!r.list.length || (pages !== undefined && page + 1 >= pages)) break
    if (pages === undefined && r.total !== undefined && out.length >= r.total) break
  }
  return out
}

async function accountsOf(workspaceId: string) {
  const list = await get<RawAccount[] | { accounts?: RawAccount[] }>('accounts', workspaceId, 900)
  const arr = Array.isArray(list) ? list : (list.accounts ?? [])
  return new Map(arr.map((a) => [String(a.id), a]))
}

async function insightsOf(workspaceId: string, from: string, to: string) {
  return allPages<RawInsight>(workspaceId, (page) => `analytics/post_insights?from=${from}&to=${to}&page=${page}`, 3600, (r) => {
    const o = r as { posts?: RawInsight[]; total?: number }
    return { list: o.posts ?? [], total: o.total, perPage: 10 }
  })
}

/**
 * Scheduled and published posts between two dates (YYYY-MM-DD, inclusive), grouped into pieces, with
 * metrics for published posts when Publer has them. Pass `insights: false` to skip the analytics calls.
 */
export async function publerPieces(workspaceId: string | undefined, from: string, to: string, opts: { insights?: boolean } = {}): Promise<PublerResult> {
  if (!publerReady()) return { pieces: [], note: 'Publer isn’t connected yet, so social posts don’t show here.' }
  if (!workspaceId?.trim()) return { pieces: [], note: 'No Publer workspace is set for this client yet, so social posts don’t show here.' }
  const ws = workspaceId.trim()
  try {
    const [posts, accounts] = await Promise.all([
      allPages<RawPost>(ws, (page) => `posts?state[]=scheduled&state[]=published&from=${from}&to=${to}&page=${page}`, 900, (r) => {
        const o = r as { posts?: RawPost[]; total?: number; per_page?: number; total_pages?: number }
        return { list: o.posts ?? [], totalPages: o.total_pages, total: o.total, perPage: o.per_page }
      }),
      accountsOf(ws).catch(() => new Map<string, RawAccount>()),
    ])
    const flat: Flat[] = []
    for (const post of posts) {
      const state = toState(post.state)
      if (!state || !post.scheduled_at) continue
      const acct = post.account_id !== undefined ? accounts.get(String(post.account_id)) : undefined
      flat.push({ post, state, at: new Date(post.scheduled_at).toISOString(), text: post.text ?? '', network: toNetwork(post.network ?? acct?.provider), accountName: acct?.name })
    }

    let note: string | undefined
    if (opts.insights !== false && flat.some((f) => f.state === 'published')) {
      try {
        const insights = await insightsOf(ws, from, to)
        // Insight ids aren't post ids: match on account, the minute it went out, and how the text starts.
        for (const f of flat) {
          if (f.state !== 'published') continue
          const prefix = normText(f.text).slice(0, 40).toLowerCase()
          const hit = insights.find(
            (i) => String(i.account_id) === String(f.post.account_id) && minuteOf(i.scheduled_at) === minuteOf(f.at) && normText(i.text).slice(0, 40).toLowerCase() === prefix,
          )
          if (hit?.analytics) addMetrics((f.metrics = {}), hit.analytics)
        }
      } catch (e) {
        console.error('[publer] insights failed', e)
        note = 'Publer’s numbers (reach, engagement) couldn’t be loaded just now.'
      }
    }
    return { pieces: groupPieces(flat), ...(note ? { note } : {}) }
  } catch (e) {
    console.error('[publer] posts failed', e)
    return { pieces: [], note: noteFor(e) }
  }
}
