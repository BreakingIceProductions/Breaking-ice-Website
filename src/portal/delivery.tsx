'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconFor, fileKind } from './file-icon'
import { canDownloadVideo, groupDeliverables, LARGE_FILE } from './library'
import { fmtSize } from './resumable'
import { WatchTile } from './review-ui'
import type { ClientProject, DriveFile } from './types'

/**
 * The handover: once a project is delivered, its page opens with the final videos and
 * every file from the project's Final Files folder, ready to download.
 */
export function Delivery({ project, demo }: { project: ClientProject; demo: boolean }) {
  const finals = groupDeliverables(project.deliverables).video.map((g) => g.latest).filter((d) => d.final)
  return (
    <section className="p-delivery" aria-labelledby="delivery-h">
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h2 id="delivery-h" className="p-label">Delivered</h2>
        <p className="h3" style={{ margin: 0 }}>Your final files are ready</p>
        <p className="muted" style={{ margin: 0, maxWidth: '62ch' }}>Everything we made for {project.title}, ready to download. Keep a copy somewhere safe: these are the finished masters.</p>
      </div>

      {finals.length > 0 && (
        <ul className="p-delivery-films">
          {finals.map((d) => {
            const watch = d.vimeoEmbed ?? d.shareUrl
            return (
              <li key={d._key} className="p-delivery-film">
                {watch && <WatchTile href={watch} thumb={d.thumbUrl ?? d.vimeoThumb} title={d.title} />}
                <div className="stack" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
                  <span className="fname">{d.title}</span>
                  {d.length && <span className="muted small">{d.length}</span>}
                </div>
                {canDownloadVideo(project, d) &&
                  (demo ? (
                    <span className="muted small">Download</span>
                  ) : (
                    <a className="btn btn-secondary btn-sm" href={`/api/portal/video-download/${d._key}?project=${encodeURIComponent(project.slug)}`}>Download <span aria-hidden="true">↓</span><span className="sr-only"> {d.title}</span></a>
                  ))}
              </li>
            )
          })}
        </ul>
      )}

      <FinalFiles project={project} demo={demo} heading />
    </section>
  )
}

const GROUPS: { title: string; test: (f: DriveFile) => boolean }[] = [
  { title: 'Video files', test: (f) => fileKind({ name: f.name, mime: f.mimeType }) === 'video' },
  { title: 'Captions', test: (f) => /\.(srt|vtt|scc|stl)$/i.test(f.name) },
  { title: 'Stills & images', test: (f) => ['image', 'design'].includes(fileKind({ name: f.name, mime: f.mimeType })) },
  { title: 'Audio', test: (f) => fileKind({ name: f.name, mime: f.mimeType }) === 'audio' },
  { title: 'Other files', test: () => true },
]

/** The Final Files folder, grouped by kind. Files too big for one download are requested instead. */
export function FinalFiles({ project, demo, heading = false }: { project: ClientProject; demo: boolean; heading?: boolean }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [asked, setAsked] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({})

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const r = await fetch(`/api/portal/files?project=${encodeURIComponent(project.slug)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setFiles((j.files as DriveFile[]).filter((f) => f.from === 'Final Files'))
    } catch {
      setFailed(true)
      setFiles([])
    }
  }, [project.slug])
  useEffect(() => {
    load()
  }, [load])

  const ask = async (f: DriveFile) => {
    setAsked((s) => ({ ...s, [f.id]: 'sending' }))
    const r = await fetch('/api/portal/request-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: project.slug, id: f.id }),
    }).catch(() => null)
    setAsked((s) => ({ ...s, [f.id]: r?.ok ? 'sent' : 'failed' }))
  }

  if (files === null) return <p className="muted small">Loading files…</p>
  if (failed) return <p className="err small">Couldn’t load the files. <button type="button" className="linklike" onClick={load}>Try again</button></p>
  if (!files.length) return heading ? null : <p className="muted small" style={{ margin: 0 }}>Nothing here yet.</p>

  const left = [...files]
  const groups = GROUPS.map((g) => ({ title: g.title, files: left.filter(g.test) }))
    .map((g) => {
      for (const f of g.files) left.splice(left.indexOf(f), 1)
      return g
    })
    .filter((g) => g.files.length)

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      {groups.map((g) => (
        <div key={g.title} className="stack" style={{ gap: 'var(--space-2)' }}>
          <h3 className="p-label">{g.title}</h3>
          <ul className="file-list lib-files">
            {g.files.map((f) => {
              const big = (f.size ?? 0) > LARGE_FILE
              const state = asked[f.id]
              return (
                <li key={f.id}>
                  <IconFor name={f.name} mime={f.mimeType} />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="fname">{f.name}</span>
                    <span className="muted small">{[fmtSize(f.size), big ? 'Too big to download here: we’ll send you a link' : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  {demo ? (
                    <span className="muted small">Download</span>
                  ) : big ? (
                    state === 'sent' ? (
                      <span className="muted small" role="status">Asked. We’ll email you a link.</span>
                    ) : (
                      <button type="button" className="text-link small linklike" disabled={state === 'sending'} onClick={() => ask(f)}>
                        {state === 'failed' ? 'Try again' : 'Request file'}<span className="sr-only"> {f.name}</span>
                      </button>
                    )
                  ) : (
                    <a className="text-link small" href={`/api/portal/download/${encodeURIComponent(f.id)}?project=${encodeURIComponent(project.slug)}`} download>Download<span className="sr-only"> {f.name}</span></a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
