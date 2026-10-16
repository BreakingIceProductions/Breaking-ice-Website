'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveFile } from './types'

const MAX = 3 * 1024 ** 3
const CHUNK = 8 * 1024 * 1024 // multiple of 256 KiB, as Google requires
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

const fmtSize = (n?: number) =>
  n === undefined ? '' : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`
const fmtEta = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s left` : s < 3600 ? `${Math.round(s / 60)} min left` : `${(s / 3600).toFixed(1)} h left`)
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
// Read fresh: cancel() can change it while an upload is running.
const isCancelled = (i: Item) => (i.state as Item['state']) === 'cancelled'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One PUT to Google's upload address. Resolves with where Google says we are. */
function put(item: Item, start: number, end: number, onBytes: (n: number) => void): Promise<{ status: number; next?: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    item.xhr = xhr
    xhr.open('PUT', item.session!)
    const total = item.file.size
    if (end > start) {
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${total}`)
      xhr.upload.onprogress = (e) => onBytes(start + e.loaded)
    } else {
      xhr.setRequestHeader('Content-Range', `bytes */${total}`) // "how much did you get?"
    }
    xhr.onload = () => {
      const range = xhr.getResponseHeader('Range') // e.g. bytes=0-8388607 (when exposed)
      const m = range && /bytes=0-(\d+)/.exec(range)
      resolve({ status: xhr.status, next: m ? Number(m[1]) + 1 : xhr.status === 308 && end > start ? end : undefined })
    }
    xhr.onerror = () => reject(new Error('network'))
    xhr.onabort = () => reject(new Error('aborted'))
    xhr.send(end > start ? item.file.slice(start, end) : null)
  })
}

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
      const total = item.file.size
      let start = item.sent
      let tries = 0
      const t0 = Date.now()
      const s0 = start
      while (start < total) {
        if (isCancelled(item)) return
        const end = Math.min(start + CHUNK, total)
        try {
          const r = await put(item, start, end, (n) => {
            item.sent = n
            const rate = (n - s0) / Math.max(1, (Date.now() - t0) / 1000)
            if (rate > 0) item.eta = fmtEta((total - n) / rate)
            sync()
          })
          if (r.status === 200 || r.status === 201) {
            start = total
            break
          }
          if (r.status === 308) {
            start = r.next ?? end
            item.sent = start
            tries = 0
            continue
          }
          if (r.status === 404 || r.status === 410) throw new Error('expired')
          throw new Error(`status ${r.status}`)
        } catch (e) {
          if (isCancelled(item)) return
          if ((e as Error).message === 'expired') {
            item.state = 'error'
            item.error = 'This upload expired. Try again to start it fresh.'
            item.session = undefined
            item.sent = 0
            sync()
            return
          }
          // Connection dropped: wait, ask Google how far it got, and carry on.
          tries++
          item.state = 'paused'
          item.eta = navigator.onLine ? 'Reconnecting…' : 'Waiting for your connection…'
          sync()
          await wait(Math.min(30_000, 1000 * 2 ** Math.min(tries, 5)))
          while (!navigator.onLine) await wait(2000)
          item.state = 'uploading'
          try {
            const s = await put(item, 0, 0, () => {})
            if (s.status === 200 || s.status === 201) {
              start = total
              break
            }
            if (s.status === 308) start = s.next ?? 0
          } catch {
            /* try again next loop */
          }
          if (tries > 40) {
            item.state = 'error'
            item.error = 'The connection kept dropping. Try again when it’s steadier; it picks up where it left off.'
            sync()
            return
          }
        }
      }
      item.sent = total
      item.state = 'done'
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
                  <span className="ext" aria-hidden="true">{(f.name.split('.').pop() ?? '').slice(0, 4)}</span>
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
