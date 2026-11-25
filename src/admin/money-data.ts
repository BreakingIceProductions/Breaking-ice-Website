import 'server-only'
import { portalClient } from '@/portal/data'
import type { PortalPayment } from '@/portal/types'
import { adminSampleMode } from './config'
import { listProjects } from './data'
import type { Goals, MoneyProject } from './money'
import { SAMPLE_GOALS, sampleOfficePayments } from './money-samples'

/**
 * What the Money page reads: the projects (with the day each record was made), every portal
 * payment record, and the goals. All from the private dataset; nothing here calls Zoho Books
 * or Stripe. Invoice statuses are the ones the 10-minute sync last brought back.
 */

const GOALS_ID = 'bo-goals'
export const GOAL_KEYS = ['signedYear', 'collectedYear', 'leadsMonth', 'winRate'] as const

const PAYMENT_FIELDS = `_id, projectId, clientId, kind, label, amount, gst, total, status, createdAt, paidAt, method, cardFee, cardFeeGst, zohoInvoiceId, zohoInvoiceNumber,
  "projectTitle": *[_type == "clientProject" && _id == ^.projectId][0].title,
  "clientName": *[_type == "client" && _id == ^.clientId][0].organizationName`

async function read<T>(query: string, params: Record<string, unknown>, fallback: T): Promise<T> {
  try {
    return (await portalClient.fetch<T | null>(query, params, { cache: 'no-store' })) ?? fallback
  } catch (e) {
    console.error('[admin] money query failed', e)
    return fallback
  }
}

/** The goals, kept in one small record like the guest list. Empty when none are set. */
export async function getGoals(): Promise<Goals> {
  if (adminSampleMode()) return SAMPLE_GOALS
  const doc = await read<Goals>(`*[_id == $id][0]{signedYear, collectedYear, leadsMonth, winRate}`, { id: GOALS_ID }, {})
  return Object.fromEntries(GOAL_KEYS.filter((k) => Number(doc[k]) > 0).map((k) => [k, Number(doc[k])]))
}

/** Saves all four goals at once; a goal left out is cleared. */
export async function setGoals(goals: Goals) {
  if (adminSampleMode()) return
  const set = Object.fromEntries(GOAL_KEYS.filter((k) => goals[k]).map((k) => [k, goals[k]]))
  const unset = GOAL_KEYS.filter((k) => !goals[k])
  await portalClient.createIfNotExists({ _id: GOALS_ID, _type: 'boGoals' })
  await portalClient.patch(GOALS_ID).set({ ...set, updatedAt: new Date().toISOString() }).unset([...unset]).commit()
}

export async function loadMoney(): Promise<{ projects: MoneyProject[]; payments: PortalPayment[]; goals: Goals }> {
  if (adminSampleMode()) return { projects: await listProjects(), payments: sampleOfficePayments(), goals: SAMPLE_GOALS }
  const [projects, created, payments, goals] = await Promise.all([
    listProjects(),
    // When each project record was made: the lead date for projects from before stage history was kept.
    read<{ _id: string; _createdAt: string }[]>(`*[_type == "clientProject"]{_id, _createdAt}`, {}, []),
    read<PortalPayment[]>(`*[_type == "portalPayment" && status != "canceled"] | order(createdAt asc){${PAYMENT_FIELDS}}`, {}, []),
    getGoals(),
  ])
  const madeAt = new Map(created.map((c) => [c._id, c._createdAt]))
  return { projects: projects.map((p) => ({ ...p, _createdAt: madeAt.get(p._id) })), payments, goals }
}
