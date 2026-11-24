import { randomBytes } from 'node:crypto'
import { adminFromRequest } from '@/admin/auth'
import { addLog, getProject, moveVersionToR2 } from '@/admin/data'
import { json } from '@/portal/http'
import { abortMultipart, completeMultipart, createMultipart, headObject, presignPart, presignPut, r2Ready, thumbKeyFor } from '@/portal/r2'
import { vimeoId, vimeoSourceFile } from '@/portal/vimeo'

export const runtime = 'nodejs'
export const maxDuration = 300

const PART = 16 * 1024 * 1024

/**
 * One-off, kept for reference: Vimeo's API gives no files on the current plan, so this answers with a
 * pointer to "Replace with a file". Moves one Vimeo version into our storage so it plays in the review room.
 * The file streams from Vimeo to R2 in 16 MB parts (one part in memory at a time). The version keeps
 * its number, status, Final, feedback and dates; nothing is sent, and the portal-state email
 * markers aren't touched, so the scheduler sees nothing new. The old Vimeo link moves to vimeoUrl.
 */
export async function POST(req: Request) {
  const started = Date.now()
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  if (admin.viewOnly || admin.sample) return json({ ok: false, error: 'Not in view-only or sample mode.' }, 403)
  if (!r2Ready()) return json({ ok: false, error: 'Review storage (R2) isn’t set up.' }, 503)
  const body = await req.json().catch(() => ({}))
  const p = await getProject(String(body.projectId ?? ''))
  const d = p?.deliverables.find((x) => x._key === body.key)
  if (!p || !d) return json({ ok: false, error: 'No such project or version.' }, 404)
  if (!/^[\w-]{1,40}$/.test(d._key)) return json({ ok: false, error: 'This version’s key can’t be used in a storage address.' }, 400)
  if (d.host === 'r2') return json({ ok: false, error: 'This version is already in the review room.' }, 409)
  if (!vimeoId(d.shareUrl)) return json({ ok: false, error: 'This version has no Vimeo link.' }, 400)

  let src
  try {
    src = await vimeoSourceFile(d.shareUrl)
  } catch (e) {
    return json({ ok: false, error: `Vimeo didn’t answer: ${String(e).slice(0, 160)}` }, 502)
  }
  if (!src) return json({ ok: false, error: 'Vimeo won’t hand over the file on this plan. Use Replace with a file on the version instead.' }, 502)

  const ext = src.mov ? 'mov' : 'mp4'
  const objectKey = `review/${p._id}/${d._key}/v${d.version || 1}-${randomBytes(3).toString('hex')}.${ext}`
  const uploadId = await createMultipart(objectKey, src.mov ? 'video/quicktime' : 'video/mp4')
  try {
    const res = await fetch(src.link, { cache: 'no-store' })
    if (!res.ok || !res.body) throw new Error(`Vimeo file download ${res.status}`)
    const reader = res.body.getReader()
    const parts: { n: number; etag: string }[] = []
    let chunks: Uint8Array[] = []
    let held = 0
    const flush = async () => {
      const n = parts.length + 1
      const blob = Buffer.concat(chunks, held)
      chunks = []
      held = 0
      for (let attempt = 0; ; attempt++) {
        const put = await fetch(presignPart(objectKey, uploadId, n), { method: 'PUT', body: blob, cache: 'no-store' }).catch((e) => e as Error)
        const etag = put instanceof Response && put.ok ? put.headers.get('ETag') : null
        if (etag) return void parts.push({ n, etag })
        if (attempt >= 2) throw new Error(`part ${n} failed: ${put instanceof Response ? put.status : String(put).slice(0, 80)}`)
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (value) {
        chunks.push(value)
        held += value.byteLength
        if (held >= PART) await flush()
      }
      if (done) break
    }
    if (held > 0 || !parts.length) await flush()
    await completeMultipart(objectKey, uploadId, parts)
  } catch (e) {
    await abortMultipart(objectKey, uploadId).catch(() => {})
    return json({ ok: false, error: `Copying the file failed: ${String(e).slice(0, 200)}` }, 502)
  }

  const size = await headObject(objectKey)
  if (!size) return json({ ok: false, error: 'The file didn’t arrive in storage.' }, 502)

  // The thumbnail is a nice-to-have: any failure just means none.
  let r2Thumb: string | undefined
  if (src.thumb1280) {
    try {
      const img = await fetch(src.thumb1280, { cache: 'no-store' })
      if (img.ok) {
        const key = thumbKeyFor(objectKey)
        const put = await fetch(presignPut(key), { method: 'PUT', body: Buffer.from(await img.arrayBuffer()), headers: { 'Content-Type': 'image/jpeg' }, cache: 'no-store' })
        if (put.ok) r2Thumb = key
      }
    } catch {
      /* no thumbnail */
    }
  }

  await moveVersionToR2(p._id, d, { r2Key: objectKey, r2Size: size, r2Thumb, durationSec: src.duration, width: src.width, height: src.height, fps: src.fps })
  await addLog(p._id, `${d.title}: moved from Vimeo to the review room`, 'office')

  return json({ ok: true, r2Key: objectKey, size, seconds: Math.round((Date.now() - started) / 1000) })
}
