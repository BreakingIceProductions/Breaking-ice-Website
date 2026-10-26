'use client'

import { useRef, useState } from 'react'
import { fmtSize, sendResumable } from './resumable'

const MAX = 3 * 1024 ** 3
const BLOCKED = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|sh|app|dmg|pkg|apk|dll|lnk|iso)$/i

type Up = { key: string; file: File; sent: number; state: 'queued' | 'uploading' | 'done' | 'error'; note?: string; id?: string; cancelled?: boolean; xhr?: XMLHttpRequest }
export type Uploaded = { id: string; name: string; size: number }

/**
 * Drop zone plus progress list. `start` asks our server for a Google upload address;
 * the file then goes straight to Google in resumable chunks. `onDone` runs once with
 * everything that finished.
 */
export function Uploader({
  start,
  onDone,
  hint = 'Images, documents, audio and short videos · up to 3 GB per file',
  multiple = true,
  compact = false,
}: {
  start: (file: File) => Promise<{ sessionUrl?: string; error?: string; demo?: boolean }>
  onDone: (files: Uploaded[]) => void | Promise<void>
  hint?: string
  multiple?: boolean
  compact?: boolean
}) {
  const [ups, setUps] = useState<Up[]>([])
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<Up[]>([])
  const sync = () => setUps([...list.current])

  async function add(chosen: FileList | File[]) {
    const batch: Up[] = Array.from(chosen).map((file) => {
      const u: Up = { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, sent: 0, state: 'queued' }
      if (file.size > MAX) Object.assign(u, { state: 'error', note: 'Over 3 GB. Send it another way.' })
      else if (BLOCKED.test(file.name)) Object.assign(u, { state: 'error', note: 'Program and script files can’t be uploaded.' })
      else if (!file.size) Object.assign(u, { state: 'error', note: 'This file is empty.' })
      return u
    })
    list.current = [...list.current.filter((u) => u.state !== 'done'), ...batch]
    sync()
    const done: Uploaded[] = []
    for (const u of batch) {
      if (u.state !== 'queued') continue
      u.state = 'uploading'
      sync()
      const s: { sessionUrl?: string; error?: string; demo?: boolean } = await start(u.file).catch(() => ({ error: 'failed' }))
      if (s.demo) {
        u.state = 'done'
        u.sent = u.file.size
        u.note = 'Sample mode: nothing was sent.'
        sync()
        continue
      }
      if (!s.sessionUrl) {
        u.state = 'error'
        u.note = s.error === 'too-big' ? 'Over 3 GB. Send it another way.' : s.error === 'not-configured' ? 'File sharing isn’t switched on yet.' : 'Couldn’t start the upload. Try again.'
        sync()
        continue
      }
      const r = await sendResumable({
        file: u.file,
        session: s.sessionUrl,
        from: 0,
        cancelled: () => Boolean(u.cancelled),
        onXhr: (x) => (u.xhr = x),
        onProgress: (n, eta) => {
          u.sent = n
          u.note = eta
          sync()
        },
        onPause: (m) => {
          u.note = m
          sync()
        },
      })
      if (r.ok && r.id) {
        u.state = 'done'
        u.sent = u.file.size
        u.note = undefined
        u.id = r.id
        done.push({ id: r.id, name: u.file.name, size: u.file.size })
      } else if (!(r.ok === false && r.reason === 'cancelled')) {
        u.state = 'error'
        u.note = r.ok === false && r.reason === 'unsteady' ? 'The connection kept dropping. Try again.' : 'The upload didn’t finish. Try again.'
      }
      sync()
    }
    if (done.length) await onDone(done)
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div
        className={`dropzone${compact ? ' dropzone-compact' : ''}${drag ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (e.dataTransfer.files.length) add(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]])
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>Drop {multiple ? 'files' : 'a file'} here</strong> or{' '}
          <button type="button" className="linklike" onClick={() => input.current?.click()}>choose {multiple ? 'files' : 'a file'}</button>
        </p>
        {hint && <p className="muted small" style={{ margin: 0 }}>{hint}</p>}
        <input
          ref={input}
          type="file"
          multiple={multiple}
          hidden
          onChange={(e) => {
            if (e.target.files?.length) add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {ups.length > 0 && (
        <ul className="uploads" aria-live="polite">
          {ups.map((u) => {
            const pct = u.file.size ? Math.floor((u.sent / u.file.size) * 100) : 0
            return (
              <li key={u.key} className={`upload up-${u.state}`}>
                <div className="up-top">
                  <span className="fname">{u.file.name}</span>
                  <span className="muted small">
                    {u.state === 'done' ? `Uploaded · ${fmtSize(u.file.size)}` : u.state === 'error' ? u.note : u.state === 'queued' ? 'Waiting…' : `${pct}%${u.note ? ` · ${u.note}` : ''}`}
                  </span>
                </div>
                {u.state === 'uploading' && (
                  <div className="up-bar" role="progressbar" aria-label={`Uploading ${u.file.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
                {u.state === 'uploading' && (
                  <div className="up-actions">
                    <button
                      type="button"
                      className="linklike small"
                      onClick={() => {
                        u.cancelled = true
                        u.xhr?.abort()
                        u.state = 'error'
                        u.note = 'Cancelled.'
                        sync()
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
