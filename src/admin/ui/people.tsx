'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export type Person = {
  id: string
  name: string
  role?: string
  email?: string
  company: string
  clientId: string
  kind: 'client' | 'lead' | 'past' | 'contact'
  status: string
  projects: number
  /** ISO time of the client's latest activity, for sorting. */
  last?: string
  lastLabel?: string
}

const FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'client', label: 'Clients' },
  { key: 'lead', label: 'Open leads' },
  { key: 'past', label: 'Past' },
  { key: 'contact', label: 'No projects yet' },
] as const
const SORTS = [
  { key: 'name', label: 'A to Z' },
  { key: 'company', label: 'Company' },
  { key: 'recent', label: 'Latest activity' },
] as const

/** Everyone at every client in one table, with search, filters and sorting. */
export function PeopleTable({ people }: { people: Person[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('name')

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const list = people.filter((p) => (filter === 'all' || p.kind === filter) && words.every((w) => `${p.name} ${p.role ?? ''} ${p.email ?? ''} ${p.company}`.toLowerCase().includes(w)))
    const by = { name: (p: Person) => p.name.toLowerCase(), company: (p: Person) => `${p.company.toLowerCase()} ${p.name.toLowerCase()}` }
    return sort === 'recent' ? [...list].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '')) : [...list].sort((a, b) => by[sort](a).localeCompare(by[sort](b)))
  }, [people, q, filter, sort])

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="row-wrap">
        <input className="input pp-search" type="search" placeholder="Search name, email or company" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="a-switch" role="group" aria-label="Show">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? people.length : people.filter((p) => p.kind === f.key).length
            return <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} <span className="pp-n">{n}</span></button>
          })}
        </div>
      </div>
      <div className="row-wrap pp-bar">
        <span className="muted small" role="status">{rows.length} {rows.length === 1 ? 'person' : 'people'}</span>
        <div className="row-wrap small" style={{ gap: 'var(--space-2)' }}>
          <span className="muted">Sort</span>
          {SORTS.map((s) => <button key={s.key} type="button" className={`pp-sort${sort === s.key ? ' on' : ''}`} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>)}
        </div>
      </div>
      <div className="p-card pp-card">
        <div className="a-table-scroll">
          <table className="a-table pp-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Company</th>
                <th scope="col">Reach them</th>
                <th scope="col">Status</th>
                <th scope="col">Projects</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.role && <span className="pp-sub">{p.role}</span>}</td>
                  <td><Link className="a-strong-link" href={`/admin/clients/${p.clientId}`}>{p.company}</Link></td>
                  <td>{p.email ? <a className="text-link" href={`mailto:${p.email}`}>{p.email}</a> : <span className="muted">No email</span>}</td>
                  <td><span className={`pp-status k-${p.kind}`}>{p.status}</span></td>
                  <td>{p.projects}{p.lastLabel && <span className="pp-sub">Last activity {p.lastLabel}</span>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">Nobody matches.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
