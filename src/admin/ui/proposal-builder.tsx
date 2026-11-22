'use client'

import { useEffect, useRef, useState } from 'react'
import { useConfirm } from './confirm'

/**
 * Prototype: three packages built by dragging deliverables into them.
 * Everything lives in this browser (localStorage); nothing is saved or sent.
 */

type Item = { id: string; name: string; price: number | null; why: string }
type Pack = { name: string; blurb: string; ids: string[]; adjust: number | null; why: string }
type State = { client: string; title: string; transcript: string; gst: boolean; deposit: number; items: Item[]; packs: Pack[] }
type Drag = { id: string; from: number | 'list' }

const KEY = 'bi-proposal-builder-v1'
const GST = 0.05
const uid = () => Math.random().toString(36).slice(2, 9)
const cad = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))

const START: State = {
  client: '',
  title: '',
  transcript: '',
  gst: true,
  deposit: 30,
  items: ['Discovery call and story outline', 'One shoot day', 'Main film, 2 to 3 minutes', 'Social cutdowns', 'Photo set'].map((name) => ({ id: uid(), name, price: null, why: '' })),
  packs: [
    { name: 'Package 1', blurb: '', ids: [], adjust: null, why: '' },
    { name: 'Package 2', blurb: '', ids: [], adjust: null, why: '' },
    { name: 'Package 3', blurb: '', ids: [], adjust: null, why: '' },
  ],
}

export function ProposalBuilder() {
  const [s, setS] = useState<State>(START)
  const [ready, setReady] = useState(false)
  const confirm = useConfirm()
  const [over, setOver] = useState<string | null>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved) setS({ ...START, ...JSON.parse(saved) })
    } catch {}
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
  }, [s, ready])

  const item = (id: string) => s.items.find((i) => i.id === id)
  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }))
  const setItem = (id: string, patch: Partial<Item>) => setS((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const setPack = (n: number, patch: Partial<Pack>) => setS((p) => ({ ...p, packs: p.packs.map((k, i) => (i === n ? { ...k, ...patch } : k)) }))

  /** Puts a deliverable in a package, before `beforeId` when given. Coming from another package moves it. */
  function place(to: number, id: string, from: Drag['from'], beforeId?: string) {
    setS((p) => ({
      ...p,
      packs: p.packs.map((k, i) => {
        let ids = k.ids
        if (i === from && from !== to) ids = ids.filter((x) => x !== id)
        if (i === to) {
          ids = ids.filter((x) => x !== id)
          const at = beforeId && beforeId !== id ? ids.indexOf(beforeId) : -1
          ids = at < 0 ? [...ids, id] : [...ids.slice(0, at), id, ...ids.slice(at)]
        }
        return ids === k.ids ? k : { ...k, ids }
      }),
    }))
  }
  const take = (n: number, id: string) => setPack(n, { ids: s.packs[n].ids.filter((x) => x !== id) })
  function removeItem(id: string) {
    setS((p) => ({ ...p, items: p.items.filter((i) => i.id !== id), packs: p.packs.map((k) => ({ ...k, ids: k.ids.filter((x) => x !== id) })) }))
  }
  function drop(e: React.DragEvent, to: number, beforeId?: string) {
    e.preventDefault()
    e.stopPropagation()
    const d = drag.current
    if (d) place(to, d.id, d.from, beforeId)
    drag.current = null
    setOver(null)
  }
  const dragProps = (d: Drag) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      drag.current = d
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', d.id)
      // Dragging by the handle still shows the whole card under the cursor.
      const card = (e.currentTarget as HTMLElement).closest('li')
      if (card && card !== e.currentTarget) e.dataTransfer.setDragImage(card, 12, 12)
    },
    onDragEnd: () => { drag.current = null; setOver(null) },
  })

  const sums = s.packs.map((k) => {
    const items = k.ids.reduce((t, id) => t + (item(id)?.price ?? 0), 0)
    const price = Math.max(0, items + (k.adjust ?? 0))
    const tax = s.gst ? price * GST : 0
    return { items, price, tax, total: price + tax, deposit: (price + tax) * (s.deposit / 100), unpriced: k.ids.filter((id) => item(id)?.price == null).length }
  })
  const used = new Set(s.packs.flatMap((k) => k.ids))

  return (
    <div className="pb">
      <section className="p-card pb-details" aria-label="Proposal details">
        <div className="field"><label htmlFor="pb-client">Client</label><input id="pb-client" className="input" value={s.client} onChange={(e) => set({ client: e.target.value })} /></div>
        <div className="field"><label htmlFor="pb-title">Project</label><input id="pb-title" className="input" value={s.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="field pb-narrow"><label htmlFor="pb-dep">Deposit %</label><input id="pb-dep" className="input" inputMode="numeric" value={s.deposit} onChange={(e) => set({ deposit: Math.min(100, Math.max(0, num(e.target.value) ?? 0)) })} /></div>
        <label className="a-check pb-gst"><input type="checkbox" checked={s.gst} onChange={(e) => set({ gst: e.target.checked })} /> Charge GST (5%)</label>
      </section>

      <section className="p-card" aria-labelledby="pb-h-items">
        <div className="a-card-head">
          <h2 id="pb-h-items" className="a-h2">Deliverables</h2>
          <span className="muted small">{s.items.length}</span>
        </div>
        <ul className="pb-list">
          {s.items.map((i) => (
            <li key={i.id} className={`pb-item${used.has(i.id) ? '' : ' is-unused'}`}>
              <span className="pb-grip pb-handle" title="Drag into a package" aria-hidden="true" {...dragProps({ id: i.id, from: 'list' })} />
              <div className="pb-item-body">
                <div className="pb-item-row">
                  <input className="pb-in pb-in-name" aria-label="Deliverable" value={i.name} onChange={(e) => setItem(i.id, { name: e.target.value })} />
                  <button type="button" className="pb-x" aria-label={`Delete ${i.name}`} onClick={() => removeItem(i.id)}>×</button>
                </div>
                <input className="pb-in pb-in-why" aria-label={`Reasoning for ${i.name}`} placeholder="Why this price (only you see this)" value={i.why} onChange={(e) => setItem(i.id, { why: e.target.value })} />
                <div className="pb-item-row pb-item-acts">
                  <span className="muted">Add to</span>
                  {s.packs.map((k, n) => (
                    <button key={n} type="button" className={`pb-add${k.ids.includes(i.id) ? ' on' : ''}`} aria-pressed={k.ids.includes(i.id)} aria-label={`${k.ids.includes(i.id) ? 'Remove from' : 'Add to'} ${k.name}`} onClick={() => (k.ids.includes(i.id) ? take(n, i.id) : place(n, i.id, 'list'))}>{n + 1}</button>
                  ))}
                  <span className="pb-money pb-del"><span aria-hidden="true">$</span><input className="pb-in pb-in-num" aria-label={`Price of ${i.name}`} inputMode="decimal" placeholder="0" value={i.price ?? ''} onChange={(e) => setItem(i.id, { price: num(e.target.value) })} /></span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ items: [...s.items, { id: uid(), name: 'New deliverable', price: null, why: '' }] })}>Add a deliverable</button>
      </section>

    <div className="pb-packs">
      {s.packs.map((k, n) => {
        const t = sums[n]
        return (
          <section key={n} className={`p-card pb-pack${over === `p${n}` ? ' is-over' : ''}`} aria-label={k.name}
            onDragOver={(e) => { e.preventDefault(); setOver(`p${n}`) }} onDrop={(e) => drop(e, n)}>
            <span className="eyebrow">Package {n + 1}</span>
            <input className="pb-in pb-pack-name" aria-label={`Name of package ${n + 1}`} value={k.name} onChange={(e) => setPack(n, { name: e.target.value })} />
            <input className="pb-in" aria-label={`Short description of ${k.name}`} placeholder="Six words or fewer" value={k.blurb} onChange={(e) => setPack(n, { blurb: e.target.value })} />

            <ul className={`pb-drop${k.ids.length ? '' : ' sd-drop-empty'}`}>
              {k.ids.map((id) => {
                const i = item(id)
                if (!i) return null
                return (
                  <li key={id} className={`pb-chip${over === `${n}:${id}` ? ' is-before' : ''}`} {...dragProps({ id, from: n })}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(`${n}:${id}`) }} onDrop={(e) => drop(e, n, id)}>
                    <span className="pb-grip" aria-hidden="true" />
                    <span className="pb-chip-name">{i.name}</span>
                    <span className="pb-chip-price">{i.price == null ? 'No price' : cad(i.price)}</span>
                    <button type="button" className="pb-x" aria-label={`Remove ${i.name} from ${k.name}`} onClick={() => take(n, id)}>×</button>
                  </li>
                )
              })}
              {!k.ids.length && (
                <li className="pb-empty">
                  <span className="pb-on-mouse">Drag here</span><span className="pb-on-touch">Tap {n + 1} on a deliverable</span>
                  {n > 0 && s.packs[n - 1].ids.length > 0 && <button type="button" className="linklike small" onClick={() => setPack(n, { ids: [...new Set([...s.packs[n - 1].ids, ...k.ids])] })}>or include everything in {s.packs[n - 1].name}</button>}
                </li>
              )}
            </ul>
            {n > 0 && k.ids.length > 0 && <button type="button" className="linklike small" onClick={() => setPack(n, { ids: [...new Set([...s.packs[n - 1].ids, ...k.ids])] })}>Include everything in {s.packs[n - 1].name}</button>}

            <dl className="pb-math">
              <div><dt>Deliverables</dt><dd>{cad(t.items)}</dd></div>
              <div>
                <dt><label htmlFor={`pb-adj-${n}`}>Adjust</label></dt>
                <dd><span className="pb-money"><span aria-hidden="true">$</span><input id={`pb-adj-${n}`} className="pb-in pb-in-num" inputMode="decimal" placeholder="0" value={k.adjust ?? ''} onChange={(e) => setPack(n, { adjust: e.target.value.trim() === '-' ? null : num(e.target.value) })} /></span></dd>
              </div>
              <div className="pb-price"><dt>Package price</dt><dd key={t.price} className="pb-bump">{cad(t.price)}</dd></div>
              <div><dt>{s.gst ? 'GST (5%)' : 'GST'}</dt><dd>{s.gst ? cad(t.tax) : 'Not charged'}</dd></div>
              <div><dt>Total</dt><dd key={t.total} className="pb-bump">{cad(t.total)}</dd></div>
              <div><dt>Deposit ({s.deposit}%)</dt><dd>{cad(t.deposit)}</dd></div>
            </dl>
            {t.unpriced > 0 && <p className="a-warning pb-warn">{t.unpriced} {t.unpriced === 1 ? 'deliverable has' : 'deliverables have'} no price yet.</p>}
            <textarea className="input pb-why" aria-label={`Reasoning for ${k.name}`} placeholder="Reasoning: who this package is for and why it’s priced this way (only you see this)" value={k.why} onChange={(e) => setPack(n, { why: e.target.value })} />
          </section>
        )
      })}
    </div>

      <section className="p-card" aria-labelledby="pb-h-tr">
        <h2 id="pb-h-tr" className="a-h2">Client conversation</h2>
        <textarea className="input pb-transcript" aria-label="Transcript or notes" placeholder="Paste the transcript or your notes" value={s.transcript} onChange={(e) => set({ transcript: e.target.value })} />
      </section>

      <section className="p-card" aria-labelledby="pb-h-prev">
        <div className="a-card-head">
          <h2 id="pb-h-prev" className="a-h2" title="The Investment page of the PDF, before tax">What the client sees</h2>
        </div>
        {/* Printed only: names the quote at the top of the page (the heading above is for you, not the client). */}
        <p className="pb-print-title">{[s.client.trim(), s.title.trim()].filter(Boolean).join(' · ') || 'Quote'}</p>
        <div className="a-table-scroll">
          <table className="a-table pb-table">
            <thead>
              <tr>
                <th scope="col">{[s.client, s.title].filter(Boolean).join(' · ') || 'Deliverable'}</th>
                {s.packs.map((k, n) => <th key={n} scope="col" className="pb-col">{k.name}{k.blurb && <span className="pb-blurb">{k.blurb}</span>}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.items.filter((i) => used.has(i.id)).map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  {s.packs.map((k, n) => <td key={n} className="pb-col">{k.ids.includes(i.id) ? <span className="pb-tick" role="img" aria-label="Included" /> : <span className="muted" aria-label="Not included">–</span>}</td>)}
                </tr>
              ))}
              {!used.size && <tr><td colSpan={4} className="muted">Nothing in a package yet.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Investment</th>
                {sums.map((t, n) => <td key={`${n}-${t.price}`} className="pb-col pb-total pb-bump">{cad(t.price)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="row-wrap">
          <button type="button" className="linklike small" onClick={async () => { if (await confirm({ title: 'Start over?', body: 'This clears everything in the builder: details, deliverables and packages.', confirmLabel: 'Clear and start over', danger: true })) setS({ ...START, items: START.items.map((i) => ({ ...i })), packs: START.packs.map((k) => ({ ...k, ids: [] })) }) }}>Start over</button>
        </div>
      </section>
    </div>
  )
}
