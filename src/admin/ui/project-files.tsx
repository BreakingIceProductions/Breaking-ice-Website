'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconFor } from '@/portal/file-icon'
import { fmtSize, sendResumable } from '@/portal/resumable'
import type { DriveFile } from '@/portal/types'

type Folder = 'From Breaking Ice' | 'Finals'
type Up = { key: string; file: File; sent: number; state: 'queued' | 'uploading' | 'done' | 'error'; note?: string; id?: string }

const GROUPS: { from: DriveFile['from']; title: string; hint: string }[] = [
  { from: 'Finals', title: 'Finals', hint: 'Delivered, ready to use' },
  { from: 'From Breaking Ice', title: 'Shared with the client', hint: 'Drafts, posters, documents' },
  { from: 'From client', title: 'From the client', hint: 'What they’ve uploaded' },
]
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

/** What the client can see in their portal for this project, plus uploads straight into its Drive folders. */
export function ProjectFiles({ projectId, driveFolderId }: { projectId: string; driveFolderId?: string }) {
  const router = useRouter()
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [connected, setConnected] = useState(true)
  const [error, setError] = useState(false)
  const [folder, setFolder] = useState<Folder>('From Breaking Ice')
  const [review, setReview] = useState(false)
  const [ups, setUps] = useState<Up[]>([])
  const [drag, setDrag] = useState(false)
  const [msg, setMsg] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<Up[]>([])
  const sync = () => setUps([...list.current])

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch(`/api/admin/files?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setConnected(j.connected !== false)
      setFiles(j.files)
    } catch {
      setError(true)
      setFiles([])
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  async function upload(chosen: FileList | File[]) {
    setMsg('')
    const batch: Up[] = Array.from(chosen).map((file) => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, sent: 0, state: 'queued' }))
    list.current = [...list.current.filter((u) => u.state !== 'done'), ...batch]
    sync()
    const target = folder
    const forReview = review
    for (const u of batch) {
      u.state = 'uploading'
      sync()
      const r = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name: u.file.name, size: u.file.size, type: u.file.type, folder: target }),
      }).catch(() => null)
      const j = await r?.json().catch(() => ({}))
      if (!r?.ok || !j?.sessionUrl) {
        u.state = 'error'
        u.note = j?.error === 'too-big' ? 'Over 3 GB: put it in Drive directly.' : j?.error === 'not-configured' ? 'Google Drive isn’t connected.' : 'Couldn’t start the upload.'
        sync()
        continue
      }
      const res = await sendResumable({
        file: u.file,
        session: j.sessionUrl,
        from: 0,
        cancelled: () => false,
        onXhr: () => {},
        onProgress: (n) => {
          u.sent = n
          sync()
        },
        onPause: (m) => {
          u.note = m
          sync()
        },
      })
      if (res.ok) {
        u.state = 'done'
        u.sent = u.file.size
        u.id = res.id
        u.note = undefined
      } else {
        u.state = 'error'
        u.note = 'The upload didn’t finish. Try again.'
      }
      sync()
    }
    const done = batch.filter((u) => u.state === 'done' && u.id)
    if (done.length) {
      await fetch('/api/admin/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, folder: target, review: forReview, files: done.map((u) => ({ id: u.id, name: u.file.name })) }),
      }).catch(() => {})
      setMsg(
        forReview
          ? `${done.length === 1 ? done[0].file.name : `${done.length} files`} sent for review. The client gets the new-version email after the usual 10-minute hold.`
          : `${done.length === 1 ? done[0].file.name : `${done.length} files`} added. The client can see ${done.length === 1 ? 'it' : 'them'} now.`,
      )
      await load()
      router.refresh()
    }
  }

  if (!connected) {
    return <p className="muted small a-empty">Google Drive isn’t connected yet, so files can’t be shared here.</p>
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <div
        className={`dropzone a-dropzone${drag ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files)
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>Drop files here</strong> or{' '}
          <button type="button" className="linklike" onClick={() => input.current?.click()}>choose files</button>
        </p>
        <div className="a-upload-opts">
          <label className="small">
            Put them in{' '}
            <select className="input a-select" value={folder} onChange={(e) => setFolder(e.target.value as Folder)}>
              <option value="From Breaking Ice">Shared with the client</option>
              <option value="Finals">Finals</option>
            </select>
          </label>
          <label className="small a-check">
            <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> Send for review (they approve or ask for changes)
          </label>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files)
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
                  <span className="muted small">{u.state === 'done' ? `Uploaded · ${fmtSize(u.file.size)}` : u.state === 'error' ? u.note : u.state === 'queued' ? 'Waiting…' : `${pct}%${u.note ? ` · ${u.note}` : ''}`}</span>
                </div>
                {u.state === 'uploading' && (
                  <div className="up-bar" role="progressbar" aria-label={`Uploading ${u.file.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {msg && <p className="ok-note" role="status" style={{ margin: 0 }}>{msg}</p>}

      {files === null ? (
        <p className="muted small">Loading files…</p>
      ) : error ? (
        <p className="err small">Couldn’t load the files. <button type="button" className="linklike" onClick={load}>Try again</button></p>
      ) : (
        GROUPS.map((g) => {
          const these = files.filter((f) => f.from === g.from)
          return (
            <div key={g.from} className="stack" style={{ gap: 'var(--space-2)' }}>
              <div className="a-card-head">
                <h3 className="label" style={{ margin: 0 }}>{g.title}</h3>
                <span className="muted small">{these.length ? `${these.length} · ${g.hint}` : g.hint}</span>
              </div>
              {these.length ? (
                <ul className="file-list a-file-list">
                  {these.map((f) => (
                    <li key={f.id}>
                      <IconFor name={f.name} mime={f.mimeType} />
                      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                        <span className="fname">{f.name}</span>
                        <span className="muted small">{[f.uploadedBy && f.from === 'From client' ? f.uploadedBy : null, fmtDay(f.modifiedTime), fmtSize(f.size)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <a className="text-link small" href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noopener noreferrer">
                        Open<span className="sr-only"> {f.name} in Google Drive (new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>Nothing here yet.</p>
              )}
            </div>
          )
        })
      )}
      {driveFolderId && (
        <a className="text-link small" href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer">
          Open the project folder in Google Drive<span className="sr-only"> (new tab)</span>
        </a>
      )}
    </div>
  )
}
