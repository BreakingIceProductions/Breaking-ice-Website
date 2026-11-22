import 'server-only'
import { randomBytes } from 'node:crypto'
import { adminSampleMode } from '@/admin/config'
import { portalClient } from '@/portal/data'

/**
 * Changes and drafts Claude proposed in Slack, waiting for Josh's tap. One record each in the private
 * "portal" dataset, so the button carries only the id:
 *
 *   bo-slack-<id> (_type boSlackPending)
 *     action:    PendingAction  exactly what Confirm will do
 *     summary:   string         what Josh was shown
 *     createdAt, expiresAt      24 hours to decide
 *     doneAt, outcome           set once, when it's claimed (confirm or cancel), so a second tap can't run it again
 *
 * Sample mode (no Sanity token, locally): kept in memory instead.
 */

export type PendingAction =
  | { kind: 'log_contact'; projectId: string; contactKind: string; date: string; note: string }
  | { kind: 'add_note'; projectId: string; text: string }
  | { kind: 'move_stage'; projectId: string; from: string; to: string; actionIds: string[] }
  | { kind: 'create_lead'; name: string; email: string; company: string; title: string; projectType?: string; notes?: string; source?: string }
  | { kind: 'add_suggestion'; name: string; email?: string; company?: string; summary: string }
  | { kind: 'send_email'; projectId: string; to: string[]; subject: string; body: string }

export type PendingEntry = {
  _id: string
  _rev?: string
  action: PendingAction
  summary: string
  createdAt: string
  expiresAt: string
  doneAt?: string
  outcome?: string
}

const TTL_MS = 24 * 3_600_000
const PREFIX = 'bo-slack-'
const memory = new Map<string, PendingEntry>()
const useMemory = () => adminSampleMode()
const raw = { cache: 'no-store' as const }

export const validPendingId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id)

export async function createPending(action: PendingAction, summary: string): Promise<string> {
  const id = randomBytes(8).toString('hex')
  const now = Date.now()
  const doc: PendingEntry = { _id: PREFIX + id, action, summary: summary.slice(0, 3000), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString() }
  if (useMemory()) memory.set(id, doc)
  else {
    await portalClient.create({ ...doc, _type: 'boSlackPending' })
    // Housekeeping: entries a week past their expiry are of no use to anyone.
    await portalClient
      .delete({ query: `*[_type == "boSlackPending" && expiresAt < $cut]`, params: { cut: new Date(now - 7 * 86_400_000).toISOString() } })
      .catch(() => {})
  }
  return id
}

async function read(id: string): Promise<PendingEntry | null> {
  if (useMemory()) return memory.get(id) ?? null
  return portalClient.fetch<PendingEntry | null>(`*[_id == $id][0]{_id, _rev, action, summary, createdAt, expiresAt, doneAt, outcome}`, { id: PREFIX + id }, raw)
}

export class PendingError extends Error {}

/**
 * Claims the entry for confirm or cancel: checks it exists, hasn't expired and hasn't been used, then
 * marks it used against the revision it was read at. Two taps at once: one wins, the other gets a
 * PendingError. Returns the entry to run.
 */
export async function claimPending(id: string, outcome: 'running' | 'cancelled'): Promise<PendingEntry> {
  if (!validPendingId(id)) throw new PendingError('That button isn’t valid any more.')
  const e = await read(id)
  if (!e) throw new PendingError('That one isn’t there any more.')
  if (e.doneAt) throw new PendingError(e.outcome === 'cancelled' ? 'That one was already cancelled.' : 'That one was already done.')
  if (Date.parse(e.expiresAt) < Date.now()) throw new PendingError('That one expired (they last 24 hours). Ask me again.')
  const doneAt = new Date().toISOString()
  if (useMemory()) {
    memory.set(id, { ...e, doneAt, outcome })
    return e
  }
  try {
    await portalClient.patch(PREFIX + id).ifRevisionId(e._rev ?? '').set({ doneAt, outcome }).commit()
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) throw new PendingError('That one is already being handled.')
    throw err
  }
  return e
}

/** Records how it went (shown nowhere but kept for the record). Never throws. */
export async function finishPending(id: string, outcome: string) {
  if (useMemory()) {
    const e = memory.get(id)
    if (e) memory.set(id, { ...e, outcome })
    return
  }
  await portalClient
    .patch(PREFIX + id)
    .set({ outcome: outcome.slice(0, 500) })
    .commit()
    .catch((e) => console.error('[slack] pending outcome not saved', String(e).slice(0, 200)))
}
