'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtSize } from '@/portal/resumable'
import { Uploader } from '@/portal/uploader'
import type { ItemStatus, ItemType, MonthKey, RetainerItem } from '@/retainer/types'
import { postJson } from './retainer-settings'

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

/** One item: status, delivered, files handed over (uploaded to the client's Drive Retainer/<month>). */
function Item({ clientId, month, item, readOnly, onSaved }: { clientId: string; month: MonthKey; item: RetainerItem; readOnly?: boolean; onSaved: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [attach, setAttach] = useState(false)

  async function save(patch: Partial<RetainerItem>) {
    setBusy(true)
    const r = await postJson('/api/admin/retainer/item', { clientId, month, action: 'upsert', item: { ...item, ...patch } })
    setBusy(false)
    onSaved(r.ok ? (r.sample ? 'Sample data: not saved.' : 'Saved.') : r.message || 'That didn’t save. Try again.')
  }

  async function remove() {
    if (!confirm(`Remove “${item.title}” from ${month}? Its files stay in Google Drive.`)) return
    setBusy(true)
    const r = await postJson('/api/admin/retainer/item', { clientId, month, action: 'remove', key: item._key })
    setBusy(false)
    onSaved(r.ok ? (r.sample ? 'Sample data: not removed.' : 'Removed.') : r.message || 'That didn’t remove. Try again.')
  }

  return (
    <li>
      <div className="rt-item-top">
        <span className="stack" style={{ gap: 2, minWidth: 0 }}>
          <strong>{item.title}</strong>
          <span className="muted small">
            {TYPES.find((t) => t.value === item.type)?.label ?? item.type}
            {item.status === 'delivered' && item.deliveredAt ? ` · delivered ${item.deliveredAt}` : ''}
            {item.note ? ` · ${item.note}` : ''}
          </span>
        </span>
        {readOnly ? (
          <span className="a-stage">{STATUSES.find((s) => s.value === item.status)?.label}</span>
        ) : (
          <span className="rt-item-controls">
            <label className="sr-only" htmlFor={`st-${item._key}`}>Status of {item.title}</label>
            <select id={`st-${item._key}`} value={item.status} disabled={busy} onChange={(e) => save({ status: e.target.value as ItemStatus, deliveredAt: undefined })}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {item.status !== 'delivered' && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save({ status: 'delivered', deliveredAt: undefined })}>Mark delivered</button>
            )}
            <button type="button" className="linklike small" aria-expanded={attach} onClick={() => setAttach((a) => !a)}>{attach ? 'Close' : 'Attach files'}</button>
            <button type="button" className="linklike small" disabled={busy} onClick={remove}>Remove<span className="sr-only"> {item.title}</span></button>
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
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {items.length ? (
        <ul className="rt-items">
          {items.map((i) => <Item key={i._key} clientId={clientId} month={month} item={i} readOnly={readOnly} onSaved={done} />)}
        </ul>
      ) : (
        <p className="muted a-empty">No hand-made items for this month yet. Social posts from Publer count on their own.</p>
      )}
      {!readOnly && (
        <form className="rt-add" onSubmit={add}>
          <label className="sr-only" htmlFor="rt-new-title">New item title</label>
          <input id="rt-new-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Plan an item, e.g. Pilot profile video" maxLength={140} />
          <label className="sr-only" htmlFor="rt-new-type">Type</label>
          <select id="rt-new-type" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
      )}
      <p className="small muted" role="status" style={{ margin: 0, minHeight: 20 }}>{msg}</p>
    </div>
  )
}
