'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type SearchItem = { group: 'Actions' | 'Go to' | 'Leads' | 'Projects' | 'Clients' | 'People'; label: string; sub?: string; href: string; external?: boolean }

const GROUPS: SearchItem['group'][] = ['Actions', 'Go to', 'Leads', 'Projects', 'Clients', 'People']
const OPEN_EVENT = 'bi-admin-search'

/** Opens the search pop-up from anywhere (the sidebar button, the phone top bar). */
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT))

/** The search button. `compact` is the icon-only version for the phone top bar. */
export function SearchButton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <button type="button" className="a-top-btn is-icon" onClick={openSearch} aria-label="Search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </button>
    )
  }
  return (
    <button type="button" className="a-search-btn" onClick={openSearch} title="Search (⌘K)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <span className="a-search-text">Search</span>
      <kbd aria-hidden="true">⌘K</kbd>
      <span className="sr-only">. Command K or Control K</span>
    </button>
  )
}

/**
 * The search pop-up, rendered once in the layout. Cmd+K or Ctrl+K opens it from anywhere in the back office.
 * The input is a combobox; results are a listbox, and the highlighted one is read out through aria-activedescendant.
 */
export function AdminSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const uid = useId().replace(/:/g, '')

  useEffect(() => {
    const open = () => {
      setQ('')
      setAt(0)
      if (dialog.current && !dialog.current.open) dialog.current.showModal()
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, open)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, open)
    }
  }, [])

  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (i: SearchItem) => words.every((w) => `${i.label} ${i.sub ?? ''}`.toLowerCase().includes(w))
    // With nothing typed, show what you can do and where you can go; projects and clients appear as you type.
    const all = words.length ? items.filter(hit) : items.filter((i) => i.group === 'Actions' || i.group === 'Go to')
    return GROUPS.flatMap((g) => all.filter((i) => i.group === g)).slice(0, 40)
  }, [q, items])

  // Keep the highlighted option in view while arrowing.
  useEffect(() => {
    document.getElementById(`${uid}-o${at}`)?.scrollIntoView({ block: 'nearest' })
  }, [at, uid])

  function go(i?: SearchItem) {
    if (!i) return
    dialog.current?.close()
    if (i.external) window.open(i.href, '_blank', 'noopener')
    else router.push(i.href)
  }

  const groups = GROUPS.map((g) => ({ g, rows: found.map((i, n) => ({ i, n })).filter((r) => r.i.group === g) })).filter((x) => x.rows.length)
  const count = q.trim() ? (found.length ? `${found.length} result${found.length === 1 ? '' : 's'}` : 'No results') : ''

  return (
    <dialog ref={dialog} className="a-dialog a-search" aria-label="Search the back office" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
      <input
        className="a-search-in"
        autoFocus
        role="combobox"
        aria-expanded={found.length > 0}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={found.length ? `${uid}-o${at}` : undefined}
        placeholder="Search, or pick something to do"
        aria-label="Search projects, clients and pages"
        value={q}
        onChange={(e) => { setQ(e.target.value); setAt(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((n) => Math.min(found.length - 1, n + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAt((n) => Math.max(0, n - 1)) }
          if (e.key === 'Enter') { e.preventDefault(); go(found[at]) }
        }}
      />
      <div ref={list} id={`${uid}-list`} role="listbox" aria-label="Results" className="a-search-list">
        {groups.map(({ g, rows }) => {
          const gid = `${uid}-g-${g.replace(/\s/g, '')}`
          return (
            <div key={g} role="group" aria-labelledby={gid}>
              <span id={gid} className="a-round-label a-search-group">{g}</span>
              {rows.map(({ i, n }) => (
                <div key={i.group + i.href + i.label} id={`${uid}-o${n}`} role="option" aria-selected={n === at} onMouseMove={() => { if (n !== at) setAt(n) }} onClick={() => go(i)}>
                  <span>{i.label}{i.external && <span className="sr-only"> (opens in a new tab)</span>}</span>
                  {i.sub && <span className="muted small">{i.sub}</span>}
                </div>
              ))}
            </div>
          )
        })}
        {!found.length && <p className="muted small a-search-none">Nothing matches “{q}”.</p>}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{count}</p>
      <p className="a-search-foot muted only-fine">Up and down to move, Enter to open, Esc to close</p>
    </dialog>
  )
}
