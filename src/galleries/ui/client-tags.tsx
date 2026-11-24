'use client'

import { useId, useState } from 'react'
import type { ClientOption } from './admin-new-gallery'

/**
 * The clients a gallery is tagged with, as chips. Type to find a client and press Enter (or click)
 * to add it; × or Backspace in the empty box takes one off. The first chip is the primary client.
 */
export function ClientTags({ id, clients, value, onChange }: { id: string; clients: ClientOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const listId = useId()
  const name = (cid: string) => clients.find((c) => c.id === cid)?.name ?? 'Unknown client'
  const q = text.trim().toLowerCase()
  const matches = clients.filter((c) => !value.includes(c.id) && (!q || c.name.toLowerCase().includes(q))).slice(0, 8)
  const active = matches[Math.min(hi, matches.length - 1)]

  const add = (cid: string) => {
    onChange([...value, cid])
    setText('')
    setHi(0)
  }

  return (
    <div className="ga-ctags">
      {value.length > 0 && (
        <ul className="ga-ctag-chips" aria-label="Tagged clients">
          {value.map((cid, i) => (
            <li key={cid} className="ga-ctag-chip">
              <span>{name(cid)}{i === 0 && value.length > 1 && <span className="muted"> · primary</span>}</span>
              <button type="button" className="ga-ctag-x" aria-label={`Remove ${name(cid)}`} onClick={() => onChange(value.filter((x) => x !== cid))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="ga-ctags-box">
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active ? `${listId}-${active.id}` : undefined}
          value={text}
          placeholder={value.length ? 'Add another client' : 'Type a client’s name'}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setHi(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setHi((h) => Math.min(h + 1, Math.max(0, matches.length - 1)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(0, h - 1))
            } else if (e.key === 'Enter') {
              // Enter adds the highlighted client instead of submitting the form.
              if (open && active) {
                e.preventDefault()
                add(active.id)
              }
            } else if (e.key === 'Escape') {
              setOpen(false)
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
        />
        {open && matches.length > 0 && (
          <ul id={listId} className="ga-ctags-list" role="listbox" aria-label="Clients">
            {matches.map((c) => (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={c === active}
                className={c === active ? 'on' : undefined}
                // mousedown so the click lands before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(c.id)
                }}
                onMouseEnter={() => setHi(matches.indexOf(c))}
              >
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
