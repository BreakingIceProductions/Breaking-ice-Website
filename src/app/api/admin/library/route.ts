import { adminFromRequest } from '@/admin/auth'
import { json } from '@/portal/http'
import { DOC_KINDS, newKey, type Audience, type DocField, type FieldType } from '@/portal/sign-docs'
import { getTemplate, saveTemplate, setApproved } from '@/portal/sign-store'

export const runtime = 'nodejs'

const TYPES: FieldType[] = ['text', 'date', 'money', 'choice']
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** The fill-ins list from the editor, cleaned. Keys are lower-case words joined by underscores. */
function cleanFields(raw: unknown): DocField[] | null {
  if (!Array.isArray(raw) || raw.length > 40) return null
  const out: DocField[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const key = str(r?.key, 40).toLowerCase()
    if (!/^[a-z][a-z0-9_]*$/.test(key) || out.some((f) => f.key === key)) return null
    const type = TYPES.includes(r.type as FieldType) ? (r.type as FieldType) : 'text'
    const options = type === 'choice' && Array.isArray(r.options) ? r.options.map((o) => str(o, 400)).filter(Boolean).slice(0, 8) : undefined
    if (type === 'choice' && (!options || options.length < 2)) return null
    out.push({
      _key: /^[\w-]{1,40}$/.test(String(r._key ?? '')) ? String(r._key) : newKey(),
      key,
      label: str(r.label, 100) || key,
      type,
      who: r.who === 'signer' ? 'signer' : 'owner',
      ...(options && { options }),
      ...(str(r.default, 300) && { default: str(r.default, 300) }),
      ...(r.who === 'signer' && r.minor === true && { minor: true }),
      ...(r.who === 'signer' && r.optional === true && { optional: true }),
    })
  }
  return out
}

/** { action: 'save', id, title, audience, body, fields } · { action: 'approve' | 'unapprove', id } */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const b = await req.json().catch(() => ({}))
  const id = str(b.id, 80)
  if (!DOC_KINDS.some((k) => id === `doc-template-${k}`)) return json({ ok: false, error: 'not-found' }, 404)
  const cur = await getTemplate(id)
  if (!cur) return json({ ok: false, error: 'not-found' }, 404)

  if (b.action === 'approve' || b.action === 'unapprove') {
    if (b.action === 'approve' && !cur.body.trim()) return json({ ok: false, message: 'Paste the wording first.' }, 400)
    const t = await setApproved(id, b.action === 'approve')
    return json({ ok: true, template: t, sample: Boolean(admin.sample) })
  }
  if (b.action === 'save') {
    const fields = cleanFields(b.fields)
    if (!fields) return json({ ok: false, message: 'Check the fill-ins: each needs a unique name (lower-case letters, numbers and _), and a choice needs at least two options.' }, 400)
    const body = typeof b.body === 'string' ? b.body.replace(/\r\n?/g, '\n').slice(0, 60_000) : ''
    const audience: Audience = b.audience === 'client' ? 'client' : 'person'
    const t = await saveTemplate(id, { title: str(b.title, 80) || cur.title, audience, body, fields })
    return json({ ok: true, template: t, sample: Boolean(admin.sample) })
  }
  return json({ ok: false, error: 'invalid' }, 400)
}
