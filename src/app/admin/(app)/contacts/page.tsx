import '../../../css/admin-pages.css'
import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { listClients, type ClientSummary } from '@/admin/data'
import { isSalesStage } from '@/admin/lead'
import { getPeople } from '@/admin/people'
import { mergePeople, type BasePerson } from '@/admin/people-shared'
import { stageIndex, stageTitle } from '@/admin/stages'
import { PeopleTable } from '@/admin/ui/people'

export const metadata = { title: 'People' }

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
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack ap-head-text">
          <h1 className="a-h1">People</h1>
          <p className="muted m0">Everyone we work with: client contacts and the people on leads. {people.length} {people.length === 1 ? 'person' : 'people'} at {clients.length} {clients.length === 1 ? 'company' : 'companies'}.</p>
        </div>
        <div className="btn-row">
          <Link className="text-link" href="/admin/clients">Files by client</Link>
          <Link className="btn btn-secondary" href="/admin/clients/new?from=people">New client</Link>
        </div>
      </header>


      <PeopleTable base={base} store={store} canEdit={!admin.viewOnly} initial={{ show: one(sp.show), tags: [sp.tag ?? []].flat().slice(0, 20), person: one(sp.person) }} />
    </div>
  )
}
