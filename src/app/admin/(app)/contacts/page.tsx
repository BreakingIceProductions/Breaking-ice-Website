import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { listClients, type ClientSummary } from '@/admin/data'
import { isSalesStage } from '@/admin/lead'
import { getPeople } from '@/admin/people'
import { mergePeople, type BasePerson } from '@/admin/people-shared'
import { stageIndex, stageTitle } from '@/admin/stages'
import { PeopleTable } from '@/admin/ui/people'

export const metadata = { title: 'Clients' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Where a client stands, from its projects: an open job beats an open lead beats past work. */
function standing(c: ClientSummary): Pick<BasePerson, 'kind' | 'status'> {
  const booked = (stage: string) => stageIndex(stage) >= stageIndex('booked')
  const live = c.projects.filter((p) => !p.archived)
  const active = live.filter((p) => booked(p.pipelineStage) && stageIndex(p.pipelineStage) < stageIndex('paid')).sort((a, b) => stageIndex(a.pipelineStage) - stageIndex(b.pipelineStage))[0]
  if (active) return { kind: 'client', status: `Client · ${stageTitle(active.pipelineStage)}` }
  const lead = live.find((p) => !booked(p.pipelineStage))
  if (lead) return { kind: 'lead', status: `Open lead · ${stageTitle(lead.pipelineStage)}` }
  if (c.projects.length) return { kind: 'past', status: c.projects.some((p) => booked(p.pipelineStage)) ? 'Past client' : 'Past enquiry' }
  return { kind: 'client', status: 'Client · no projects yet' }
}

/** Everyone the clients and leads already hold: each client's contacts, and the person on a lead when they aren't one of those. */
function knownPeople(clients: ClientSummary[]): BasePerson[] {
  return clients.flatMap((c) => {
    const where = standing(c)
    const common = { company: c.organizationName, clientId: c._id, last: c.lastActivity }
    const contacts: BasePerson[] = (c.contacts ?? [])
      .filter((x) => x.name || x.email)
      .map((x) => ({ ...common, ...where, id: `c:${c._id}:${x._key}`, source: 'client', name: x.name || x.email, role: x.role, email: x.email, studioHref: `/studio/portal/structure/client;${encodeURIComponent(c._id)}` }))
    const onLeads: BasePerson[] = []
    for (const p of c.projects) {
      const l = p.office.lead
      if (!l?.name && !l?.email) continue
      const listed = l.email ? contacts.find((x) => x.email?.toLowerCase() === l.email!.toLowerCase()) : undefined
      if (listed) {
        listed.phone ??= l.phone
        continue
      }
      const open = isSalesStage(p.pipelineStage) && !p.archived
      onLeads.push({
        ...common,
        ...(open ? { kind: 'lead', status: `Open lead · ${stageTitle(p.pipelineStage)}` } : where),
        id: `l:${p._id}`,
        source: 'lead',
        name: l.name || l.email!,
        email: l.email,
        phone: l.phone,
        leadHref: isSalesStage(p.pipelineStage) ? `/admin/leads/${encodeURIComponent(p._id)}` : undefined,
      })
    }
    return [...contacts, ...onLeads]
  })
}

export default async function Contacts({ searchParams }: Props) {
  const admin = await requireAdmin()
  const [clients, store, sp] = await Promise.all([listClients(), getPeople(), searchParams])
  const base = knownPeople(clients)
  const people = mergePeople(base, store)
  const count = (k: BasePerson['kind']) => people.filter((p) => p.kind === k).length
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
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
        <div className="a-kpi"><span className="a-kpi-label">People</span><span className="a-kpi-num">{people.length}</span><span className="a-kpi-note">{clients.length} {clients.length === 1 ? 'company' : 'companies'}</span></div>
        <div className="a-kpi"><span className="a-kpi-label">Clients</span><span className="a-kpi-num">{count('client')}</span><span className="a-kpi-note">Working with now</span></div>
        <div className="a-kpi"><span className="a-kpi-label">Open leads</span><span className="a-kpi-num">{count('lead')}</span><span className="a-kpi-note">Not booked yet</span></div>
        <div className="a-kpi"><span className="a-kpi-label">Contacts only</span><span className="a-kpi-num">{count('contact')}</span><span className="a-kpi-note">No portal, no emails</span></div>
      </section>

      <PeopleTable base={base} store={store} canEdit={!admin.viewOnly} initial={{ show: one(sp.show), tags: [sp.tag ?? []].flat().slice(0, 20), person: one(sp.person) }} />
    </div>
  )
}
