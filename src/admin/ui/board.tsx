'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { BoardCard } from '../board-data'
import { InlineError, saveFailed, useNotify } from './confirm'
import { Segments } from './graphics'
import { StageControl } from './stage-control'
import { StageDialog, type Stage } from './stage-dialog'
import { DaysChip } from './viz-c'

type Column = Stage & { hint: string; /** Fold the column down to a header until it's opened. */ quiet?: boolean; /** Columns sharing a group sit together, with a divider and a jump button per group. */ group?: string }

const total = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
const money = (n?: number) => (n ? `$${Math.round(n).toLocaleString('en-CA')}` : 'No quote total')
const inStage = (d: number | null) => (d == null ? '' : d === 0 ? 'Today in stage' : `${d} day${d === 1 ? '' : 's'} in stage`)

/**
 * Projects as cards in stage columns. Drag a card to another column (or open it and use
 * its stage menu) and the usual preview opens before anything runs; on Confirm the card moves
 * to its new column at once and goes back if the move fails. Click a card for its checklist,
 * money and links. The columns sit in one row that scrolls sideways.
 */
export function Board({ columns, cards, stages, empty, archive }: { columns: Column[]; cards: BoardCard[]; stages: Stage[]; empty: string; /** The archive bar. Dropping a card on it files the project away. */ archive?: React.ReactNode }) {
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
  const [fileError, setFileError] = useState('')
  const notify = useNotify()
  const fileDialog = useRef<HTMLDialogElement>(null)
  const dirty = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const groups = columns.filter((c, i) => c.group && c.group !== columns[i - 1]?.group).map((c) => ({ title: c.group!, first: c.value }))
  const openCard = cards.find((c) => c.id === openId) ?? null

  useEffect(() => {
    const d = dialog.current
    if (openCard && d && !d.open) d.showModal()
  }, [openCard])
  // A card being moved sits in its new column as soon as you confirm; it goes back if the move fails.
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [moving, setMoving] = useState<string | null>(null)
  const stageOf = (c: BoardCard) => placed[c.id] ?? c.stage
  // Fresh data from the server replaces what was ticked or moved locally.
  useEffect(() => { setTicks({}); setPlaced({}) }, [cards])

  // After a move's dialog closes, focus follows the card to its new column. The card re-renders there (and again
  // when fresh data arrives), so this tries again for a few seconds whenever focus has fallen back to the page.
  // If the card has left the board (archived, or into a folded column), focus goes to the next card in its old
  // column, or that column's heading.
  const refocus = useRef<{ id: string; from: string; until: number } | null>(null)
  const focusMoved = () => {
    const p = refocus.current
    if (!p) return
    if (Date.now() > p.until) return void (refocus.current = null)
    const a = document.activeElement
    if (a && a !== document.body && a.isConnected) return
    const box = scroller.current
    const col = box?.querySelector(`[data-stage="${CSS.escape(p.from)}"]`)
    const el = box?.querySelector<HTMLElement>(`[data-card="${CSS.escape(p.id)}"] .bd-open`) ?? col?.querySelector<HTMLElement>('.bd-open') ?? col?.querySelector<HTMLElement>('.bd-col-title')
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  useEffect(focusMoved)

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
      notify({ text: `“${c.checks.find((k) => k.key === key)?.label ?? 'That step'}” ${done ? 'wasn’t ticked' : 'wasn’t unticked'}. ${saveFailed(r?.status)}`, tone: 'error', retry: () => tick(c, key, done) })
    }
  }

  function drop(e: React.DragEvent, col: Column) {
    e.preventDefault()
    setOver(null)
    const card = cards.find((c) => c.id === dragId.current)
    dragId.current = null
    if (card && stageOf(card) !== col.value) setMove({ card, to: { title: col.title, value: col.value } })
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
    setFileError('')
    const r = await fetch('/api/admin/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: filing.id, ...change }) }).catch(() => null)
    setBusy(false)
    if (!r?.ok) return setFileError(`${filing.title} wasn’t archived. ${saveFailed(r?.status)}`)
    fileDialog.current?.close()
    router.refresh()
  }

  /** Scrolls the board so a group's first column sits at the left edge. */
  function jump(first: string) {
    const box = scroller.current
    const col = box?.querySelector<HTMLElement>(`[data-stage="${first}"]`)
    if (!box || !col) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ left: col.offsetLeft, behavior: calm ? 'auto' : 'smooth' })
  }

  function open(c: BoardCard) {
    setTab('overview')
    setOpenId(c.id)
  }

  return (
    <>
      {groups.length > 1 && (
        <div className="bd-jump">
          <div className="a-switch" role="group" aria-label="Jump to">
            {groups.map((g) => <button key={g.first} type="button" onClick={() => jump(g.first)}>{g.title}</button>)}
          </div>
        </div>
      )}
      <div className="bd-scroll" ref={scroller} tabIndex={0} role="group" aria-label="Board, scrolls sideways">
        <div className="bd">
          {columns.map((col, ci) => {
            const list = cards.filter((c) => stageOf(c) === col.value)
            const folded = Boolean(col.quiet) && !shown.includes(col.value)
            const worth = list.reduce((n, c) => n + (c.amount ?? 0), 0)
            const starts = Boolean(col.group) && ci > 0 && col.group !== columns[ci - 1].group
            return (
              <section key={col.value} data-stage={col.value} className={`bd-col${folded ? ' is-folded' : ''}${starts ? ' bd-col-starts' : ''}${over === col.value ? ' is-over' : ''}`} aria-label={`${col.group ? `${col.group}: ` : ''}${col.title}, ${list.length}`}
                onDragOver={(e) => { e.preventDefault(); setOver(col.value) }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }} onDrop={(e) => drop(e, col)}>
                <header className="bd-col-head" title={col.hint}>
                  <h2 className="bd-col-title" tabIndex={-1}>{col.title}</h2>
                  <span className="bd-count">{list.length}</span>
                </header>
                {worth > 0 && <p className="bd-sum">{total(worth)}</p>}
                {folded ? (
                  list.length > 0 && <button type="button" className="linklike small" onClick={() => setShown((s) => [...s, col.value])}>Show {list.length}</button>
                ) : (
                  <ul className="bd-cards">
                    {list.map((c) => {
                      const done = progress(c)
                      const onward = done === c.checks.length && !placed[c.id] ? stages[stages.findIndex((s) => s.value === c.stage) + 1] : undefined
                      return (
                        <li key={c.id} data-card={c.id} className={`bd-card${c.cold ? ' is-cold' : ''}${placed[c.id] ? ' is-placed' : ''}`} aria-busy={placed[c.id] && moving === c.id ? true : undefined} draggable
                          onDragStart={(e) => { dragId.current = c.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
                          onDragEnd={() => { dragId.current = null; setOver(null) }}>
                          {/* Client, title, money, then progress and age as small marks. The next step is on hover and in the card's window. */}
                          <button type="button" className="bd-open sc-card-open" title={`Next: ${nextOf(c)}`} onClick={() => open(c)}>
                            <span className="a-client">{c.client}</span>
                            <strong className="bd-title">{c.title}</strong>
                            {(c.amount || c.budget) && <span className="bd-amount">{!c.amount && c.budget ? <><span className="sr-only">Budget </span>{c.budget}</> : money(c.amount)}</span>}
                            <span className="sc-card-marks">
                              {c.checks.length > 0 ? <Segments total={c.checks.length} done={done} label={`${done} of ${c.checks.length} done`} /> : <span />}
                              <DaysChip days={c.days} cold={c.cold} />
                            </span>
                          </button>
                          {onward && (
                            <div className="bd-foot sc-card-foot">
                              <button type="button" className="bd-on" onClick={() => setMove({ card: c, to: onward })}>Move on<span className="sr-only"> to {onward.title}</span></button>
                            </div>
                          )}
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
        </div>
      )}

      <dialog ref={fileDialog} className="a-dialog" aria-labelledby="file-h" onClose={(e) => { if (e.target !== e.currentTarget) return; setFiling(null); setFileError('') }}>
        {filing && (
          <div className="a-dialog-body">
            <span className="eyebrow">Archive</span>
            <h2 id="file-h" className="a-h2 a-h2-lg">Archive {filing.title}?</h2>
            <p className="small m0">It leaves the board and stops counting in your pipeline and reminders. Nothing is sent to the client, and you can bring it back from the Archive bar.</p>
            {fileError && <InlineError>{fileError} Pick Completed or Declined again.</InlineError>}
            <div className="btn-row a-dialog-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => fileDialog.current?.close()}>Cancel</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => file({ declined: true })}>Declined</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => file({ archived: true })}>Completed</button>
            </div>
          </div>
        )}
      </dialog>

      <StageDialog projectId={move?.card.id ?? ''} projectTitle={move?.card.title ?? ''} target={move?.to ?? null}
        onClose={() => {
          if (move) {
            refocus.current = { id: move.card.id, from: move.card.stage, until: Date.now() + 5000 }
            requestAnimationFrame(() => requestAnimationFrame(focusMoved))
          }
          setMove(null)
        }}
        onRun={(phase) => {
          if (!move) return
          const { card, to } = move
          if (phase === 'start') { setMoving(card.id); setPlaced((p) => ({ ...p, [card.id]: to.value })) }
          else { setMoving(null); if (phase === 'failed') setPlaced((p) => { const n = { ...p }; delete n[card.id]; return n }) }
        }}
        returnTo={() => (move ? document.querySelector<HTMLElement>(`[data-card="${CSS.escape(move.card.id)}"] .bd-open`) : null)} />

      <dialog ref={dialog} className="a-dialog bd-dialog" aria-labelledby="bd-h" onClose={(e) => { if (e.target !== e.currentTarget) return; setOpenId(null); if (dirty.current) { dirty.current = false; router.refresh() } }}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
        {openCard && (() => {
          const c = openCard
          const si = stages.findIndex((s) => s.value === c.stage)
          const done = progress(c)
          return (
            <div className="bd-pop">
              <header className="bd-pop-head">
                <div className="stack gap-6px min0">
                  <span className="a-client">{c.clientId ? <Link className="text-link-plain" href={`/admin/clients/${c.clientId}`}>{c.client}</Link> : c.client}</span>
                  <h2 id="bd-h" className="a-h2 a-h2-lg"><Link className="text-link-plain" href={c.href}>{c.title}</Link></h2>
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
                <div className="stack gap-2px">
                  <span className="eyebrow">Next up</span>
                  <strong>{nextOf(c)}</strong>
                  <span className="small muted">{c.checks.length ? `${done} of ${c.checks.length} done in ${stages[si]?.title}` : inStage(c.days)}</span>
                </div>
                <div className="btn-row">
                  <Link className="btn btn-secondary btn-sm" href={`${c.href}?email=1`}>Email<span className="sr-only"> about {c.title}</span></Link>
                  <Link className="btn btn-primary btn-sm" href={c.href.startsWith('/admin/projects/') && tab !== 'overview' ? `${c.href}?tab=${tab === 'money' ? 'money' : 'portal'}` : c.href}>Open the full page</Link>
                </div>
              </div>

              <div className="bd-tabs" role="tablist" aria-label="Project sections">
                {([['overview', 'Overview'], ['money', 'Money'], ['links', 'Portal and files']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
                ))}
              </div>

              <div className="bd-pane" role="tabpanel">
                {tab === 'overview' && (
                  <div className="bd-two">
                    <div className="stack gap-2">
                      <span className="a-round-label">Left in {stages[si]?.title}</span>
                      {c.checks.map((k) => (
                        <label key={k.key} className="a-plan-item">
                          <input type="checkbox" checked={isDone(c, k.key, k.done)} onChange={(e) => tick(c, k.key, e.target.checked)} />
                          <span>{k.label}</span>
                        </label>
                      ))}
                      {!c.checks.length && <p className="muted small m0">Nothing on the list for this stage.</p>}
                    </div>
                    <div className="stack gap-2">
                      <span className="a-round-label">Dates</span>
                      {c.dates.length ? (
                        <dl className="key-dates">{c.dates.map((d) => <div key={d.label + d.date}><dt className={d.past ? 'past' : ''}>{d.label}</dt><dd className={d.past ? 'past' : ''}>{d.date}</dd></div>)}</dl>
                      ) : <p className="muted small m0">No dates set yet.</p>}
                      {c.notes.length > 0 && <span className="a-round-label mt-3">Latest notes</span>}
                      {c.notes.map((n, i) => <p key={i} className="small m0"><span className="muted">{n.at}</span> {n.text}</p>)}
                    </div>
                  </div>
                )}
                {tab === 'money' && (
                  <dl className="key-dates">
                    <div><dt>Quote total</dt><dd>{c.amount ? money(c.amount) : 'Not set'}</dd></div>
                    {c.budget && <div><dt>Budget they gave</dt><dd>{c.budget}</dd></div>}
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
                <StageControl compact projectId={c.id} projectTitle={c.title} current={c.stage} stages={stages}
                  onRun={(to, phase) => {
                    if (phase === 'start') { setMoving(c.id); setPlaced((p) => ({ ...p, [c.id]: to.value })) }
                    else { setMoving(null); if (phase === 'failed') setPlaced((p) => { const n = { ...p }; delete n[c.id]; return n }) }
                  }} />
              </footer>
            </div>
          )
        })()}
      </dialog>
    </>
  )
}
