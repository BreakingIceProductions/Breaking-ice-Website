import { randomBytes } from 'node:crypto'
import { adminFromRequest } from '@/admin/auth'
import { addLog, addVersion, getProject, moveVersionToR2 } from '@/admin/data'
import { addActivity } from '@/portal/data'
import { json } from '@/portal/http'
import { categoryOf, nextVersion } from '@/portal/library'
import { abortMultipart, completeMultipart, createMultipart, headObject, presignPart, presignPut, r2Ready, thumbKeyFor } from '@/portal/r2'
import { REVIEW_FPS } from '@/portal/types'
import { pushToVimeo } from '@/portal/vimeo'

export const runtime = 'nodejs'

/**
 * Uploading a review copy straight from the browser to R2, in parts:
 *   start     → a multipart upload, its object key and the new version's key
 *   parts     → presigned PUT addresses for some part numbers
 *   complete  → joins the parts and adds the version (then the usual hold and email run).
 *               With delivery: true it's a finished file: the version is marked Final and Vimeo
 *               pulls a copy from R2 for the website. If Vimeo says no, the version still stands.
 *   thumb     → a presigned PUT for the thumbnail the browser grabs from the video (thumb.jpg next to it)
 *   abort     → throws away an unfinished upload
 * With replaceKey, start and complete swap the file of an existing video version instead (same
 * key, same version number): it moves into the review room and nothing is emailed.
 * Sample mode answers without touching the network.
 */

const MB = 1024 * 1024
const MAX_SIZE = 100 * 1024 ** 3
const partSizeFor = (size: number) => Math.max(size > 8 * 1024 ** 3 ? 16 * MB : 8 * MB, Math.ceil(size / 9_500 / MB) * MB)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const body = await req.json().catch(() => ({}))
  if (!admin.sample && !r2Ready()) return json({ ok: false, error: 'not-configured' }, 503)

  const projectId = String(body.projectId ?? '')
  const objectKey = String(body.objectKey ?? '')
  const uploadId = String(body.uploadId ?? '')
  // An object key always sits under this project's folder, so one project's upload can't touch another's.
  const keyOk = objectKey.startsWith(`review/${projectId}/`) && /^review\/[\w.-]+\/[\w-]+\/v\d+-[a-f0-9]+\.(mp4|mov)$/.test(objectKey)

  const replaceKey = body.replaceKey ? String(body.replaceKey) : ''
  if (replaceKey && !/^[\w-]{1,40}$/.test(replaceKey)) return json({ ok: false, error: 'invalid' }, 400)

  if (action === 'start') {
    const title = String(body.title ?? '').trim().slice(0, 140)
    const size = Number(body.size)
    if ((!title && !replaceKey) || !Number.isFinite(size) || size <= 0) return json({ ok: false, error: 'invalid' }, 400)
    if (size > MAX_SIZE) return json({ ok: false, error: 'too-big' }, 400)
    // MP4 or MOV, by name or type. The key keeps the real extension (download names come from it).
    const name = String(body.name ?? '')
    const ext = /\.mov$/i.test(name) || (!/\.mp4$/i.test(name) && body.type === 'video/quicktime') ? 'mov' : /\.mp4$/i.test(name) || body.type === 'video/mp4' ? 'mp4' : ''
    if (!ext) return json({ ok: false, error: 'not-video' }, 400)
    const p = await getProject(projectId)
    if (!p) return json({ ok: false }, 404)
    // Replacing: the version's own key and number. Otherwise a new version of that title.
    const target = replaceKey ? p.deliverables.find((x) => x._key === replaceKey) : undefined
    if (replaceKey && (!target || categoryOf(target) !== 'video' || target.host === 'r2')) return json({ ok: false, error: 'not-replaceable' }, 400)
    const version = target ? target.version || 1 : nextVersion(p.deliverables, 'video', title).version
    const deliverableKey = target ? target._key : randomBytes(6).toString('hex')
    const key = `review/${p._id}/${deliverableKey}/v${version}-${randomBytes(6).toString('hex')}.${ext}`
    if (admin.sample) return json({ ok: true, sample: true, objectKey: key, uploadId: 'sample', deliverableKey, version, partSize: partSizeFor(size) })
    const id = await createMultipart(key, ext === 'mov' ? 'video/quicktime' : 'video/mp4')
    return json({ ok: true, objectKey: key, uploadId: id, deliverableKey, version, partSize: partSizeFor(size) })
  }

  if (!keyOk || !uploadId) return json({ ok: false, error: 'invalid' }, 400)

  if (action === 'parts') {
    const numbers = (Array.isArray(body.parts) ? body.parts : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 10_000).slice(0, 100) as number[]
    if (!numbers.length) return json({ ok: false, error: 'invalid' }, 400)
    if (admin.sample) return json({ ok: true, urls: {} })
    return json({ ok: true, urls: Object.fromEntries(numbers.map((n) => [n, presignPart(objectKey, uploadId, n)])) })
  }

  if (action === 'thumb') {
    // Always next to this upload's video, so it can't land anywhere else.
    if (admin.sample) return json({ ok: true, sample: true })
    const key = thumbKeyFor(objectKey)
    return json({ ok: true, key, url: presignPut(key, 3600) })
  }

  if (action === 'abort') {
    if (!admin.sample) await abortMultipart(objectKey, uploadId).catch((e) => console.error('[r2] abort failed', e))
    return json({ ok: true })
  }

  if (action === 'complete') {
    const title = String(body.title ?? '').trim().slice(0, 140)
    const deliverableKey = String(body.deliverableKey ?? '')
    const parts = (Array.isArray(body.parts) ? body.parts : [])
      .map((x: { n?: unknown; etag?: unknown }) => ({ n: Number(x?.n), etag: String(x?.etag ?? '') }))
      .filter((x: { n: number; etag: string }) => Number.isInteger(x.n) && x.n >= 1 && /^"?[\w-]+"?$/.test(x.etag))
    const fps = REVIEW_FPS.find((f) => f === Number(body.fps)) ?? 23.976
    if (replaceKey) {
      if (deliverableKey !== replaceKey || objectKey.split('/')[2] !== replaceKey) return json({ ok: false, error: 'invalid' }, 400)
    } else if (!title || !/^[a-f0-9]{12}$/.test(deliverableKey) || !objectKey.includes(`/${deliverableKey}/`)) return json({ ok: false, error: 'invalid' }, 400)
    if (admin.sample) return json({ ok: true, sample: true })
    if (!parts.length) return json({ ok: false, error: 'invalid' }, 400)
    const p = await getProject(projectId)
    if (!p) return json({ ok: false }, 404)
    await completeMultipart(objectKey, uploadId, parts)
    const size = await headObject(objectKey)
    if (!size) return json({ ok: false, error: 'missing' }, 502)
    const send = body.send !== false
    const delivery = body.delivery === true
    // Only delivery takes a file the browser can't play (often ProRes): no length, size, frame rate or thumbnail then.
    const playable = !(delivery && body.playable === false)
    // The thumbnail is a nice-to-have: only kept if it's the expected key and actually arrived.
    const thumbKey = playable && body.thumbKey === thumbKeyFor(objectKey) ? thumbKeyFor(objectKey) : undefined
    const r2Thumb = thumbKey && (await headObject(thumbKey).catch(() => 0)) ? thumbKey : undefined
    if (replaceKey) {
      const target = p.deliverables.find((x) => x._key === replaceKey)
      if (!target || target.host === 'r2') return json({ ok: false, error: 'not-replaceable' }, 400)
      // Only a Final version may take a file the browser can't play (it's for download, not review).
      const ok = body.playable !== false || target.final
      if (!ok) return json({ ok: false, error: 'not-playable' }, 400)
      await moveVersionToR2(p._id, target, {
        r2Key: objectKey,
        r2Size: size,
        r2Thumb: body.playable === false ? undefined : r2Thumb,
        durationSec: num(body.durationSec),
        width: num(body.width),
        height: num(body.height),
        fps: body.playable === false ? undefined : fps,
        playable: body.playable === false ? false : undefined,
      })
      await addLog(p._id, `${target.title} v${target.version || 1}: file replaced, now in the review room`, 'office')
      return json({ ok: true, key: target._key, replaced: true })
    }
    const entry = await addVersion(p._id, {
      category: 'video',
      title,
      final: delivery,
      notes: String(body.notes ?? '').trim().slice(0, 2000) || undefined,
      send,
      r2: {
        key: deliverableKey,
        r2Key: objectKey,
        r2Size: size,
        r2Thumb,
        ...(playable
          ? {
              durationSec: num(body.durationSec) ? Math.round(num(body.durationSec)! * 1000) / 1000 : undefined,
              fps,
              width: num(body.width) ? Math.round(num(body.width)!) : undefined,
              height: num(body.height) ? Math.round(num(body.height)!) : undefined,
            }
          : { playable: false }),
      },
    })
    // Same as adding a Vimeo link: the scheduler's 10-minute hold and "new version" email take it from here.
    if (entry) await addActivity(p._id, `${entry.title}: ${delivery ? 'final file' : `Version ${entry.version}`} ${send ? (delivery ? 'sent' : 'sent for review') : 'added'}`, 'version')
    if (!delivery || !entry) return json({ ok: true, key: entry?._key })
    const copy = await pushToVimeo(p._id, { _key: entry._key, r2Key: objectKey, r2Size: size }, `${p.client.organizationName} · ${entry.title}`)
    return json({ ok: true, key: entry._key, vimeo: copy.vimeoState === 'failed' ? 'failed' : 'uploading', vimeoError: copy.vimeoError })
  }

  return json({ ok: false }, 404)
}
