import 'server-only'
import { randomBytes } from 'node:crypto'
import { portalClient } from '@/portal/data'
import { adminEnv, adminSampleMode } from './config'

/**
 * View-only guests: people Josh lets look around the back office for a set time.
 * They live in one record in the private dataset, are checked on every request,
 * and can never change anything (see adminFromRequest). Full access still comes
 * only from ADMIN_EMAILS.
 */

export type Guest = { _key: string; email: string; name?: string; /** ISO time access ends. */ until: string; addedAt: string }

const ID = 'bo-guests'
const norm = (e: string) => e.trim().toLowerCase()

export async function listGuests(): Promise<Guest[]> {
  if (adminSampleMode()) return []
  try {
    const doc = await portalClient.fetch<{ guests?: Guest[] } | null>(`*[_id == $id][0]{guests}`, { id: ID }, { cache: 'no-store' })
    return doc?.guests ?? []
  } catch (e) {
    // If the list can't be read, nobody gets guest access.
    console.error('[admin] guest list failed', e)
    return []
  }
}

/** What an address may do right now: everything, look only, or nothing. */
export async function accessOf(email: string): Promise<'admin' | 'viewer' | null> {
  const e = norm(email)
  if (adminEnv.emails.includes(e)) return 'admin'
  if (adminEnv.viewers.includes(e)) return 'viewer'
  const now = new Date().toISOString()
  return (await listGuests()).some((g) => norm(g.email) === e && g.until > now) ? 'viewer' : null
}

export async function addGuest(email: string, name: string, days: number) {
  const e = norm(email)
  const guest: Guest = { _key: randomBytes(6).toString('hex'), email: e, ...(name && { name }), until: new Date(Date.now() + days * 86_400_000).toISOString(), addedAt: new Date().toISOString() }
  const rest = (await listGuests()).filter((g) => norm(g.email) !== e)
  await portalClient.createIfNotExists({ _id: ID, _type: 'boGuests' })
  await portalClient.patch(ID).set({ guests: [...rest, guest] }).commit()
}

export async function removeGuest(key: string) {
  await portalClient.patch(ID).unset([`guests[_key=="${key.replace(/[^a-f0-9]/g, '')}"]`]).commit()
}
