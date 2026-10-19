import 'server-only'
import { SITE_URL } from '@/lib/site'
import { adminEnv, ticktickReady } from './config'
import { getConnection, saveConnection } from './data'
import { today } from './dates'

/**
 * TickTick Open API (developer.ticktick.com). One list per project; tasks get
 * all-day due dates in Mountain time. Connected once from /admin/settings.
 */

const API = 'https://api.ticktick.com/open/v1'
const SCOPE = 'tasks:read tasks:write'
export const ticktickRedirect = () => `${SITE_URL}/api/admin/connect/ticktick/callback`

type Conn = { access: string; connectedAt: string; exp?: number }

export function ticktickAuthorizeUrl(state: string) {
  const u = new URL('https://ticktick.com/oauth/authorize')
  u.search = new URLSearchParams({ scope: SCOPE, client_id: adminEnv.ticktickId, state, redirect_uri: ticktickRedirect(), response_type: 'code' }).toString()
  return u.toString()
}

export async function ticktickExchange(code: string) {
  const res = await fetch('https://ticktick.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${adminEnv.ticktickId}:${adminEnv.ticktickSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      scope: SCOPE,
      redirect_uri: ticktickRedirect(),
      client_id: adminEnv.ticktickId,
      client_secret: adminEnv.ticktickSecret,
    }),
  })
  if (!res.ok) throw new Error(`ticktick token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  await saveConnection('ticktick', {
    access: j.access_token,
    connectedAt: new Date().toISOString(),
    exp: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined,
  } satisfies Conn)
}

export async function ticktickConnection() {
  if (!ticktickReady()) return null
  const c = await getConnection<Conn>('ticktick')
  if (!c?.access) return null
  return c.exp && c.exp < Date.now() ? null : c
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = await ticktickConnection()
  if (!c) throw new Error('TickTick isn’t connected')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.access}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('TickTick connection expired. Reconnect it in Settings.')
  if (!res.ok) throw new Error(`ticktick ${path.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/** TickTick wants "2026-10-22T06:00:00+0000": midnight in Edmonton, written in UTC. */
function dueDate(date: string) {
  const probe = new Date(`${date}T12:00:00Z`)
  const off = new Intl.DateTimeFormat('en-US', { timeZone: adminEnv.timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((x) => x.type === 'timeZoneName')?.value // e.g. "GMT-6"
  const hours = Number(off?.replace('GMT', '') || '-7')
  const utc = new Date(Date.parse(`${date}T00:00:00Z`) - hours * 3_600_000)
  return utc.toISOString().replace(/\.\d{3}Z$/, '+0000')
}

export async function createList(name: string) {
  const p = await call<{ id: string }>('/project', { method: 'POST', body: JSON.stringify({ name: name.slice(0, 64), viewMode: 'list', kind: 'TASK', color: '#C9773F' }) })
  return p.id
}

export async function createTask(projectId: string, t: { title: string; content?: string; due?: string }) {
  const r = await call<{ id: string }>('/task', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      title: t.title,
      content: t.content,
      ...(t.due ? { dueDate: dueDate(t.due), startDate: dueDate(t.due), isAllDay: true, timeZone: adminEnv.timeZone } : {}),
    }),
  })
  return r.id
}

export async function moveTaskDue(projectId: string, taskId: string, due: string) {
  await call(`/task/${encodeURIComponent(taskId)}`, {
    method: 'POST',
    body: JSON.stringify({ id: taskId, projectId, dueDate: dueDate(due), startDate: dueDate(due), isAllDay: true, timeZone: adminEnv.timeZone }),
  })
}

export type OpenTask = { id: string; projectId: string; title: string; dueDate?: string; status: number }

/** Open tasks in one project's list. */
export async function openTasks(projectId: string) {
  const r = await call<{ tasks?: OpenTask[] }>(`/project/${encodeURIComponent(projectId)}/data`)
  return (r?.tasks ?? []).filter((t) => t.status === 0)
}

/** "YYYY-MM-DD" (Mountain time) of a TickTick due date, for sorting and "today" checks. */
export const taskDay = (t: OpenTask) =>
  t.dueDate ? new Intl.DateTimeFormat('en-CA', { timeZone: adminEnv.timeZone }).format(new Date(t.dueDate.replace(/\+0000$/, 'Z'))) : undefined

export const isDueByToday = (t: OpenTask) => {
  const d = taskDay(t)
  return Boolean(d && d <= today())
}
