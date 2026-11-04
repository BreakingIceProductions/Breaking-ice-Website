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

async function vimeo<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${portalEnv.vimeoToken}`, Accept: 'application/vnd.vimeo.*+json;version=3.4', 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`vimeo ${path.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

type VimeoVideo = { duration?: number; player_embed_url?: string; pictures?: { base_link?: string }; review_page?: { active?: boolean; link?: string } }

/** Vimeo's base image link can carry a query string; the size goes before it. */
const thumb = (base?: string) => {
  if (!base) return undefined
  const [path, query] = base.split('?')
  return `${path}_640x360${query ? `?${query}` : ''}`
}

const clock = (s = 0) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Brings each deliverable's thumbnail, length, player and version in line with Vimeo. */
export async function syncVimeo(p: ClientProject, log: string[]) {
  if (!vimeoReady()) return
  for (const d of p.deliverables ?? []) {
    const id = vimeoId(d.shareUrl)
    if (!id) continue
    let video: VimeoVideo, versions: { total?: number }
    try {
      ;[video, versions] = await Promise.all([
        vimeo<VimeoVideo>(`/videos/${id}?fields=duration,player_embed_url,pictures.base_link,review_page`),
        vimeo<{ total?: number }>(`/videos/${id}/versions?per_page=1&fields=uri`).catch(() => ({ total: undefined })),
      ])
    } catch (e) {
      // A video deleted from Vimeo (often an old version) mustn't stop the rest of the project.
      log.push(`vimeo skipped ${p.title} / ${d.title} v${d.version || 1}: ${String(e).slice(0, 80)}`)
      continue
    }
    const total = versions.total
    await updateDeliverableState(p._id, d._key, {
      vimeoThumb: thumb(video.pictures?.base_link),
      vimeoEmbed: video.player_embed_url,
      vimeoLength: video.duration ? clock(video.duration) : undefined,
      // A review link Josh made in Vimeo wins; Vimeo's own review page only counts while it's switched on (otherwise it's a 404).
      vimeoReview: /vimeo\.com\/reviews\//i.test(d.shareUrl ?? '') ? d.shareUrl : video.review_page?.active ? video.review_page.link : undefined,
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

type VimeoDownload = { quality?: string; rendition?: string; width?: number; link?: string }

/**
 * A fresh link to the best file of a video: the original upload when Vimeo keeps it,
 * otherwise the largest rendition. Links expire, so this is asked for on each click.
 * Needs a token with the video_files scope; `files` is the fallback when `download` is empty.
 */
export async function vimeoDownloadLink(url?: string) {
  const id = vimeoId(url)
  if (!id || !vimeoReady()) return undefined
  const v = await vimeo<{ download?: VimeoDownload[]; files?: VimeoDownload[] }>(`/videos/${id}?fields=download,files`)
  const pick = (list: VimeoDownload[] = []) => {
    const files = list.filter((f) => f.link && !/\.m3u8|\.mpd/.test(f.link) && f.quality !== 'hls' && f.quality !== 'dash')
    return (files.find((f) => f.quality === 'source' || f.rendition === 'source') ?? files.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0])?.link
  }
  const link = pick(v.download) ?? pick(v.files)
  if (!link) console.warn('[portal] vimeo download reply', JSON.stringify({ keys: Object.keys(v), download: v.download?.length, files: v.files?.length, raw: JSON.stringify(v).slice(0, 300) }))
  return link
}
