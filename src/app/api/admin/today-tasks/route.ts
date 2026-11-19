import { adminFromRequest } from '@/admin/auth'
import { adminSampleMode } from '@/admin/config'
import { listProjects } from '@/admin/data'
import { fmtDay, today } from '@/admin/dates'
import { isDueByToday, openTasks, taskDay, ticktickConnection } from '@/admin/ticktick'
import { json } from '@/portal/http'

export const runtime = 'nodejs'

type Task = { id: string; title: string; where: string; late?: string }

/** TickTick tasks due today or overdue, for the Today page. Read after the page renders, since it asks TickTick once per project list. */
export async function GET(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin) return json({ ok: false, error: 'signed-out' }, 401)
  const projects = (await listProjects()).filter((p) => !p.archived)
  const where = (p: (typeof projects)[number]) => `${p.client.organizationName} · ${p.title}`

  if (adminSampleMode()) {
    const s = (title: string, i: number): Task[] => (projects[i] ? [{ id: title, title, where: where(projects[i]) }] : [])
    return json({ ok: true, connected: true, tasks: [...s('Apply round 2 notes', 0), ...s('Export rough cut v1', 2), ...s('Create October invoice', 1), ...s('Confirm charter', 5)] })
  }
  if (!(await ticktickConnection().catch(() => null))) return json({ ok: true, connected: false, tasks: [] })

  const t = today()
  const withList = projects.filter((p) => p.office.ticktickProjectId && p.pipelineStage !== 'paid').slice(0, 12)
  const lists = await Promise.all(
    withList.map((p) => openTasks(p.office.ticktickProjectId!).then((ts) => ts.map((task) => ({ task, p }))).catch(() => [])),
  )
  const tasks: Task[] = lists
    .flat()
    .filter((x) => isDueByToday(x.task))
    .sort((a, b) => (taskDay(a.task) ?? '').localeCompare(taskDay(b.task) ?? ''))
    .slice(0, 8)
    .map(({ task, p }) => {
      const day = taskDay(task)
      return { id: task.id, title: task.title, where: where(p), ...(day && day < t && { late: fmtDay(day) }) }
    })
  return json({ ok: true, connected: true, tasks })
}
