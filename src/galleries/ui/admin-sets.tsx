'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { GallerySet } from '../types'
import { errorText, galleryAction } from './admin-api'

/**
 * The gallery's sets (Portraits, On site, …): add, rename, reorder, remove.
 * Every change sends the whole list; removing a set that has photos asks where they go first.
 */
export function SetsPanel({ id, sets, counts, ro }: { id: string; sets: GallerySet[]; counts: Record<string, number>; ro: boolean }) {
  const router = useRouter()
  const [names, setNames] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function send(next: { _key?: string; title: string }[], done: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    setMsg('')
    const r = await galleryAction(id, { action: 'sets', sets: next, ...extra })
    setBusy(false)
    if (!r.ok) {
      setMsg(errorText(r))
      return false
    }
    setMsg(done)
    setNames({})
    router.refresh()
    return true
  }

  const move = (i: number, by: -1 | 1) => {
    const next = [...sets]
    const [s] = next.splice(i, 1)
    next.splice(i + by, 0, s)
    void send(next, `Moved “${s.title}” ${by < 0 ? 'up' : 'down'}.`)
  }

  const rename = (s: GallerySet) => {
    const t = (names[s._key] ?? s.title).trim()
    if (!t || t === s.title) return
    void send(sets.map((x) => (x._key === s._key ? { ...x, title: t } : x)), `Renamed to “${t}”.`)
  }

  async function remove(s: GallerySet) {
    const n = counts[s._key] ?? 0
    const rest = sets.filter((x) => x._key !== s._key)
    if (n && !moveTo) return setMsg('Choose where its photos should go.')
    if (await send(rest, `Removed “${s.title}”${n ? ` and moved its ${n} ${n === 1 ? 'photo' : 'photos'}` : ''}.`, n ? { moveTo } : {})) {
      setRemoving(null)
      setMoveTo('')
    }
  }

  return (
    <section className="p-card ga-panel" aria-labelledby="ga-sets-h">
      <h2 id="ga-sets-h" className="a-h2">Sets</h2>
      <p className="muted small" style={{ margin: 0 }}>Groups of photos the client can flick between, in this order.</p>
      <ol className="ga-sets">
        {sets.map((s, i) => {
          const n = counts[s._key] ?? 0
          return (
            <li key={s._key} className="ga-set">
              <div className="ga-set-row">
                <label className="sr-only" htmlFor={`ga-set-${s._key}`}>Name of set {i + 1}</label>
                <input
                  id={`ga-set-${s._key}`}
                  className="input ga-set-name"
                  value={names[s._key] ?? s.title}
                  maxLength={80}
                  disabled={ro || busy}
                  onChange={(e) => setNames((m) => ({ ...m, [s._key]: e.target.value }))}
                  onBlur={() => rename(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      rename(s)
                    }
                  }}
                />
                <span className="muted small ga-set-count">{n}</span>
                {!ro && (
                  <span className="ga-set-tools">
                    <button type="button" className="ga-icon-btn" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move ${s.title} up`} title="Move up">↑</button>
                    <button type="button" className="ga-icon-btn" onClick={() => move(i, 1)} disabled={busy || i === sets.length - 1} aria-label={`Move ${s.title} down`} title="Move down">↓</button>
                    <button
                      type="button"
                      className="ga-icon-btn"
                      onClick={() => {
                        setRemoving(removing === s._key ? null : s._key)
                        setMoveTo(sets.find((x) => x._key !== s._key)?._key ?? '')
                      }}
                      disabled={busy || sets.length === 1}
                      aria-label={`Remove ${s.title}`}
                      aria-expanded={removing === s._key}
                      title={sets.length === 1 ? 'A gallery needs at least one set' : 'Remove'}
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              {removing === s._key && (
                <div className="ga-set-remove">
                  {n ? (
                    <>
                      <label className="small" htmlFor={`ga-mv-${s._key}`}>Move its {n} {n === 1 ? 'photo' : 'photos'} to</label>
                      <select id={`ga-mv-${s._key}`} className="input a-select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                        {sets
                          .filter((x) => x._key !== s._key)
                          .map((x) => (
                            <option key={x._key} value={x._key}>{x.title}</option>
                          ))}
                      </select>
                    </>
                  ) : (
                    <span className="small">It’s empty.</span>
                  )}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(s)} disabled={busy}>{n ? 'Move and remove' : 'Remove set'}</button>
                  <button type="button" className="linklike" onClick={() => setRemoving(null)}>Cancel</button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {!ro && (
        <form
          className="ga-copy-row"
          onSubmit={async (e) => {
            e.preventDefault()
            const t = adding.trim()
            if (!t) return
            if (await send([...sets, { title: t }], `Added “${t}”.`)) setAdding('')
          }}
        >
          <label className="sr-only" htmlFor="ga-set-new">New set name</label>
          <input id="ga-set-new" className="input" value={adding} maxLength={80} onChange={(e) => setAdding(e.target.value)} placeholder="New set, e.g. Details" disabled={busy || sets.length >= 50} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !adding.trim()}>Add set</button>
        </form>
      )}
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
  )
}
