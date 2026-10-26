/**
 * The client library: Client → Project → Videos / Documents / Reference Assets → title → versions.
 * A project's deliverables are stored one entry per version; entries with the same title
 * and type are versions of one deliverable. Shared by the portal and the back office.
 */

import type { Dot, FinderNode } from './finder'
import type { Deliverable } from './types'

export type Category = 'video' | 'document'
export const CATEGORY_LABEL: Record<Category, string> = { video: 'Videos', document: 'Documents' }
export const REFERENCE = 'Reference Assets'

/** "2026-10-19 Management Plan Explainer" (just the title until a start date is set). */
export const projectLabel = (p: { title: string; startDate?: string }) => (p.startDate ? `${p.startDate} ${p.title}` : p.title)

export const categoryOf = (d: Pick<Deliverable, 'category' | 'shareUrl' | 'fileUrl'>): Category =>
  d.category ?? (d.fileUrl && !d.shareUrl ? 'document' : 'video')

export const versionLabel = (d: Pick<Deliverable, 'final' | 'version'>) => (d.final ? 'Final' : `Version ${d.version || 1}`)

export type DeliverableGroup = {
  /** Stable id for the column: category + title. */
  id: string
  category: Category
  title: string
  /** Oldest first, as they appear in the column. */
  versions: Deliverable[]
  latest: Deliverable
}

const groupId = (category: Category, title: string) => `${category}:${title.trim().toLowerCase()}`

/** Versions grouped under their deliverable, per category. Versions still in progress are left out unless asked for. */
export function groupDeliverables(all: Deliverable[] = [], { includeInProgress = false } = {}): Record<Category, DeliverableGroup[]> {
  const groups = new Map<string, DeliverableGroup>()
  for (const d of all) {
    if (!d?.title) continue
    if (!includeInProgress && d.status === 'in-progress') continue
    const category = categoryOf(d)
    const id = groupId(category, d.title)
    const g = groups.get(id) ?? { id, category, title: d.title.trim(), versions: [], latest: d }
    g.versions.push(d)
    groups.set(id, g)
  }
  const out: Record<Category, DeliverableGroup[]> = { video: [], document: [] }
  for (const g of groups.values()) {
    g.versions.sort((a, b) => (a.version || 1) - (b.version || 1))
    g.latest = g.versions[g.versions.length - 1]
    out[g.category].push(g)
  }
  // Most recently updated deliverable first.
  for (const k of Object.keys(out) as Category[]) out[k].sort((a, b) => (b.latest.date ?? '').localeCompare(a.latest.date ?? '') || a.title.localeCompare(b.title))
  return out
}

/** The newest version of a deliverable that the client has been sent (in-progress versions don't count). */
export function isLatest(d: Deliverable, all: Deliverable[] = []) {
  const id = groupId(categoryOf(d), d.title)
  const sent = all.filter((x) => x.title && x.status !== 'in-progress' && groupId(categoryOf(x), x.title) === id)
  return !sent.some((x) => (x.version || 1) > (d.version || 1))
}

/** What the client can open: the newest version, plus any older one you've switched on. */
export const clientCanOpen = (d: Deliverable, all: Deliverable[] = []) => d.status !== 'in-progress' && (isLatest(d, all) || Boolean(d.clientCanView))

/** Next version number for a title, and the title as already written (so "poster" joins "Poster"). */
export function nextVersion(all: Deliverable[] = [], category: Category, title: string) {
  const id = groupId(category, title)
  const same = all.filter((x) => x.title && groupId(categoryOf(x), x.title) === id)
  return { version: same.reduce((n, x) => Math.max(n, x.version || 1), 0) + 1, title: same[0]?.title ?? title.trim() }
}

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' })

/* ── Columns ───────────────────────────────────────────────────────────── */


const dotFor = (d: Deliverable, side: 'client' | 'studio'): Dot | undefined =>
  d.final ? 'final'
  : d.status === 'awaiting-feedback' ? 'awaiting'
  : d.status === 'changes-requested' ? 'changes'
  : d.status === 'approved' ? 'approved'
  : d.status === 'in-progress' && side === 'studio' ? 'hidden'
  : undefined

const shortDate = (iso?: string) => (iso ? iso : '')

type ProjectLike = { _id: string; slug?: string; title: string; startDate?: string; deliverables?: Deliverable[]; status?: string }

/** One project's folders. The client sees only what they can open; Josh sees everything, older versions greyed. */
export function projectNode(p: ProjectLike, side: 'client' | 'studio'): FinderNode {
  const all = p.deliverables ?? []
  const groups = groupDeliverables(all, { includeInProgress: side === 'studio' })
  const versionNodes = (g: DeliverableGroup): FinderNode[] =>
    [...g.versions].reverse().map((d) => {
      const open = clientCanOpen(d, all)
      return {
        id: d._key,
        label: versionLabel(d),
        meta: [shortDate(d.date), side === 'studio' && !open && d.status !== 'in-progress' ? 'hidden from client' : null].filter(Boolean).join(' · ') || undefined,
        dot: dotFor(d, side),
        dim: !open,
        locked: side === 'client' && !open,
      }
    })
  const category = (key: 'videos' | 'documents', c: Category): FinderNode => ({
    id: key,
    label: CATEGORY_LABEL[c],
    meta: groups[c].length ? `${groups[c].length} ${groups[c].length === 1 ? 'item' : 'items'}` : undefined,
    childTitle: CATEGORY_LABEL[c] === 'Videos' ? 'Video' : 'Document',
    children: groups[c].map((g) => ({
      id: g.id,
      label: g.title,
      meta: `${versionLabel(g.latest)}${g.latest.date ? ` · ${g.latest.date}` : ''}`,
      dot: dotFor(g.latest, side),
      childTitle: 'Versions',
      children: versionNodes(g),
    })),
  })
  return {
    id: p.slug ?? p._id,
    label: projectLabel(p),
    meta: p.status === 'delivered' ? 'Delivered' : undefined,
    childTitle: 'Folders',
    children: [category('videos', 'video'), category('documents', 'document'), { id: 'assets', label: REFERENCE }],
  }
}

/** Newest project first (by start date, then title). */
export const byStart = <T extends { startDate?: string; title: string }>(a: T, b: T) => (b.startDate ?? '').localeCompare(a.startDate ?? '') || a.title.localeCompare(b.title)

/** What a path in the columns points at. */
export function resolvePath<P extends ProjectLike>(projects: P[], path: string[], offset = 0) {
  const project = projects.find((p) => (p.slug ?? p._id) === path[offset])
  const folder = project ? path[offset + 1] : undefined
  const all = project?.deliverables ?? []
  const category: Category | undefined = folder === 'videos' ? 'video' : folder === 'documents' ? 'document' : undefined
  const groups = category ? groupDeliverables(all, { includeInProgress: true })[category] : []
  const group = groups.find((g) => g.id === path[offset + 2])
  const version = group?.versions.find((d) => d._key === path[offset + 3])
  return { project, folder, category, group, version }
}
