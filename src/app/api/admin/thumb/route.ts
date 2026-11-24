import { randomBytes } from 'node:crypto'
import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { portalClient, updateDeliverableState } from '@/portal/data'
import { json } from '@/portal/http'
import { deleteObject, headObject, presignPut, r2Ready } from '@/portal/r2'
import { setVimeoThumbnail, vimeoId } from '@/portal/vimeo'

export const runtime = 'nodejs'

/**
 * The back office's frame picker for a review-room video:
 *   start → a presigned PUT for a new thumbnail (a fresh name each time, so cached images never stick)
 *   save  → makes it the version's thumbnail, removes the old one, and sets the same frame on its Vimeo copy
 * Sample mode answers without touching the network.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  if (admin.viewOnly) return json({ ok: false, error: 'view-only' }, 403)
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')
  if (admin.sample) return json(action === 'start' ? { ok: true, sample: true } : { ok: true, sample: true, vimeo: 'skipped' })
  if (!r2Ready()) return json({ ok: false, error: 'not-configured' }, 503)

  const p = await getProject(String(body.projectId ?? ''))
  const d = p?.deliverables.find((x) => x._key === body.key)
  if (!p || !d) return json({ ok: false }, 404)
  if (d.host !== 'r2' || !d.r2Key || d.playable === false) return json({ ok: false, error: 'not-in-room' }, 409)
  if (!/^[\w-]{1,40}$/.test(d._key)) return json({ ok: false, error: 'invalid' }, 400)
  const folder = `review/${p._id}/${d._key}/`

  if (action === 'start') {
    const key = `${folder}thumb-${randomBytes(3).toString('hex')}.jpg`
    return json({ ok: true, key, url: presignPut(key, 900) })
  }

  if (action === 'save') {
    const thumbKey = String(body.thumbKey ?? '')
    const seconds = Number(body.seconds)
    if (!thumbKey.startsWith(folder) || !/^thumb-[a-f0-9]{6}\.jpg$/.test(thumbKey.slice(folder.length)) || !Number.isFinite(seconds) || seconds < 0) return json({ ok: false, error: 'invalid' }, 400)
    if (!(await headObject(thumbKey).catch(() => null))) return json({ ok: false, error: 'missing' }, 400)

    const at = `deliverables[_key=="${d._key}"]`
    const set = { [`${at}.r2Thumb`]: thumbKey, [`${at}.thumbAt`]: Math.round(seconds * 1000) / 1000 }
    await portalClient.patch(p._id).set(set).commit()
    // A pending Studio draft gets it too, so publishing it can't bring the old thumbnail back.
    await portalClient.patch(`drafts.${p._id}`).set(set).commit().catch(() => {})
    if (d.r2Thumb && d.r2Thumb !== thumbKey && !d.r2Thumb.startsWith('sample/')) await deleteObject(d.r2Thumb).catch((e) => console.error('[thumb] old thumbnail delete failed', e))

    // The same frame on its Vimeo copy, when there is one.
    const uri = d.vimeoUri ?? (vimeoId(d.vimeoUrl) ? `/videos/${vimeoId(d.vimeoUrl)}` : undefined)
    if (!uri) return json({ ok: true, vimeo: 'skipped' })
    if (d.vimeoState === 'uploading') return json({ ok: true, vimeo: 'skipped', vimeoError: 'Vimeo is still processing; pick the frame again once it’s on Vimeo.' })
    const r = await setVimeoThumbnail(uri, seconds)
    if (!r.ok) return json({ ok: true, vimeo: 'failed', vimeoError: r.error })
    // Kept where the sync keeps Vimeo's thumbnails, if one is stored; otherwise the next sync fills it in.
    if (r.thumb && d.vimeoThumb) await updateDeliverableState(p._id, d._key, { vimeoThumb: r.thumb }).catch(() => {})
    return json({ ok: true, vimeo: 'set' })
  }

  return json({ ok: false }, 404)
}
