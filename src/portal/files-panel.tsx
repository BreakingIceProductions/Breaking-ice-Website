'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconFor } from './file-icon'
import { fmtEta, fmtSize, sendResumable } from './resumable'
import type { DriveFile } from './types'

const MAX = 3 * 1024 ** 3
const BLOCKED = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|sh|app|dmg|pkg|apk|dll|lnk|iso)$/i
const TABS = [
  ['all', 'All'],
  ['From client', 'From you'],
  ['From Breaking Ice', 'From Breaking Ice'],
  ['Finals', 'Finals'],
] as const

type Item = {
  id: string
  file: File
  sent: number
  state: 'queued' | 'uploading' | 'paused' | 'done' | 'error' | 'cancelled'
  error?: string
  eta?: string
  session?: string
  xhr?: XMLHttpRequest
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
// Read fresh: cancel() can change it while an upload is running.
const isCancelled = (i: Item) => (i.state as Item['state']) === 'cancelled'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function ProjectFiles({ project, intro, demo, uploaderName }: { project: string; intro: string; demo: boolean; uploaderName: string }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [connected, setConnected] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all')
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState(false)
  const [note, setNote] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<Item[]>([])
  const running = useRef(false)

  const sync = () => setItems([...itemsRef.current])

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const r = await fetch(`/api/portal/files?project=${encodeURIComponent(project)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setConnected(j.connected !== false)
      setFiles(j.files)
    } catch {
      setLoadError(true)
      setFiles([])
    }
  }, [project])

  useEffect(() => {
    load()
  }, [load])

  // Warn before leaving mid-upload.
  useEffect(() => {
    const busy = items.some((i) => i.state === 'uploading' || i.state === 'queued' || i.state === 'paused')
    if (!busy) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [items])

  async function uploadOne(item: Item) {
    item.state = 'uploading'
    sync()
    if (demo) {
      // Sample mode: show the experience without sending anything.
      const total = item.file.size
      const steps = 24
      for (let i = 1; i <= steps; i++) {
        if (isCancelled(item)) return
        await wait(120)
        item.sent = Math.round((total * i) / steps)
        item.eta = fmtEta(((steps - i) * 120) / 1000)
        sync()
      }
      item.state = 'done'
      sync()
      return
    }
    try {
      if (!item.session) {
        const r = await fetch('/api/portal/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, name: item.file.name, size: item.file.size, type: item.file.type }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) {
          item.state = 'error'
          item.error =
            j.error === 'too-big' ? 'This file is over 3 GB. Send it another way and let us know.'
            : j.error === 'type' ? 'Program and script files can’t be uploaded.'
            : j.error === 'not-configured' ? 'File uploads aren’t switched on yet. Email us instead.'
            : 'We couldn’t start this upload. Try again.'
          sync()
          return
        }
        item.session = j.sessionUrl
      }
      const r = await sendResumable({
        file: item.file,
        session: item.session!,
        from: item.sent,
        cancelled: () => isCancelled(item),
        onXhr: (x) => (item.xhr = x),
        onProgress: (n, eta) => {
          item.sent = n
          item.state = 'uploading'
          if (eta) item.eta = eta
          sync()
        },
        onPause: (msg) => {
          item.state = 'paused'
          item.eta = msg
          sync()
        },
      })
      if (r.ok) {
        item.sent = item.file.size
        item.state = 'done'
      } else if (r.reason === 'cancelled') {
        return
      } else {
        item.state = 'error'
        item.error =
          r.reason === 'expired' ? 'This upload expired. Try again to start it fresh.'
          : r.reason === 'unsteady' ? 'The connection kept dropping. Try again when it’s steadier; it picks up where it left off.'
          : 'Something went wrong. Try again.'
        if (r.reason === 'expired') {
          item.session = undefined
          item.sent = 0
        }
      }
      sync()
    } catch {
      item.state = 'error'
      item.error = 'Something went wrong. Try again.'
      sync()
    }
  }

  async function runQueue() {
    if (running.current) return
    running.current = true
    const finished: Item[] = []
    let next: Item | undefined
    while ((next = itemsRef.current.find((i) => i.state === 'queued'))) {
      await uploadOne(next)
      if (next.state === 'done') finished.push(next)
    }
    running.current = false
    if (finished.length) {
      if (!demo) {
        await fetch('/api/portal/upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, files: finished.map((i) => ({ name: i.file.name, size: i.file.size })) }),
        }).catch(() => {})
        await load()
      } else {
        setFiles((f) => [
          ...finished.map<DriveFile>((i) => ({
            id: i.id,
            name: i.file.name,
            size: i.file.size,
            mimeType: i.file.type,
            modifiedTime: new Date().toISOString(),
            from: 'From client',
            uploadedBy: uploaderName,
          })),
          ...(f ?? []),
        ])
      }
      setNote(`${finished.length === 1 ? finished[0].file.name : `${finished.length} files`} uploaded. We’ve been notified.`)
    }
  }

  function add(list: FileList | File[]) {
    setNote('')
    const fresh: Item[] = []
    for (const file of Array.from(list)) {
      const item: Item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, sent: 0, state: 'queued' }
      if (file.size > MAX) Object.assign(item, { state: 'error', error: 'This file is over 3 GB. Send it another way and let us know.' })
      else if (BLOCKED.test(file.name)) Object.assign(item, { state: 'error', error: 'Program and script files can’t be uploaded.' })
      else if (file.size === 0) Object.assign(item, { state: 'error', error: 'This file is empty.' })
      fresh.push(item)
    }
    itemsRef.current = [...itemsRef.current.filter((i) => i.state !== 'done' && i.state !== 'cancelled'), ...fresh]
    sync()
    runQueue()
  }

  function cancel(item: Item) {
    item.state = 'cancelled'
    item.xhr?.abort()
    if (item.session) fetch(item.session, { method: 'DELETE' }).catch(() => {})
    sync()
  }

  function retry(item: Item) {
    item.state = 'queued'
    item.error = undefined
    sync()
    runQueue()
  }

  const shown = (files ?? []).filter((f) => tab === 'all' || f.from === tab)
  const counts = Object.fromEntries(TABS.map(([k]) => [k, (files ?? []).filter((f) => k === 'all' || f.from === k).length]))

  return (
    <section id="files" aria-labelledby="files-h" className="files">
      <div className="p-sec-head">
        <h2 id="files-h" className="h3">Project files</h2>
      </div>
      <p className="muted" style={{ margin: '0 0 var(--space-4)' }}>{intro}</p>

      {connected ? (
        <div
          className={`dropzone${drag ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            if (e.dataTransfer.files.length) add(e.dataTransfer.files)
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <p style={{ margin: 0 }}>
            <strong>Drop files here</strong> or{' '}
            <button type="button" className="linklike" onClick={() => inputRef.current?.click()}>choose files</button>
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            Images, fonts, documents, audio and short videos · up to 3 GB per file · big files keep going if your connection drops
          </p>
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) add(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      ) : (
        <div className="p-empty">
          <p className="muted" style={{ margin: 0 }}>File sharing for this project isn’t switched on yet. For now, email files to us or send a link.</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="uploads" aria-live="polite">
          {items.filter((i) => i.state !== 'cancelled').map((i) => {
            const pct = i.file.size ? Math.floor((i.sent / i.file.size) * 100) : 0
            return (
              <li key={i.id} className={`upload up-${i.state}`}>
                <div className="up-top">
                  <span className="fname">{i.file.name}</span>
                  <span className="muted small">
                    {i.state === 'done' ? `Uploaded · ${fmtSize(i.file.size)}` : i.state === 'error' ? fmtSize(i.file.size) : i.state === 'queued' ? 'Waiting…' : `${pct}% · ${i.eta ?? ''}`}
                  </span>
                </div>
                {(i.state === 'uploading' || i.state === 'paused') && (
                  <div className="up-bar" role="progressbar" aria-label={`Uploading ${i.file.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
                {i.state === 'error' && <span className="err small">{i.error}</span>}
                <div className="up-actions">
                  {(i.state === 'uploading' || i.state === 'paused' || i.state === 'queued') && (
                    <button type="button" className="linklike small" onClick={() => cancel(i)}>Cancel</button>
                  )}
                  {i.state === 'error' && i.file.size <= MAX && !BLOCKED.test(i.file.name) && i.file.size > 0 && (
                    <button type="button" className="linklike small" onClick={() => retry(i)}>Try again</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {note && <p className="ok-note" role="status">{note}{demo ? ' (Sample mode: nothing was actually sent.)' : ''}</p>}

      {connected && (
        <>
          <div className="chips files-tabs" role="tablist" aria-label="Show files">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" className="chip" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {label} <span className="muted">{counts[k] ?? 0}</span>
              </button>
            ))}
          </div>
          {files === null ? (
            <p className="muted small">Loading files…</p>
          ) : loadError ? (
            <p className="err small">We couldn’t load the files right now. <button type="button" className="linklike" onClick={load}>Try again</button></p>
          ) : shown.length ? (
            <ul className="file-list">
              {shown.map((f) => (
                <li key={f.id}>
                  <IconFor name={f.name} mime={f.mimeType} />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="fname">{f.name}</span>
                    <span className="muted small">
                      {f.from === 'From client' ? (f.uploadedBy ? `From ${f.uploadedBy}` : 'From you') : f.from} · {fmtDay(f.modifiedTime)}
                      {f.size ? ` · ${fmtSize(f.size)}` : ''}
                    </span>
                  </span>
                  {f.from === 'Finals' && <span className="pill pill-approved">Final</span>}
                  {demo ? (
                    <span className="muted small" title="Sample file">Download</span>
                  ) : (
                    <a className="text-link small" href={`/api/portal/download/${encodeURIComponent(f.id)}?project=${encodeURIComponent(project)}`} download>
                      Download<span className="sr-only"> {f.name}</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{tab === 'all' ? 'No files yet.' : 'Nothing here yet.'}</p>
          )}
          <p className="muted small" style={{ marginTop: 'var(--space-4)' }}>You can upload and download here. Only we can delete files, so nothing goes missing by accident.</p>
        </>
      )}
    </section>
  )
}
