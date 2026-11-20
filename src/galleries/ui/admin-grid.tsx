'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import type { GallerySet } from '../types'
import { errorText, galleryAction } from './admin-api'

export type AdminPhoto = { key: string; set: string; name: string; thumb: string; w: number; h: number; favs: number }

/**
 * Every photo, set by set. Click to select (shift-click selects a run), then move the
 * selection to another set, make one the cover, or remove them.
 */
export function PhotoGrid({ id, sets, photos, coverKey, ro }: { id: string; sets: GallerySet[]; photos: AdminPhoto[]; coverKey?: string; ro: boolean }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const last = useRef<string | null>(null)

  const bySet = useMemo(() => sets.map((s) => ({ set: s, photos: photos.filter((p) => p.set === s._key) })), [sets, photos])
  // The on-screen order, for shift-click runs.
  const ordered = useMemo(() => bySet.flatMap((b) => b.photos.map((p) => p.key)), [bySet])
  const known = useMemo(() => new Set(photos.map((p) => p.key)), [photos])
  // Drop selections of photos that have gone (removed, or the page refreshed).
  const selected = [...sel].filter((k) => known.has(k))

  function click(key: string, e: React.MouseEvent) {
    if (ro) return
    const next = new Set(sel)
    if (e.shiftKey && last.current && last.current !== key) {
      const a = ordered.indexOf(last.current)
      const b = ordered.indexOf(key)
      if (a >= 0 && b >= 0) for (const k of ordered.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(k)
    } else if (next.has(key)) next.delete(key)
    else next.add(key)
    last.current = key
    setSel(next)
  }

  function toggleSet(keys: string[]) {
    const all = keys.every((k) => sel.has(k))
    const next = new Set(sel)
    for (const k of keys) (all ? next.delete(k) : next.add(k))
    setSel(next)
  }

  async function run(body: Record<string, unknown>, done: string, clear = true) {
    setBusy(true)
    setMsg('')
    const r = await galleryAction(id, body)
    setBusy(false)
    if (!r.ok) return setMsg(errorText(r))
    setMsg(done)
    if (clear) setSel(new Set())
    router.refresh()
  }

  const n = selected.length
  const words = (x: number) => `${x} ${x === 1 ? 'photo' : 'photos'}`

  function moveSel() {
    const to = target || sets[0]?._key
    const s = sets.find((x) => x._key === to)
    if (!s) return
    void run({ action: 'move', keys: selected, set: to }, `Moved ${words(n)} to “${s.title}”.`)
  }

  function removeSel() {
    if (!window.confirm(`Remove ${words(n)} from the gallery? Their files are deleted too, and this can’t be undone.`)) return
    void run({ action: 'remove-photos', keys: selected }, `Removed ${words(n)}.`)
  }

  if (!photos.length) {
    return (
      <section className="p-card" aria-labelledby="ga-grid-h">
        <h2 id="ga-grid-h" className="a-h2">Photos</h2>
        <p className="muted small a-empty">No photos yet. Add some with the uploader above.</p>
      </section>
    )
  }

  return (
    <section className="ga-grid-wrap" aria-labelledby="ga-grid-h">
      <div className="a-card-head">
        <h2 id="ga-grid-h" className="a-h2 a-h2-lg">Photos ({photos.length})</h2>
        {!ro && <span className="muted small">Click to select, shift-click to select a run.</span>}
      </div>
      {bySet.map(({ set, photos: list }) => (
        <div key={set._key} className="ga-set-block">
          <div className="ga-set-head">
            <h3 className="ga-h3">{set.title} <span className="muted">({list.length})</span></h3>
            {!ro && list.length > 0 && (
              <button type="button" className="linklike" onClick={() => toggleSet(list.map((p) => p.key))}>
                {list.every((p) => sel.has(p.key)) ? 'Clear this set' : 'Select all in set'}
              </button>
            )}
          </div>
          {list.length ? (
            <ul className="ga-grid">
              {list.map((p) => {
                const on = sel.has(p.key)
                return (
                  <li key={p.key}>
                    <button type="button" className={`ga-thumb ${on ? 'on' : ''}`} aria-pressed={ro ? undefined : on} onClick={(e) => click(p.key, e)} title={p.name}>
                      {p.thumb ? <img src={p.thumb} alt="" loading="lazy" decoding="async" width={p.w} height={p.h} /> : <span className="ga-thumb-missing">No preview</span>}
                      <span className="ga-thumb-name">{p.name}</span>
                      {p.key === coverKey && <span className="ga-badge ga-badge-cover">Cover</span>}
                      {p.favs > 0 && <span className="ga-badge ga-badge-fav" aria-label={`${p.favs} ${p.favs === 1 ? 'favourite' : 'favourites'}`}>♥ {p.favs}</span>}
                      {!ro && <span className="ga-tick" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Empty.</p>
          )}
        </div>
      ))}

      {!ro && n > 0 && (
        <div className="ga-selbar" role="region" aria-label="Selected photos">
          <strong className="ga-selbar-n">{words(n)} selected</strong>
          <span className="ga-selbar-move">
            <label className="sr-only" htmlFor="ga-move-to">Move to set</label>
            <select id="ga-move-to" className="input a-select" value={target || sets[0]?._key} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
              {sets.map((s) => (
                <option key={s._key} value={s._key}>{s.title}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={moveSel} disabled={busy}>Move</button>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => run({ action: 'update', coverKey: selected[0] }, 'Cover changed.')} disabled={busy || n !== 1} title={n === 1 ? undefined : 'Select one photo'}>Make cover</button>
          <button type="button" className="btn btn-secondary btn-sm ga-danger-btn" onClick={removeSel} disabled={busy}>Remove</button>
          <button type="button" className="linklike" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
  )
}
