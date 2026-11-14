'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { BoardCard } from '../board-data'
import { StageControl } from './stage-control'
import { StageDialog, type Stage } from './stage-dialog'

type Column = Stage & { hint: string; /** Fold the column down to a header until it's opened. */ quiet?: boolean }

const money = (n?: number) => (n ? `$${Math.round(n).toLocaleString('en-CA')}` : 'No quote total')
const inStage = (d: number | null) => (d == null ? '' : d === 0 ? 'Today in stage' : `${d} day${d === 1 ? '' : 's'} in stage`)

/**
 * Projects as cards in stage columns. Drag a card to another column (or use its
 * Move menu) and the usual preview opens before anything runs. Click a card for
 * its checklist, money and links.
 */
export function Board({ columns, cards, stages, empty, perRow, archive }: { columns: Column[]; cards: BoardCard[]; stages: Stage[]; empty: string; /** The archive bar. Dropping a card on it files the project away. */ archive?: React.ReactNode; /** Wrap the columns onto rows of this many, instead of one long row. */ perRow?: number }) {
  const router = useRouter()
  const [over, setOver] = useState<string | null>(null)
  const [move, setMove] = useState<{ card: BoardCard; to: Stage } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'money' | 'links'>('overview')
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState<string[]>([])
  const dragId = useRef<string | null>(null)
  const [filing, setFiling] = useState<BoardCard | null>(null)
  const [busy, setBusy] = useState(false)
  const fileDialog = useRef<HTMLDialogElement>(null)
  const dirty = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const openCard = cards.find((c) => c.id === openId) ?? null

  useEffect(() => {
    const d = dialog.current
    if (openCard && d && !d.open) d.showModal()
  }, [openCard])
  // Fresh data from the server replaces what was ticked locally.
  useEffect(() => setTicks({}), [cards])

  const isDone = (c: BoardCard, key: string, saved: boolean) => ticks[`${c.id}|${key}`] ?? saved
  const progress = (c: BoardCard) => c.checks.filter((k) => isDone(c, k.key, k.done)).length
  const nextOf = (c: BoardCard) => c.checks.find((k) => !isDone(c, k.key, k.done))?.label ?? c.ready

  async function tick(c: BoardCard, key: string, done: boolean) {
    const id = `${c.id}|${key}`
    setTicks((t) => ({ ...t, [id]: done }))
    const r = await fetch('/api/admin/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: c.id, key, done }) }).catch(() => null)
    if (r?.ok) dirty.current = true
    else {
      setTicks((t) => ({ ...t, [id]: !done }))
      alert(r?.status === 401 ? 'This sign-in can’t change things, or it has expired.' : 'That didn’t save. Reload the page and try again.')
    }
  }

  function drop(e: React.DragEvent, col: Column) {
    e.preventDefault()
    setOver(null)
    const card = cards.find((c) => c.id === dragId.current)
    dragId.current = null
    if (card && card.stage !== col.value) setMove({ card, to: { title: col.title, value: col.value } })
  }

  useEffect(() => {
    const d = fileDialog.current
    if (filing && d && !d.open) d.showModal()
  }, [filing])

  function dropOnArchive(e: React.DragEvent) {
    e.preventDefault()
    setOver(null)
    const card = cards.find((c) => c.id === dragId.current)
    dragId.current = null
    if (card) setFiling(card)
  }

  // Archiving only files the project away; no stage steps run, and it can be unarchived from the bar.
  async function file(change: { archived: true } | { declined: true }) {
    if (!filing) return
    setBusy(true)
    const r = await fetch('/api/admin/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: filing.id, ...change }) }).catch(() => null)
    setBusy(false)
    if (!r?.ok) return alert(r?.status === 401 ? 'This sign-in can’t change things, or it has expired.' : 'That didn’t save. Reload the page and try again.')
    fileDialog.current?.close()
    router.refresh()
  }

  function open(c: BoardCard) {
    setTab('overview')
    setOpenId(c.id)
  }

  return (
    <>
      <div className="bd-scroll">
        <div className={`bd${perRow ? ' bd-rows' : ''}`} style={{ gridTemplateColumns: perRow ? `repeat(${perRow}, minmax(220px, 1fr))` : columns.map((c) => (c.quiet && !shown.includes(c.value) ? 'minmax(132px, .5fr)' : 'minmax(204px, 1fr)')).join(' ') }}>
          {columns.map((col) => {
            const list = cards.filter((c) => c.stage === col.value)
            const folded = Boolean(col.quiet) && !shown.includes(col.value)
            return (
              <section key={col.value} className={`bd-col${over === col.value ? ' is-over' : ''}`} aria-label={`${col.title}, ${list.length}`}
                onDragOver={(e) => { e.preventDefault(); setOver(col.value) }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }} onDrop={(e) => drop(e, col)}>
                <header className="bd-col-head">
                  <h2 className="bd-col-title">{col.title}</h2>
                  <span className="bd-count">{list.length}</span>
                </header>
                <p className="bd-hint">{col.hint}</p>
                {folded ? (
                  list.length > 0 && <button type="button" className="linklike small" onClick={() => setShown((s) => [...s, col.value])}>Show {list.length}</button>
                ) : (
                  <ul className="bd-cards">
                    {list.map((c) => {
                      const done = progress(c)
                      return (
                        <li key={c.id} className={`bd-card${c.cold ? ' is-cold' : ''}`} draggable
                          onDragStart={(e) => { dragId.current = c.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
                          onDragEnd={() => { dragId.current = null; setOver(null) }}>
                          <button type="button" className="bd-open" onClick={() => open(c)}>
                            <span className="a-client">{c.client}</span>
                            <strong className="bd-title">{c.title}</strong>
                            <span className="bd-amount">{money(c.amount)}</span>
                            <span className="bd-meta"><span>{c.checks.length ? `${done} of ${c.checks.length} done` : ''}</span><span>{inStage(c.days)}</span></span>
                            {c.checks.length > 0 && (
                              <span className="bd-bar" aria-hidden="true">{c.checks.map((k) => <i key={k.key} className={isDone(c, k.key, k.done) ? 'on' : ''} />)}</span>
                            )}
                            {c.cold && <span className="bd-flag">Going cold</span>}
                          </button>
                          <div className="bd-foot">
                            <span className="bd-next">Next: {nextOf(c)}</span>
                            <label className="bd-move">
                              <span className="sr-only">Move {c.title} to another stage</span>
                              <select value="" onChange={(e) => { const s = stages.find((x) => x.value === e.target.value); if (s) setMove({ card: c, to: s }) }}>
                                <option value="" disabled>Move</option>
                                {stages.filter((s) => s.value !== c.stage).map((s) => <option key={s.value} value={s.value}>{s.title}</option>)}
                              </select>
                            </label>
                          </div>
                        </li>
                      )
                    })}
                    {!list.length && <li className="bd-empty">{empty}</li>}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {archive && (
        <div className={`bd-archive${over === '__archive' ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver('__archive') }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }} onDrop={dropOnArchive}>
          {archive}
          <p className="bd-archive-hint">Drag a card here to archive it</p>
        </div>
      )}

      <dialog ref={fileDialog} className="a-dialog" aria-labelledby="file-h" onClose={() => setFiling(null)}>
        {filing && (
          <div className="a-dialog-body">
            <span className="eyebrow">Archive</span>
            <h2 id="file-h" className="a-h2 a-h2-lg">Archive {filing.title}?</h2>
            <p className="small" style={{ margin: 0 }}>It leaves the board and stops counting in your pipeline and reminders. Nothing is sent to the client, and you can bring it back from the Archive bar.</p>
            <div className="btn-row a-dialog-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => fileDialog.current?.close()}>Cancel</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => file({ declined: true })}>Declined</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => file({ archived: true })}>Completed</button>
            </div>
          </div>
        )}
      </dialog>

      <StageDialog projectId={move?.card.id ?? ''} projectTitle={move?.card.title ?? ''} target={move?.to ?? null} onClose={() => setMove(null)} />

      <dialog ref={dialog} className="a-dialog bd-dialog" aria-labelledby="bd-h" onClose={() => { setOpenId(null); if (dirty.current) { dirty.current = false; router.refresh() } }}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
        {openCard && (() => {
          const c = openCard
          const si = stages.findIndex((s) => s.value === c.stage)
          const done = progress(c)
          return (
            <div className="bd-pop">
              <header className="bd-pop-head">
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  <span className="a-client">{c.clientId ? <Link className="text-link-plain" href={`/admin/clients/${c.clientId}`}>{c.client}</Link> : c.client}</span>
                  <h2 id="bd-h" className="a-h2 a-h2-lg">{c.title}</h2>
                  <div className="row-wrap a-chips">
                    {c.type && <span className="a-chip">{c.type}</span>}
                    {c.region && <span className="a-chip">{c.region}</span>}
                    {c.nextDate && <span className="a-chip">{c.nextDate}</span>}
                  </div>
                </div>
                <button type="button" className="pb-x" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
              </header>

              <ol className="bd-steps" aria-label={`Stage: ${stages[si]?.title}`}>
                {stages.map((s, i) => (
                  <li key={s.value} className={i < si ? 'done' : i === si ? 'current' : ''} aria-current={i === si ? 'step' : undefined}>
                    <span className="bar" aria-hidden="true" /><span className="name">{s.title}</span>
                  </li>
                ))}
              </ol>

              <div className="bd-nextup">
                <div className="stack" style={{ gap: 2 }}>
                  <span className="eyebrow">Next up</span>
                  <strong>{nextOf(c)}</strong>
                  <span className="small muted">{c.checks.length ? `${done} of ${c.checks.length} done in ${stages[si]?.title}` : inStage(c.days)}</span>
                </div>
                <Link className="btn btn-primary btn-sm" href={`/admin/projects/${c.id}`}>Open the full page</Link>
              </div>

              <div className="bd-tabs" role="tablist" aria-label="Project sections">
                {([['overview', 'Overview'], ['money', 'Money'], ['links', 'Portal and files']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
                ))}
              </div>

              <div className="bd-pane" role="tabpanel">
                {tab === 'overview' && (
                  <div className="bd-two">
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="a-round-label">Left in {stages[si]?.title}</span>
                      {c.checks.map((k) => (
                        <label key={k.key} className="a-plan-item">
                          <input type="checkbox" checked={isDone(c, k.key, k.done)} onChange={(e) => tick(c, k.key, e.target.checked)} />
                          <span>{k.label}</span>
                        </label>
                      ))}
                      {!c.checks.length && <p className="muted small" style={{ margin: 0 }}>Nothing on the list for this stage.</p>}
                    </div>
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="a-round-label">Dates</span>
                      {c.dates.length ? (
                        <dl className="key-dates">{c.dates.map((d) => <div key={d.label + d.date}><dt className={d.past ? 'past' : ''}>{d.label}</dt><dd className={d.past ? 'past' : ''}>{d.date}</dd></div>)}</dl>
                      ) : <p className="muted small" style={{ margin: 0 }}>No dates set yet.</p>}
                      {c.notes.length > 0 && <span className="a-round-label" style={{ marginTop: 'var(--space-3)' }}>Latest notes</span>}
                      {c.notes.map((n, i) => <p key={i} className="small" style={{ margin: 0 }}><span className="muted">{n.at}</span> {n.text}</p>)}
                    </div>
                  </div>
                )}
                {tab === 'money' && (
                  <dl className="key-dates">
                    <div><dt>Quote total</dt><dd>{c.amount ? money(c.amount) : 'Not set'}</dd></div>
                    <div><dt>Deposit</dt><dd>{c.deposit ? money(c.deposit) : 'Not set'}</dd></div>
                    <div><dt>Quote</dt><dd>{c.quote ?? 'None yet'}</dd></div>
                    {c.invoices.map((i, n) => <div key={n}><dt>{i.label}</dt><dd>{money(i.amount)} · {i.status.replace('_', ' ')}</dd></div>)}
                    {!c.invoices.length && <div><dt>Invoices</dt><dd>None yet</dd></div>}
                  </dl>
                )}
                {tab === 'links' && (
                  <ul className="a-links">
                    {c.links.map((l) => (
                      <li key={l.href}><a href={l.href} target="_blank" rel="noopener noreferrer"><strong>{l.label}</strong><span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></li>
                    ))}
                  </ul>
                )}
              </div>

              <footer className="bd-pop-foot">
                <span className="small muted">Moving or archiving shows a preview first.</span>
                <StageControl compact projectId={c.id} projectTitle={c.title} current={c.stage} stages={stages} />
              </footer>
            </div>
          )
        })()}
      </dialog>
    </>
  )
}
