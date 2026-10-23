import 'server-only'
import { portalEnv, vimeoReady } from './config'
import { addActivity, updateDeliverable, updateDeliverableState } from './data'
import type { ClientProject } from './types'

/**
 * Reviews live on Vimeo. Each deliverable holds one Vimeo link (a review page
 * vimeo.com/reviews/…/videos/123, or the video's own link). With a Vimeo token the
 * scheduler fills in the thumbnail, length and player, and when you replace the
 * video in Vimeo (same link, new file) it bumps the version and marks it ready,
 * which sends the "new version" email after the usual 10-minute hold.
 */

const API = 'https://api.vimeo.com'

/** The video ID in any Vimeo link we're likely to paste. */
export function vimeoId(url?: string) {
  if (!url || !/vimeo\.com/i.test(url)) return undefined
  const m =
    url.match(/vimeo\.com\/reviews\/[^/]+\/videos\/(\d+)/i) ??
    url.match(/player\.vimeo\.com\/video\/(\d+)/i) ??
    url.match(/vimeo\.com\/(?:[^?#]*\/)?(\d{6,})/i)
  return m?.[1]
}

/** A review page is where clients leave time-coded notes; a plain video link only plays. */
export const isReviewLink = (url?: string) => Boolean(url && /vimeo\.com\/reviews\//i.test(url))

async function vimeo<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${portalEnv.vimeoToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`vimeo ${path.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

type VimeoVideo = { duration?: number; player_embed_url?: string; pictures?: { base_link?: string } }

const clock = (s = 0) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Brings each deliverable's thumbnail, length, player and version in line with Vimeo. */
export async function syncVimeo(p: ClientProject, log: string[]) {
  if (!vimeoReady()) return
  for (const d of p.deliverables ?? []) {
    const id = vimeoId(d.shareUrl)
    if (!id) continue
    const [video, versions] = await Promise.all([
      vimeo<VimeoVideo>(`/videos/${id}?fields=duration,player_embed_url,pictures.base_link`),
      vimeo<{ total?: number }>(`/videos/${id}/versions?per_page=1&fields=uri`).catch(() => ({ total: undefined })),
    ])
    const total = versions.total
    await updateDeliverableState(p._id, d._key, {
      vimeoThumb: video.pictures?.base_link ? `${video.pictures.base_link}_640x360` : undefined,
      vimeoEmbed: video.player_embed_url,
      vimeoLength: video.duration ? clock(video.duration) : undefined,
      ...(total ? { vimeoVersions: total } : {}),
    })
    // The first look only records how many files the video has had; a later replacement bumps the version.
    if (total && d.vimeoVersions && total > d.vimeoVersions) {
      const version = (d.version || 1) + (total - d.vimeoVersions)
      await updateDeliverable(p._id, d._key, { version, status: 'awaiting-feedback' })
      await addActivity(p._id, `Version ${version} of ${d.title} uploaded`, 'version')
      log.push(`vimeo: ${p.title} / ${d.title} now v${version}`)
    }
  }
}
