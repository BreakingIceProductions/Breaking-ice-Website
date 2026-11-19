/**
 * The people list: types, limits and the rules for every change, shared by the server and the browser.
 * No server-only imports. The server applies a change with applyAction and saves only what differs;
 * the browser runs the same function to show the change at once.
 */

/** Tags and details for someone who lives elsewhere (a client contact or a lead), found by email. */
export type TaggedEntry = { _key: string; email: string; tags?: string[]; phone?: string; role?: string; note?: string }

/** A "contacts only" person: crew, vendors, referral partners, past enquiries. No portal access, no emails. */
export type OnlyPerson = { _key: string; name: string; email?: string; phone?: string; company?: string; role?: string; note?: string; tags?: string[]; addedAt: string }

export type PeopleStore = { tags: string[]; tagged: TaggedEntry[]; people: OnlyPerson[] }

export const EMPTY_PEOPLE: PeopleStore = { tags: [], tagged: [], people: [] }

/** Offered when no tags exist yet. A starter tag is only saved once it's used. */
export const STARTER_TAGS = ['Decision maker', 'Repeat client', 'Referral partner', 'Crew', 'Vendor', 'Nonprofit', 'Government', 'Corporate']

export const LIMITS = { tag: 40, tags: 60, tagsEach: 12, people: 2000, tagged: 5000 }
const TEXT = { name: 120, email: 200, phone: 40, company: 160, role: 120, note: 2000 } as const
export type PersonField = keyof typeof TEXT
export type PersonFields = Partial<Record<PersonField, string>>
export const FIELD_MAX = TEXT

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase().slice(0, TEXT.email) : '')
export const validEmail = (e: string) => EMAIL.test(e)

/** A tag as typed: one line, single spaces, capped. Empty when there's nothing left. */
export const cleanTag = (t: unknown) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.tag).trim() : '')
export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const uniqTags = (tags: string[]) => tags.filter((t, i) => tags.findIndex((x) => sameTag(x, t)) === i)

/** Known fields only, as strings, trimmed and capped. An empty string clears the field. Null when anything is off. */
export function cleanFields(input: unknown, allowed: readonly PersonField[]): PersonFields | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out: PersonFields = {}
  for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.includes(k as PersonField) || typeof raw !== 'string') return null
    const f = k as PersonField
    let v = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    if (f !== 'note') v = v.replace(/\s+/g, ' ')
    v = v.trim().slice(0, TEXT[f])
    out[f] = f === 'email' ? v.toLowerCase() : v
  }
  if (out.email && !EMAIL.test(out.email)) return null
  return out
}

/** What the stored record becomes once it's read: no doubles, nothing malformed. */
export function normalizeStore(doc: unknown): PeopleStore {
  const d = (doc ?? {}) as { tags?: unknown; tagged?: unknown; people?: unknown }
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  const tagList = (v: unknown) => uniqTags(list(v).map(cleanTag).filter(Boolean))
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const tagged: TaggedEntry[] = []
  for (const raw of list(d.tagged)) {
    const email = normEmail(raw?.email)
    if (!email || typeof raw?._key !== 'string') continue
    const entry: TaggedEntry = { _key: raw._key, email, tags: tagList(raw.tags), phone: text(raw.phone, TEXT.phone), role: text(raw.role, TEXT.role), note: text(raw.note, TEXT.note) }
    // Two tabs adding the same person at once can leave two entries: read them as one.
    const seen = tagged.find((t) => t.email === email)
    if (seen) Object.assign(seen, { tags: uniqTags([...(seen.tags ?? []), ...(entry.tags ?? [])]), phone: seen.phone ?? entry.phone, role: seen.role ?? entry.role, note: seen.note ?? entry.note })
    else tagged.push(entry)
  }
  const people: OnlyPerson[] = []
  for (const raw of list(d.people)) {
    const name = text(raw?.name, TEXT.name)
    if (!name || typeof raw?._key !== 'string' || people.some((p) => p._key === raw._key)) continue
    people.push({ _key: raw._key, name, email: normEmail(raw.email) || undefined, phone: text(raw.phone, TEXT.phone), company: text(raw.company, TEXT.company), role: text(raw.role, TEXT.role), note: text(raw.note, TEXT.note), tags: tagList(raw.tags), addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : '' })
  }
  // A tag someone carries is always listed, even if the list itself missed it.
  const tags = uniqTags([...tagList(d.tags), ...tagged.flatMap((t) => t.tags ?? []), ...people.flatMap((p) => p.tags ?? [])])
  const canon = (ts?: string[]) => uniqTags((ts ?? []).map((t) => tags.find((x) => sameTag(x, t)) ?? t))
  return { tags, tagged: tagged.map((t) => ({ ...t, tags: canon(t.tags) })), people: people.map((p) => ({ ...p, tags: canon(p.tags) })) }
}

/** Every tag on one address: from its own entry, and from a contacts-only person with the same email. */
export function tagsFor(store: PeopleStore, email?: string): string[] {
  const e = normEmail(email)
  if (!e) return []
  const mine = [...(store.tagged.find((t) => t.email === e)?.tags ?? []), ...store.people.filter((p) => p.email === e).flatMap((p) => p.tags ?? [])]
  return store.tags.filter((t) => mine.some((m) => sameTag(m, t)))
}

/* ── The list ───────────────────────────────────────────────────────── */

export type PersonKind = 'client' | 'lead' | 'past' | 'contact'

/** Someone the server already knows: a client's contact, or the person on a lead. */
export type BasePerson = {
  id: string
  source: 'client' | 'lead'
  name: string
  email?: string
  phone?: string
  role?: string
  company: string
  clientId: string
  kind: PersonKind
  status: string
  /** ISO time of the client's latest activity, for "Newest". */
  last?: string
  studioHref?: string
  leadHref?: string
}

export type Person = Omit<BasePerson, 'source' | 'company' | 'clientId'> & {
  source: 'client' | 'lead' | 'only'
  company?: string
  clientId?: string
  /** Other companies the same address is listed with. */
  also: string[]
  note?: string
  tags: string[]
  /** The contacts-only record's key. */
  key?: string
}

const RANK: Record<PersonKind, number> = { client: 0, lead: 1, past: 2, contact: 3 }

/**
 * One row per person. People are matched by email (lower-cased): the row with the best standing wins
 * (client, then open lead, then past), a client's own contact beats a lead's, and a contacts-only
 * person with the same address folds into that row. Anyone without an email is their own row.
 */
export function mergePeople(base: BasePerson[], store: PeopleStore): Person[] {
  const out: Person[] = []
  const byEmail = new Map<string, Person>()
  const order = (tags: string[]) => store.tags.filter((t) => tags.some((x) => sameTag(x, t)))
  const sorted = [...base].sort((a, b) => RANK[a.kind] - RANK[b.kind] || Number(a.source === 'lead') - Number(b.source === 'lead'))
  for (const b of sorted) {
    const email = normEmail(b.email) || undefined
    const seen = email && byEmail.get(email)
    if (seen) {
      seen.phone ??= b.phone
      seen.role ??= b.role
      if (b.company && b.company !== seen.company && !seen.also.includes(b.company)) seen.also.push(b.company)
      continue
    }
    const extra = email ? store.tagged.find((t) => t.email === email) : undefined
    const p: Person = { ...b, email, phone: extra?.phone ?? b.phone, role: extra?.role ?? b.role, note: extra?.note, tags: order(extra?.tags ?? []), also: [] }
    out.push(p)
    if (email) byEmail.set(email, p)
  }
  for (const o of store.people) {
    const seen = o.email && byEmail.get(o.email)
    if (seen) {
      seen.tags = order([...seen.tags, ...(o.tags ?? [])])
      seen.phone ??= o.phone
      seen.role ??= o.role
      seen.note ??= o.note
      continue
    }
    const p: Person = { id: `p:${o._key}`, key: o._key, source: 'only', name: o.name, email: o.email, phone: o.phone, role: o.role, note: o.note, company: o.company, kind: 'contact', status: 'Contact', last: o.addedAt || undefined, tags: order(o.tags ?? []), also: [] }
    out.push(p)
    if (o.email) byEmail.set(o.email, p)
  }
  return out
}

/* ── Changes ────────────────────────────────────────────────────────── */

export const PEOPLE_ACTIONS = ['tag', 'untag', 'savePerson', 'removePerson', 'renameTag', 'deleteTag'] as const
export type PeopleActionName = (typeof PEOPLE_ACTIONS)[number]

/**
 * What the browser posts to /api/admin/people.
 *  - tag / untag: `key` for a contacts-only person, otherwise `email`.
 *  - savePerson: with `key`, edits a contacts-only person; with `email`, sets phone, role or note for a
 *    client contact or a lead; with neither, adds a contacts-only person (`fields.name` needed, `tags` optional).
 *  - removePerson: `key`. renameTag: `from`, `to`. deleteTag: `tag`.
 */
export type PeopleAction = { action: PeopleActionName; key?: string; email?: string; tag?: string; from?: string; to?: string; fields?: PersonFields; tags?: string[] }

/** A change that can't be made, with a line to show the person. */
export class PeopleError extends Error {}
const fail = (message: string): never => {
  throw new PeopleError(message)
}

const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as T
const GONE = 'That person isn’t in the list any more. Reload the page.'

/**
 * The record after one change. Checks everything (it runs on the server against a fresh read), and
 * throws PeopleError with a plain message when the change can't be made. Never touches a client's contacts.
 */
export function applyAction(store: PeopleStore, input: unknown, make: { key: () => string; emailKey: (email: string) => string; now: () => string }): { store: PeopleStore; key?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('That didn’t look right.')
  const a = input as Record<string, unknown>
  const key = typeof a.key === 'string' ? a.key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : ''
  const email = normEmail(a.email)
  if (email && !validEmail(email)) fail('That email doesn’t look right.')
  let { tags, tagged, people } = store
  const canon = (t: string) => tags.find((x) => sameTag(x, t)) ?? t
  const useTag = (t: string) => {
    if (tags.some((x) => sameTag(x, t))) return
    if (tags.length >= LIMITS.tags) fail(`That’s ${LIMITS.tags} tags already. Delete one you don’t use first.`)
    tags = [...tags, t]
  }
  const capEach = (list: string[]) => (list.length > LIMITS.tagsEach ? fail(`One person can have up to ${LIMITS.tagsEach} tags.`) : list)
  /** Changes the entry for an address, making it when needed and dropping it once it's empty. */
  const entry = (change: (e: TaggedEntry) => TaggedEntry) => {
    const cur = tagged.find((t) => t.email === email)
    if (!cur && tagged.length >= LIMITS.tagged) fail('The list is full.')
    const next = compact(change(cur ?? { _key: make.emailKey(email), email }))
    const empty = !next.tags?.length && !next.phone && !next.role && !next.note
    tagged = cur ? tagged.flatMap((t) => (t === cur ? (empty ? [] : [next]) : [t])) : empty ? tagged : [...tagged, next]
  }

  switch (a.action) {
    case 'tag':
    case 'untag': {
      const typed = cleanTag(a.tag)
      if (!typed) fail('Type a tag name.')
      const tag = canon(typed)
      const add = a.action === 'tag'
      const change = (list: string[] = []) => (add ? (list.some((t) => sameTag(t, tag)) ? list : capEach([...list, tag])) : list.filter((t) => !sameTag(t, tag)))
      if (add) useTag(tag)
      if (key) {
        if (!people.some((p) => p._key === key)) fail(GONE)
        people = people.map((p) => (p._key === key ? compact({ ...p, tags: change(p.tags) }) : p))
      } else if (email) {
        entry((e) => ({ ...e, tags: change(e.tags) }))
        // A contacts-only person folded into this row may be the one carrying the tag.
        if (!add) people = people.map((p) => (p.email === email && p.tags?.some((t) => sameTag(t, tag)) ? compact({ ...p, tags: change(p.tags) }) : p))
      } else fail('This person needs an email before they can be tagged.')
      break
    }
    case 'savePerson': {
      if (!key && email) {
        const f = cleanFields(a.fields, ['phone', 'role', 'note']) ?? fail('Some of that doesn’t look right.')
        entry((e) => ({ ...e, ...f }))
        break
      }
      const f = cleanFields(a.fields, ['name', 'email', 'phone', 'company', 'role', 'note']) ?? fail('Some of that doesn’t look right. Check the email.')
      const cur = key ? (people.find((p) => p._key === key) ?? fail(GONE)) : undefined
      if (f.email && people.some((p) => p.email === f.email && p !== cur)) fail('Someone in the list already has that email.')
      if (cur) {
        const next = compact({ ...cur, ...f })
        if (!next.name) fail('Add a name.')
        people = people.map((p) => (p === cur ? next : p))
        break
      }
      if (!f.name) fail('Add a name.')
      if (people.length >= LIMITS.people) fail('The list is full.')
      const wanted = Array.isArray(a.tags) ? uniqTags(a.tags.map(cleanTag).filter(Boolean)).map(canon) : []
      capEach(wanted).forEach(useTag)
      const made = make.key()
      people = [...people, compact({ _key: made, name: f.name!, ...f, tags: wanted, addedAt: make.now() })]
      return { store: { tags, tagged, people }, key: made }
    }
    case 'removePerson': {
      if (!key) fail(GONE)
      people = people.filter((p) => p._key !== key)
      break
    }
    case 'renameTag':
    case 'deleteTag': {
      const from = tags.find((t) => sameTag(t, cleanTag(a.action === 'renameTag' ? a.from : a.tag))) ?? fail('That tag isn’t in the list any more. Reload the page.')
      const to = a.action === 'renameTag' ? cleanTag(a.to) || fail('Type the new name.') : ''
      // Renaming to a name another tag already has joins the two.
      const swap = (list?: string[]) => uniqTags((list ?? []).flatMap((t) => (sameTag(t, from) ? (to ? [to] : []) : sameTag(t, to) ? [to] : [t])))
      const has = (list?: string[]) => Boolean(list?.some((t) => sameTag(t, from)))
      tags = swap(tags)
      tagged = tagged.flatMap((t) => {
        if (!has(t.tags)) return [t]
        const next = compact({ ...t, tags: swap(t.tags) })
        return next.tags?.length || next.phone || next.role || next.note ? [next] : []
      })
      people = people.map((p) => (has(p.tags) ? compact({ ...p, tags: swap(p.tags) }) : p))
      break
    }
    default:
      fail('That didn’t look right.')
  }
  return { store: { tags, tagged, people } }
}
