import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { listClients, type ClientSummary } from '@/admin/data'
import { ago } from '@/admin/insights'
import { stageIndex, stageTitle } from '@/admin/stages'
import { PeopleTable, type Person } from '@/admin/ui/people'

export const metadata = { title: 'Clients' }

/** Where a client stands, from its projects: an open job beats an open lead beats past work. */
function standing(c: ClientSummary): Pick<Person, 'kind' | 'status'> {
  const live = c.projects.filter((p) => !p.archived)
  const active = live.filter((p) => stageIndex(p.pipelineStage) >= stageIndex('booked') && stageIndex(p.pipelineStage) < stageIndex('paid')).sort((a, b) => stageIndex(a.pipelineStage) - stageIndex(b.pipelineStage))[0]
  if (active) return { kind: 'client', status: `Client · ${stageTitle(active.pipelineStage)}` }
  const lead = live.find((p) => stageIndex(p.pipelineStage) < stageIndex('booked'))
  if (lead) return { kind: 'lead', status: `Lead · ${stageTitle(lead.pipelineStage)}` }
  if (c.projects.length) return { kind: 'past', status: 'Past client' }
  return { kind: 'contact', status: 'No projects yet' }
}

export default async function Contacts() {
  await requireAdmin()
  const clients = await listClients()
  const people: Person[] = clients.flatMap((c) => {
    const base = { company: c.organizationName, clientId: c._id, projects: c.projects.length, last: c.lastActivity, lastLabel: c.lastActivity ? ago(c.lastActivity) : undefined, ...standing(c) }
    const contacts = (c.contacts ?? []).filter((x) => x.name || x.email)
    return contacts.length
      ? contacts.map((x) => ({ ...base, id: `${c._id}:${x._key}`, name: x.name || x.email, role: x.role, email: x.email }))
      : [{ ...base, id: c._id, name: 'No contact added yet' }]
  })
  const count = (k: Person['kind']) => new Set(people.filter((p) => p.kind === k).map((p) => p.clientId)).size
  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Everyone in one list</span>
          <h1 className="a-h1">Clients</h1>
        </div>
        <div className="btn-row">
          <Link className="btn btn-secondary" href="/admin/clients">Open the Finder</Link>
          <a className="btn btn-primary" href="/studio/portal/intent/create/template=client;type=client" target="_blank" rel="noopener noreferrer">
            New client<span className="sr-only"> (opens the Studio)</span>
          </a>
        </div>
      </header>

      <section aria-label="At a glance" className="a-kpis">
        <div className="a-kpi"><span className="a-kpi-label">Companies</span><span className="a-kpi-num">{clients.length}</span><span className="a-kpi-note">{people.filter((p) => p.email).length} people with an email</span></div>
        <div className="a-kpi"><span className="a-kpi-label">Working with now</span><span className="a-kpi-num">{count('client')}</span><span className="a-kpi-note">Booked through delivered</span></div>
        <div className="a-kpi"><span className="a-kpi-label">Open leads</span><span className="a-kpi-num">{count('lead')}</span><span className="a-kpi-note">Lead or quoted</span></div>
        <div className="a-kpi"><span className="a-kpi-label">Past clients</span><span className="a-kpi-num">{count('past')}</span><span className="a-kpi-note">Worth a check-in</span></div>
      </section>

      <PeopleTable people={people} />
    </div>
  )
}
