import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { portalClient } from '@/portal/data'
import { adminSampleMode } from './config'
import { applyAction, EMPTY_PEOPLE, normEmail, normalizeStore, PeopleError, type OnlyPerson, type PeopleStore, type TaggedEntry } from './people-shared'

/**
 * Tags and "contacts only" people, kept in one record in the private dataset like the guest list.
 *
 *   bo-people (_type boPeople)
 *     tags:   string[]                                       tag names in use
 *     tagged: { _key, email, tags?, phone?, role?, note? }[]  for client contacts and leads, found by lower-cased
 *                                                            email (_key is a hash of it: an email can't be a field name)
 *     people: { _key, name, email?, phone?, company?, role?, note?, tags?, addedAt }[]   contacts only
 *
 * Nothing here is ever written to a client's `contacts`, so nobody added on this page can ask for a
 * portal sign-in link, and nothing is emailed to them.
 */

const ID = 'bo-people'
const FIELDS = `tags, tagged, people`

const SAMPLE: PeopleStore = normalizeStore({
  tags: ['Decision maker', 'Repeat client', 'Government', 'Crew', 'Vendor', 'Referral partner'],
  tagged: [
    { _key: 's1', email: 'imperial@example.com', tags: ['Decision maker', 'Repeat client'], role: '[Their role]', phone: '780-555-0110' },
    { _key: 's2', email: 'nwa@example.com', tags: ['Repeat client'] },
    { _key: 's4', email: 'canoe@example.com', tags: ['Repeat client'] },
    { _key: 's3', email: 'gnwt@example.com', tags: ['Government', 'Decision maker'], note: '[A note about how they like to work.]' },
  ],
  people: [
    { _key: 'sp1', name: '[Camera operator]', email: 'crew@example.com', phone: '867-555-0133', company: '[Freelance]', role: 'Camera operator', tags: ['Crew'], note: '[Day rate, kit and where they’re based.]', addedAt: new Date(Date.now() - 12 * 86_400_000).toISOString() },
    { _key: 'sp2', name: '[Drone pilot]', phone: '867-555-0178', role: 'Drone pilot', tags: ['Crew', 'Vendor'], addedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() },
    { _key: 'sp3', name: '[Referral partner]', email: 'partner@example.com', company: '[Agency]', tags: ['Referral partner'], addedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  ],
})

/** For pages: the list as it stands, or empty when it can't be read. */
export async function getPeople(): Promise<PeopleStore> {
  if (adminSampleMode()) return SAMPLE
  try {
    return normalizeStore(await portalClient.fetch(`*[_id == $id][0]{${FIELDS}}`, { id: ID }, { cache: 'no-store' }))
  } catch (e) {
    console.error('[admin] people list failed', e)
    return EMPTY_PEOPLE
  }
}

const emailKey = (email: string) => createHash('sha1').update(email).digest('hex').slice(0, 16)
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

/**
 * Makes one change (see PeopleAction) and saves only what it touched: each person is set, added or
 * removed by its own key, so two tabs editing different people don't overwrite each other.
 * Throws PeopleError when the change can't be made. Sample mode is handled by the route and never gets here.
 */
export async function changePeople(action: unknown): Promise<{ key?: string }> {
  if (adminSampleMode()) return {}
  // A failed read stops the change: saving against an empty list would be wrong.
  const cur = normalizeStore(await portalClient.fetch(`*[_id == $id][0]{${FIELDS}}`, { id: ID }, { cache: 'no-store' }))
  const { store: next, key } = applyAction(cur, action, { key: () => randomBytes(6).toString('hex'), emailKey, now: () => new Date().toISOString() })

  // A contacts-only person can't take the address of someone who's a client contact or on a lead: that person is already in the list.
  const a = action as { action?: string; fields?: { email?: unknown } }
  const newEmail = a.action === 'savePerson' ? normEmail(a.fields?.email) : ''
  if (newEmail && next.people.some((p) => p.email === newEmail) && !cur.people.some((p) => p.email === newEmail)) {
    const taken = await portalClient.fetch<number>(
      `count(*[_type == "client" && count(contacts[lower(email) == $e]) > 0]) + count(*[_type == "boState" && lower(lead.email) == $e])`,
      { e: newEmail },
      { cache: 'no-store' },
    )
    if (taken) throw new PeopleError('That email already belongs to someone in the list. Open them instead.')
  }

  const set: Record<string, unknown> = {}
  const unset: string[] = []
  const added: { tagged: TaggedEntry[]; people: OnlyPerson[] } = { tagged: [], people: [] }
  if (JSON.stringify(cur.tags) !== JSON.stringify(next.tags)) set.tags = next.tags
  for (const list of ['tagged', 'people'] as const) {
    const before = new Map<string, TaggedEntry | OnlyPerson>(cur[list].map((x) => [x._key, x]))
    for (const item of next[list]) {
      const was = before.get(item._key)
      before.delete(item._key)
      if (!was) (added[list] as (TaggedEntry | OnlyPerson)[]).push(clean(item))
      else if (JSON.stringify(clean(was)) !== JSON.stringify(clean(item))) set[`${list}[_key=="${item._key}"]`] = clean(item)
    }
    for (const gone of before.keys()) unset.push(`${list}[_key=="${gone.replace(/[^a-zA-Z0-9_-]/g, '')}"]`)
  }
  if (!Object.keys(set).length && !unset.length && !added.tagged.length && !added.people.length) return { key }

  const tx = portalClient.transaction().createIfNotExists({ _id: ID, _type: 'boPeople' })
  tx.patch(ID, (p) => {
    p = p.setIfMissing({ tags: [], tagged: [], people: [] })
    if (Object.keys(set).length) p = p.set(set)
    return unset.length ? p.unset(unset) : p
  })
  // One insert per patch, so each list that grew gets its own.
  if (added.tagged.length) tx.patch(ID, (p) => p.append('tagged', added.tagged))
  if (added.people.length) tx.patch(ID, (p) => p.append('people', added.people))
  await tx.commit({ autoGenerateArrayKeys: false })
  return { key }
}
