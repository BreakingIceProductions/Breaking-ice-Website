import { adminFromRequest } from '@/admin/auth'
import { portalClient } from '@/portal/data'
import { json } from '@/portal/http'
import { getQuote, uploadAsset } from '@/portal/quotes'

export const runtime = 'nodejs'

const MAX_IMAGE = 1024 * 1024

/** Form data: projectId, image (a JPEG of the quote's first page, made in the browser). */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  if (admin.sample) return json({ ok: true, sample: true })
  const form = await req.formData().catch(() => null)
  const projectId = form?.get('projectId')
  const image = form?.get('image')
  if (typeof projectId !== 'string' || !(image instanceof File) || !image.size || image.size > MAX_IMAGE || !/^image\/(jpeg|png|webp)$/.test(image.type)) return json({ ok: false, error: 'invalid' }, 400)
  const doc = await getQuote(projectId)
  if (!doc) return json({ ok: false, error: 'not-found' }, 404)
  const cover = await uploadAsset('image', new Uint8Array(await image.arrayBuffer()), `${projectId}-cover.jpg`, image.type)
  await portalClient.patch(doc._id).set({ cover }).commit()
  return json({ ok: true })
}
