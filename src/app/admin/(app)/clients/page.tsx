import { requireAdmin } from '@/admin/auth'
import Link from 'next/link'
import { listClients } from '@/admin/data'
import { ago, cad } from '@/admin/insights'
import { stageIndex } from '@/admin/stages'

export const metadata = { title: 'Clients' }

export default async function Clients() {
  await requireAdmin()
  const clients = await listClients()
  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Relationships</span>
          <h1 className="a-h1">Clients</h1>
        </div>
        <a className="btn btn-primary" href="/studio/portal/intent/create/template=client;type=client" target="_blank" rel="noopener noreferrer">
          New client<span className="sr-only"> (opens the Studio)</span>
        </a>
      </header>
      {clients.length ? (
        <section className="p-card" aria-label="All clients">
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Main contact</th>
                  <th scope="col" className="num">Active</th>
                  <th scope="col" className="num">Delivered</th>
                  <th scope="col" className="num">Invoiced</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const delivered = c.projects.filter((p) => stageIndex(p.pipelineStage) >= stageIndex('delivered')).length
                  const active = c.projects.filter((p) => stageIndex(p.pipelineStage) >= stageIndex('booked') && stageIndex(p.pipelineStage) < stageIndex('delivered')).length
                  const contact = c.contacts?.[0]
                  return (
                    <tr key={c._id}>
                      <td><Link className="a-strong-link" href={`/admin/clients/${c._id}`}>{c.organizationName}</Link></td>
                      <td>{contact ? contact.name : <span className="muted">—</span>}</td>
                      <td className="num">{active || '—'}</td>
                      <td className="num">{delivered || '—'}</td>
                      <td className="num">{c.billed ? cad(c.billed) : '—'}</td>
                      <td>{c.lastActivity ? ago(c.lastActivity) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="muted">No clients yet. Add one in the Studio and it shows up here.</p>
      )}
    </div>
  )
}
