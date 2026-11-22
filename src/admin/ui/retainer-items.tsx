'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { fmtSize } from '@/portal/resumable'
import { Uploader } from '@/portal/uploader'
import type { ItemStatus, ItemType, MonthKey, RetainerItem } from '@/retainer/types'
import { useNotify, useUndoable } from './confirm'
import { postJson } from './retainer-settings'
import { fmtDate } from '@/admin/dates'

const TYPES: { value: ItemType; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'photo', label: 'Photo' },
  { value: 'design', label: 'Design' },
  { value: 'social', label: 'Social' },
  { value: 'other', label: 'Other' },
]
const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'delivered', label: 'Delivered' },
]

/** "November 2026" from "2026-11". */
const monthName = (m: MonthKey) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** One item: status, delivered, files handed over (uploaded to the client's Drive Retainer/<month>). */
function Item({ clientId, month, item, readOnly, onSaved }: { clientId: string; month: MonthKey; item: RetainerItem; readOnly?: boolean; onSaved: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState(false)
  const [gone, setGone] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const notify = useNotify()
  const later = useUndoable()

  /** Saves a whole item. Status changes offer Undo, which saves the item as it was. */
  async function put(next: RetainerItem, done: string, undo?: RetainerItem) {
    setBusy(true)
    const r = await postJson('/api/admin/retainer/item', { clientId, month, action: 'upsert', item: next })
    setBusy(false)
    if (!r.ok) return onSaved(r.message || 'That didn’t save. Try again.')
    onSaved(r.sample ? 'Sample data: not saved.' : done)
    // Sample data saved nothing, so there's nothing to undo: say the same as the line under the list.
    if (undo) notify(r.sample ? 'Sample data: not saved.' : { text: `${item.title}: ${done}`, undo: () => void put(undo, 'Put back.') })
  }

  // Removing hides the item at once and offers Undo; it's only removed for good after that (files stay in Drive either way).
  function remove() {
    // Hand focus to the next item (or the one before, or the Items heading) so the keyboard doesn't fall back to the top of the page.
    const li = row.current
    const near = [li?.nextElementSibling, li?.previousElementSibling].map((x) => x?.querySelector<HTMLElement>('select:not(:disabled), summary')).find(Boolean)
    const heading = li?.closest('section')?.querySelector<HTMLElement>('h2, h3')
    const to = near ?? heading
    if (to === heading && heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1
    to?.focus({ preventScroll: true })
    setGone(true)
    later(`rt-${item._key}`, {
      text: `Removed “${item.title}” from ${monthName(month)}. Its files stay in Google Drive.`,
      restore: () => {
        setGone(false)
        // Focus back on the item that came back.
        requestAnimationFrame(() => requestAnimationFrame(() => row.current?.querySelector<HTMLElement>('summary, select')?.focus()))
      },
      commit: () =>
        void postJson('/api/admin/retainer/item', { clientId, month, action: 'remove', key: item._key }).then((r) => {
          if (r.ok && r.sample) setGone(false)
          if (r.ok) return onSaved(r.sample ? 'Sample data: not removed.' : 'Removed.')
          setGone(false)
          notify({ text: r.message || `“${item.title}” wasn’t removed. Check your connection and try again.`, tone: 'error', retry: remove })
        }),
    })
  }

  if (gone) return null

  return (
    <li ref={row}>
      <div className="rt-item-top">
        <span className="stack rt-item-head">
          <strong>{item.title}</strong>
          <span className="muted small">
            {TYPES.find((t) => t.value === item.type)?.label ?? item.type}
            {item.status === 'delivered' && item.deliveredAt ? ` · delivered ${fmtDate(item.deliveredAt)}` : ''}
            {item.note ? ` · ${item.note}` : ''}
          </span>
        </span>
        {readOnly ? (
          <span className="a-stage">{STATUSES.find((s) => s.value === item.status)?.label}</span>
        ) : (
          <span className="rt-item-controls">
            <label className="sr-only" htmlFor={`st-${item._key}`}>Status of {item.title}</label>
            <select id={`st-${item._key}`} value={item.status} disabled={busy} onChange={(e) => { const st = e.target.value as ItemStatus; void put({ ...item, status: st, deliveredAt: undefined }, `marked ${STATUSES.find((x) => x.value === st)?.label.toLowerCase()}.`, item) }}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {attach ? (
              <button type="button" className="linklike small" aria-expanded onClick={() => setAttach(false)}>Close<span className="sr-only"> the uploader</span></button>
            ) : (
              <details className="ld-menu rt-more">
                <summary className="btn btn-secondary btn-sm">More<span className="sr-only"> for {item.title}</span></summary>
                <ul>
                  <li><button type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); setAttach(true) }}>Attach files</button></li>
                  <li><button type="button" disabled={busy} onClick={remove}>Remove<span className="sr-only"> {item.title}</span></button></li>
                </ul>
              </details>
            )}
          </span>
        )}
      </div>
      {item.files?.length ? (
        <ul className="rt-files" aria-label={`Files for ${item.title}`}>
          {item.files.map((f) => (
            <li key={f.id}>
              <a className="text-link-plain" href={`https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`} target="_blank" rel="noopener noreferrer">
                {f.name}<span className="sr-only"> (opens Google Drive in a new tab)</span>
              </a>
              {f.size ? <span className="muted"> · {fmtSize(f.size)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {attach && !readOnly && (
        <Uploader
          compact
          hint={`Goes to their Google Drive, Retainer / ${month}, and shows in their portal library`}
          start={(file) => postJson('/api/admin/retainer/upload', { clientId, month, name: file.name, size: file.size, type: file.type }) as Promise<{ sessionUrl?: string; error?: string; demo?: boolean }>}
          onDone={async (files) => {
            const r = await postJson('/api/admin/retainer/item', { clientId, month, action: 'attach', key: item._key, files })
            if (!r.ok) return onSaved('Uploaded to Drive, but couldn’t attach the files to the item. Try again.')
            // Handing files over is delivering: mark it, unless it already is.
            if (item.status !== 'delivered') await postJson('/api/admin/retainer/item', { clientId, month, action: 'upsert', item: { ...item, status: 'delivered' } })
            setAttach(false)
            onSaved(r.sample ? 'Sample data: not saved.' : `Attached ${files.length === 1 ? files[0].name : `${files.length} files`}${item.status !== 'delivered' ? ' and marked delivered' : ''}.`)
          }}
        />
      )}
    </li>
  )
}

/** This month's hand-made items: add a planned one, set status, mark delivered, attach files. */
export function RetainerItems({ clientId, month, items, readOnly }: { clientId: string; month: MonthKey; items: RetainerItem[]; readOnly?: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('video')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const done = (m: string) => {
    setMsg(m)
    router.refresh()
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    const r = await postJson('/api/admin/retainer/item', { clientId, month, action: 'upsert', item: { title, type, status: 'planned' } })
    setBusy(false)
    if (r.ok) setTitle('')
    done(r.ok ? (r.sample ? 'Sample data: not saved.' : 'Added.') : r.message || 'That didn’t save. Try again.')
  }

  return (
    <div className="stack rt-stack">
      {items.length ? (
        <ul className="rt-items">
          {items.map((i) => <Item key={i._key} clientId={clientId} month={month} item={i} readOnly={readOnly} onSaved={done} />)}
        </ul>
      ) : (
        <p className="muted a-empty">No hand-made items for this month yet. Social posts count on their own.</p>
      )}
      {!readOnly && (
        <form className="rt-add" onSubmit={add}>
          <label className="sr-only" htmlFor="rt-new-title">New item title</label>
          <input id="rt-new-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Plan an item, e.g. Pilot profile video" maxLength={140} />
          <label className="sr-only" htmlFor="rt-new-type">Type</label>
          <select id="rt-new-type" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
      )}
      <p className="small muted rt-msg" role="status">{msg}</p>
    </div>
  )
}
