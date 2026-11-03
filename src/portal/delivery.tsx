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
  const data = useFinalFiles(project.slug)
  const videoFiles = (data.files ?? []).filter(isVideo)
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
            const file = matchFile(d.title, videoFiles)
            return (
              <li key={d._key} className="p-delivery-film">
                {watch && <WatchTile href={watch} thumb={d.thumbUrl ?? d.vimeoThumb} title={d.title} />}
                <div className="stack" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
                  <span className="fname">{d.title}</span>
                  {d.length && <span className="muted small">{d.length}</span>}
                </div>
                {file ? (
                  <FileAction project={project} demo={demo} file={file} button />
                ) : (
                  // Vimeo only while Final Files has no videos (otherwise the list below has them).
                  data.files !== null && !videoFiles.length && canDownloadVideo(project, d) &&
                  (demo ? (
                    <span className="muted small">Download</span>
                  ) : (
                    <a className="btn btn-secondary btn-sm" href={`/api/portal/video-download/${d._key}?project=${encodeURIComponent(project.slug)}`}>Download <span aria-hidden="true">↓</span><span className="sr-only"> {d.title}</span></a>
                  ))
                )}
              </li>
            )
          })}
        </ul>
      )}

      <FinalFiles project={project} demo={demo} heading data={data} />
    </section>
  )
}

const isVideo = (f: DriveFile) => fileKind({ name: f.name, mime: f.mimeType }) === 'video'
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The file for a final video: its name contains the video's title. Web/MP4 copies beat masters when there are several. */
function matchFile(title: string, files: DriveFile[]) {
  const t = norm(title)
  if (!t) return undefined
  const hits = files.filter((f) => ` ${norm(f.name)} `.includes(` ${t} `))
  return hits.sort((a, b) => Number((b.size ?? 0) <= LARGE_FILE) - Number((a.size ?? 0) <= LARGE_FILE) || (a.size ?? 0) - (b.size ?? 0))[0]
}

type FinalData = { files: DriveFile[] | null; failed: boolean; load: () => void }

function useFinalFiles(slug: string, enabled = true): FinalData {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setFailed(false)
    try {
      const r = await fetch(`/api/portal/files?project=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setFiles((j.files as DriveFile[]).filter((f) => f.from === 'Final Files'))
    } catch {
      setFailed(true)
      setFiles([])
    }
  }, [slug])
  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])
  return { files, failed, load }
}

/** Download, or for a file too big for one download, ask Breaking Ice to send it. */
function FileAction({ project, demo, file: f, button = false }: { project: ClientProject; demo: boolean; file: DriveFile; button?: boolean }) {
  const [state, setState] = useState<'sending' | 'sent' | 'failed'>()
  const big = (f.size ?? 0) > LARGE_FILE
  const cls = button ? 'btn btn-secondary btn-sm' : 'text-link small'
  if (demo) return <span className="muted small">Download</span>
  if (!big)
    return (
      <a className={cls} href={`/api/portal/download/${encodeURIComponent(f.id)}?project=${encodeURIComponent(project.slug)}`} download>
        Download{button && <span aria-hidden="true"> ↓</span>}<span className="sr-only"> {f.name}</span>
      </a>
    )
  if (state === 'sent') return <span className="muted small" role="status">Asked. We’ll email you a link.</span>
  const ask = async () => {
    setState('sending')
    const r = await fetch('/api/portal/request-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: project.slug, id: f.id }),
    }).catch(() => null)
    setState(r?.ok ? 'sent' : 'failed')
  }
  return (
    <button type="button" className={button ? cls : `${cls} linklike`} disabled={state === 'sending'} onClick={ask}>
      {state === 'failed' ? 'Try again' : 'Request file'}<span className="sr-only"> {f.name}</span>
    </button>
  )
}

const GROUPS: { title: string; test: (f: DriveFile) => boolean }[] = [
  { title: 'Video files', test: isVideo },
  { title: 'Captions', test: (f) => /\.(srt|vtt|scc|stl)$/i.test(f.name) },
  { title: 'Stills & images', test: (f) => ['image', 'design'].includes(fileKind({ name: f.name, mime: f.mimeType })) },
  { title: 'Audio', test: (f) => fileKind({ name: f.name, mime: f.mimeType }) === 'audio' },
  { title: 'Other files', test: () => true },
]

/** The Final Files folder, grouped by kind. Files too big for one download are requested instead. */
export function FinalFiles({ project, demo, heading = false, data }: { project: ClientProject; demo: boolean; heading?: boolean; data?: FinalData }) {
  const own = useFinalFiles(project.slug, !data)
  const { files, failed, load } = data ?? own

  if (files === null) return <p className="muted small">Loading files…</p>
  if (failed) return <p className="err small">Couldn’t load the files. <button type="button" className="linklike" onClick={load}>Try again</button></p>
  if (!files.length) return heading ? null : <p className="muted small" style={{ margin: 0 }}>Nothing here yet.</p>

  // Each file lands in the first group that fits it.
  let left = files
  const groups = GROUPS.map((g) => {
    const mine = left.filter(g.test)
    left = left.filter((f) => !mine.includes(f))
    return { title: g.title, files: mine }
  }).filter((g) => g.files.length)

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      {groups.map((g) => (
        <div key={g.title} className="stack" style={{ gap: 'var(--space-2)' }}>
          <h3 className="p-label">{g.title}</h3>
          <ul className="file-list lib-files">
            {g.files.map((f) => (
              <li key={f.id}>
                <IconFor name={f.name} mime={f.mimeType} />
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <span className="fname">{f.name}</span>
                  <span className="muted small">{[fmtSize(f.size), (f.size ?? 0) > LARGE_FILE ? 'Too big to download here: we’ll send you a link' : null].filter(Boolean).join(' · ')}</span>
                </span>
                <FileAction project={project} demo={demo} file={f} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
