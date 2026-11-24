import 'server-only'
import { portalEnv, vimeoReady } from './config'
import { addActivity, portalClient, updateDeliverable, updateDeliverableState } from './data'
import { presignGet } from './r2'
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

/* ── Finished files: a copy to Vimeo for the website ─────────────────── */

export type VimeoCopy = { vimeoState: 'uploading' | 'ready' | 'failed'; vimeoUrl?: string; vimeoUri?: string; vimeoError?: string }

/** Vimeo's answer in a sentence Josh can act on. A 401/403 almost always means the token can't upload. */
function copyError(e: unknown) {
  const s = String(e instanceof Error ? e.message : e)
  if (/ (401|403):/.test(s)) return 'Vimeo needs a token with upload access (the upload and edit scopes). Make a new one in Vimeo, then try again.'
  if (/ 429:/.test(s)) return 'Vimeo is busy (too many requests). Try again in a few minutes.'
  return s.replace(/^Error: /, '').slice(0, 160)
}

/**
 * Hands a finished file in R2 to Vimeo with a "pull" upload: Vimeo fetches it from a signed
 * link, so no bytes pass through our server. The link lasts 7 days, the longest a signed link
 * can (SigV4), in case Vimeo queues the fetch. Saves the outcome on the version in vimeoUrl,
 * vimeoUri and vimeoState, never shareUrl (that one takes over playback). Never throws.
 */
export async function pushToVimeo(projectId: string, d: { _key: string; r2Key?: string; r2Size?: number }, name: string): Promise<VimeoCopy> {
  let result: VimeoCopy
  if (!d.r2Key || !d.r2Size) result = { vimeoState: 'failed', vimeoError: 'This version has no stored file to copy.' }
  else if (!vimeoReady()) result = { vimeoState: 'failed', vimeoError: 'Vimeo isn’t connected (no token set).' }
  else {
    try {
      const v = await vimeo<{ uri?: string; link?: string }>('/me/videos?fields=uri,link', {
        method: 'POST',
        body: JSON.stringify({
          upload: { approach: 'pull', size: d.r2Size, link: presignGet(d.r2Key, { expires: 7 * 24 * 3600 }) },
          name: name.slice(0, 128),
          privacy: { view: 'unlisted', embed: 'public' },
        }),
      })
      result = { vimeoState: 'uploading', vimeoUri: v.uri, vimeoUrl: v.link }
    } catch (e) {
      console.error('[vimeo] pull upload failed', e)
      result = { vimeoState: 'failed', vimeoError: copyError(e) }
    }
  }
  await saveCopy(projectId, d._key, result).catch((e) => console.error('[vimeo] saving copy state failed', e))
  return result
}

async function saveCopy(projectId: string, key: string, c: VimeoCopy) {
  const at = `deliverables[_key=="${key.replace(/[^\w-]/g, '')}"]`
  const set: Record<string, unknown> = { [`${at}.vimeoState`]: c.vimeoState }
  if (c.vimeoUri) set[`${at}.vimeoUri`] = c.vimeoUri
  if (c.vimeoUrl) set[`${at}.vimeoUrl`] = c.vimeoUrl
  if (c.vimeoError) set[`${at}.vimeoError`] = c.vimeoError
  const patch = portalClient.patch(projectId).set(set)
  if (!c.vimeoError) patch.unset([`${at}.vimeoError`])
  await patch.commit()
}

/** Flips copies still on their way to Vimeo to ready (or failed). Only looks at versions marked 'uploading'. */
export async function checkVimeoCopies(p: ClientProject, log: string[]) {
  if (!vimeoReady()) return
  for (const d of p.deliverables ?? []) {
    if (d.vimeoState !== 'uploading' || !d.vimeoUri) continue
    try {
      const v = await vimeo<{ upload?: { status?: string }; transcode?: { status?: string }; pictures?: { base_link?: string } }>(`${d.vimeoUri}?fields=transcode.status,upload.status,pictures.base_link`)
      if (v.upload?.status === 'error' || v.transcode?.status === 'error') {
        await saveCopy(p._id, d._key, { vimeoState: 'failed', vimeoError: v.upload?.status === 'error' ? 'Vimeo couldn’t fetch the file.' : 'Vimeo couldn’t process the file.' })
        log.push(`vimeo copy failed: ${p.title} / ${d.title}`)
      } else if (v.upload?.status === 'complete' && v.transcode?.status === 'complete') {
        await saveCopy(p._id, d._key, { vimeoState: 'ready' })
        // Its thumbnail too, kept where syncVimeo keeps them, so it shows like any Vimeo video's (a ProRes delivery has no other).
        const picture = thumb(v.pictures?.base_link)
        if (picture) await updateDeliverableState(p._id, d._key, { vimeoThumb: picture })
        log.push(`vimeo copy ready: ${p.title} / ${d.title}`)
      }
    } catch (e) {
      log.push(`vimeo copy check skipped ${p.title} / ${d.title}: ${String(e).slice(0, 80)}`)
    }
  }
}

/* ── Moving a video from Vimeo into our own storage ──────────────────── */

type VimeoFile = VimeoDownload & { size?: number; height?: number; fps?: number; type?: string }
export type VimeoSource = { link: string; size?: number; width?: number; height?: number; fps?: number; mov: boolean; duration?: number; thumb1280?: string }

/**
 * The best file Vimeo has of a video, with what we need to store it: the original upload when
 * Vimeo keeps it, otherwise the largest MP4 rendition. Needs the video_files scope.
 * Undefined when Vimeo gives no downloadable file.
 */
export async function vimeoSourceFile(url?: string): Promise<VimeoSource | undefined> {
  const id = vimeoId(url)
  if (!id || !vimeoReady()) return undefined
  const v = await vimeo<{ duration?: number; pictures?: { base_link?: string }; download?: VimeoFile[]; files?: VimeoFile[] }>(`/videos/${id}?fields=duration,pictures.base_link,download,files`)
  const usable = (list: VimeoFile[] = []) => list.filter((f) => f.link && !/\.m3u8|\.mpd/.test(f.link) && f.quality !== 'hls' && f.quality !== 'dash')
  const all = [...usable(v.download), ...usable(v.files)]
  const isMov = (f: VimeoFile) => f.type === 'video/quicktime' || /\.mov(\?|$)/i.test(f.link ?? '')
  const source = all.find((f) => f.quality === 'source' || f.rendition === 'source')
  const mp4 = all.filter((f) => !isMov(f) && (!f.type || f.type === 'video/mp4' || /\.mp4(\?|$)/i.test(f.link ?? ''))).sort((a, b) => (b.width ?? 0) - (a.width ?? 0) || (b.size ?? 0) - (a.size ?? 0))[0]
  const f = source ?? mp4
  if (!f?.link) return undefined
  const base = v.pictures?.base_link
  const [path, query] = (base ?? '').split('?')
  return {
    link: f.link,
    size: f.size,
    width: f.width,
    height: f.height,
    fps: f.fps,
    mov: isMov(f),
    duration: v.duration,
    thumb1280: base ? `${path}_1280x720${query ? `?${query}` : ''}` : undefined,
  }
}

/* ── Picking a version's thumbnail frame ─────────────────────────────── */

/**
 * Makes a new thumbnail at `seconds` into a Vimeo video and sets it as the default (active).
 * Vimeo may still be generating it; that's fine. Returns its sized image link when Vimeo gives one.
 */
export async function setVimeoThumbnail(uri: string, seconds: number): Promise<{ ok: true; thumb?: string } | { ok: false; error: string }> {
  if (!vimeoReady()) return { ok: false, error: 'Vimeo isn’t connected (no token set).' }
  const path = uri.startsWith('/videos/') ? uri.split('?')[0] : undefined
  if (!path || !/^\/videos\/\d+$/.test(path)) return { ok: false, error: 'No Vimeo video to update.' }
  try {
    const pic = await vimeo<{ base_link?: string }>(`${path}/pictures`, { method: 'POST', body: JSON.stringify({ time: Math.max(0, Math.round(seconds * 1000) / 1000), active: true }) })
    return { ok: true, thumb: thumb(pic.base_link) }
  } catch (e) {
    const s = String(e instanceof Error ? e.message : e)
    if (/ (401|403):/.test(s)) return { ok: false, error: 'Vimeo needs a token with edit access.' }
    return { ok: false, error: s.replace(/^Error: /, '').slice(0, 160) }
  }
}
