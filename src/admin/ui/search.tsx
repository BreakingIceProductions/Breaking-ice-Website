'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchItem = { group: 'Actions' | 'Go to' | 'Projects' | 'Clients' | 'People'; label: string; sub?: string; href: string; external?: boolean }

const GROUPS: SearchItem['group'][] = ['Actions', 'Go to', 'Projects', 'Clients', 'People']

/** Search box in the sidebar. Cmd+K or Ctrl+K opens it from anywhere in the back office. */
export function AdminSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)

  const open = () => {
    setQ('')
    setAt(0)
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (i: SearchItem) => words.every((w) => `${i.label} ${i.sub ?? ''}`.toLowerCase().includes(w))
    // With nothing typed, show what you can do and where you can go; projects and clients appear as you type.
    const list = words.length ? items.filter(hit) : items.filter((i) => i.group === 'Actions' || i.group === 'Go to')
    return GROUPS.flatMap((g) => list.filter((i) => i.group === g)).slice(0, 40)
  }, [q, items])

  function go(i?: SearchItem) {
    if (!i) return
    dialog.current?.close()
    if (i.external) window.open(i.href, '_blank', 'noopener')
    else router.push(i.href)
  }

  return (
    <>
      <button type="button" className="a-search-btn" onClick={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span>Search</span>
        <kbd aria-hidden="true">⌘K</kbd>
        <span className="sr-only">. Command K or Control K</span>
      </button>
      <dialog ref={dialog} className="a-dialog a-search" aria-label="Search the back office" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
        <input
          className="a-search-in"
          autoFocus
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
        <ul className="a-search-list">
          {found.map((i, n) => (
            <li key={i.group + i.href + i.label}>
              {(n === 0 || found[n - 1].group !== i.group) && <span className="a-round-label a-search-group">{i.group}</span>}
              <button type="button" className={n === at ? 'on' : ''} onMouseEnter={() => setAt(n)} onClick={() => go(i)}>
                <span>{i.label}</span>
                {i.sub && <span className="muted small">{i.sub}</span>}
              </button>
            </li>
          ))}
          {!found.length && <li className="muted small a-search-none">Nothing matches “{q}”.</li>}
        </ul>
        <p className="a-search-foot muted">Up and down to move, Enter to open, Esc to close</p>
      </dialog>
    </>
  )
}
