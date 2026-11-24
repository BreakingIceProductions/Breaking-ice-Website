import 'server-only'
import { cache } from 'react'
import { requireAccess } from './current'
import { byStart, clientCanOpen, today, versionLabel, versionPath } from './library'
import { quoteExpired } from './quotes'
import { listRequests } from './sign-store'

export type NoticeItem = { key: string; label: string; sub?: string; href: string }
export type NoticeGroup = { key: string; title: string; items: NoticeItem[] }

const atPath = (parts: string[]) => parts.map(encodeURIComponent).join('/')
const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Everything waiting on the signed-in client, grouped by project: quotes to sign, payments due,
 * versions awaiting feedback and documents to sign. Fetched once per request (the top bar and the
 * home page share it); the only extra query is the sign requests.
 */
export const notificationsFor = cache(async () => {
  const { clients, projects, quotes, payments } = await requireAccess()
  const t = today()
  const toSign = quotes.filter((q) => !q.signature && !quoteExpired(q, t))
  const due = payments.filter((x) => x.status === 'due')
  const docs = clients.length
    ? await listRequests({ clientIds: clients.map((c) => c._id) })
      .then((l) => l.filter((r) => r.audience === 'client' && (r.status === 'out' || r.status === 'viewed')))
      .catch(() => [])
    : []

  const groups = new Map<string, NoticeGroup>()
  const add = (key: string, title: string, item: NoticeItem) => {
    const g = groups.get(key) ?? { key, title, items: [] }
    g.items.push(item)
    groups.set(key, g)
  }
  const bySlug = new Map(projects.map((p) => [p.slug, p]))
  const byId = new Map(projects.map((p) => [p._id, p]))

  // Projects in the same order as the home page; quotes for projects not in the portal yet go last.
  for (const p of [...projects].sort(byStart)) groups.set(p._id, { key: p._id, title: p.title, items: [] })

  for (const q of toSign) {
    const p = bySlug.get(q.slug)
    add(p?._id ?? 'quotes', p?.title ?? 'Quotes', { key: `q-${q.slug}`, label: p ? 'Quote ready to sign' : q.title, sub: p ? undefined : 'Quote ready to sign', href: `/portal/quotes/${q.slug}` })
  }
  for (const x of due) {
    const p = (x.projectId && byId.get(x.projectId)) || (x.slug && bySlug.get(x.slug)) || undefined
    add(p?._id ?? `pay-${x.slug ?? x._id}`, p?.title ?? x.projectTitle ?? 'Payments', { key: `pay-${x._id}`, label: `${x.label} · ${money(x.total)}`, sub: 'Ready to pay', href: x.slug ? `/portal/${x.slug}#billing` : '/portal' })
  }
  for (const p of projects) {
    for (const d of p.deliverables ?? []) {
      if (d.status !== 'awaiting-feedback' || !clientCanOpen(d, p.deliverables)) continue
      add(p._id, p.title, { key: `d-${d._key}`, label: `${d.title} · ${versionLabel(d)}`, sub: 'Waiting for your feedback', href: `/portal/${p.slug}?at=${atPath(versionPath(d))}` })
    }
  }
  for (const r of docs) {
    const p = (r.projectId && byId.get(r.projectId)) || (r.projectSlug && bySlug.get(r.projectSlug)) || undefined
    add(p?._id ?? 'documents', p?.title ?? r.projectTitle ?? 'Documents', { key: `doc-${r._id}`, label: r.snapshot.title, sub: 'Ready to sign', href: `/portal/documents/${r._id}` })
  }

  const list = [...groups.values()].filter((g) => g.items.length)
  return { groups: list, count: list.reduce((n, g) => n + g.items.length, 0), toSign, due, waiting: list.reduce((n, g) => n + g.items.filter((i) => i.key.startsWith('d-')).length, 0) }
})
