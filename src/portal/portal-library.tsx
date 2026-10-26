'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { IconFor, fileKind } from './file-icon'
import { Finder, type FinderNode } from './finder'
import { byStart, categoryOf, clientCanOpen, projectLabel, projectNode, REFERENCE, resolvePath, versionLabel } from './library'
import { fmtSize } from './resumable'
import { FeedbackButtons, ReviewThumb, VersionHead, WatchTile } from './review-ui'
import type { ClientProject, Deliverable, DriveFile } from './types'
import { Uploader } from './uploader'

const STATUS: Record<Deliverable['status'], string> = {
  'in-progress': 'In progress',
  'awaiting-feedback': 'Waiting for your feedback',
  'changes-requested': 'Changes in progress',
  approved: 'Approved',
}
const PROJECT_STATUS: Record<ClientProject['status'], string> = { 'in-production': 'In production', 'in-review': 'In review', delivered: 'Delivered' }
const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

type Client = { _id: string; organizationName: string }

/**
 * The client's library: their projects as Finder-style columns. One client starts at
 * Projects; someone on several clients starts at Clients. The selection lives in the
 * address (?at=…) so emails and the back button land in the right place.
 */
export function PortalLibrary({ projects, clients, demo, uploaderName }: { projects: ClientProject[]; clients: Client[]; demo: boolean; uploaderName: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const multi = clients.length > 1
  const offset = multi ? 1 : 0

  const sorted = [...projects].sort(byStart)
  const root: FinderNode[] = multi
    ? clients.map((c) => ({
        id: c._id,
        label: c.organizationName,
        childTitle: 'Projects',
        children: sorted.filter((p) => p.client._id === c._id).map((p) => projectNode(p, 'client')),
      }))
    : sorted.map((p) => projectNode(p, 'client'))

  const [path, setPathState] = useState<string[]>(() => (params.get('at') ?? '').split('/').filter(Boolean).map(decodeURIComponent))

  // "?open=<version key>" from an email: find the version and open it.
  useEffect(() => {
    const key = params.get('open')
    if (!key) return
    for (const p of projects) {
      const d = p.deliverables?.find((x) => x._key === key)
      if (!d) continue
      const gid = `${categoryOf(d)}:${d.title.trim().toLowerCase()}`
      setPath([...(multi ? [p.client._id] : []), p.slug, categoryOf(d) === 'video' ? 'videos' : 'documents', gid, d._key])
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setPath = useCallback(
    (next: string[]) => {
      setPathState(next)
      const q = new URLSearchParams()
      if (next.length) q.set('at', next.map(encodeURIComponent).join('/'))
      router.replace(`${pathname}${q.size ? `?${q}` : ''}`, { scroll: false })
    },
    [pathname, router],
  )

  const at = resolvePath(projects, path, offset)
  const client = multi ? clients.find((c) => c._id === path[0]) : clients[0]

  let panel: React.ReactNode = null
  let panelTitle = 'Details'
  if (at.version && at.project) {
    panelTitle = versionLabel(at.version)
    panel = <VersionPanel project={at.project} d={at.version} />
  } else if (at.group && at.project) {
    panelTitle = at.group.title
    const open = [...at.group.versions].reverse().find((v) => clientCanOpen(v, at.project!.deliverables))
    panel = open ? <VersionPanel project={at.project} d={open} /> : <p className="muted">Nothing to open here yet.</p>
  } else if (at.project && at.folder === 'assets') {
    panelTitle = REFERENCE
    panel = <AssetsPanel project={at.project} demo={demo} uploaderName={uploaderName} />
  } else if (at.project && at.folder) {
    panelTitle = at.folder === 'videos' ? 'Videos' : 'Documents'
    panel = <p className="muted">Pick a {at.folder === 'videos' ? 'video' : 'document'} to see its versions.</p>
  } else if (at.project) {
    panelTitle = 'Project'
    panel = <ProjectPanel p={at.project} />
  } else if (client && multi) {
    panelTitle = client.organizationName
    panel = <p className="muted">Pick a project.</p>
  } else {
    panel = <Waiting projects={projects} onOpen={(p) => setPath(p)} multi={multi} />
    panelTitle = 'Waiting for you'
  }

  return <Finder rootTitle={multi ? 'Clients' : 'Projects'} root={root} path={path} onPath={setPath} panel={panel} panelTitle={panelTitle} />
}

/** Everything waiting for feedback, so nothing gets missed. */
function Waiting({ projects, onOpen, multi }: { projects: ClientProject[]; onOpen: (path: string[]) => void; multi: boolean }) {
  const waiting = projects.flatMap((p) => (p.deliverables ?? []).filter((d) => d.status === 'awaiting-feedback' && clientCanOpen(d, p.deliverables)).map((d) => ({ p, d })))
  if (!waiting.length) return <p className="muted">You’re all caught up. Open a project to see everything we’ve made together.</p>
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <p className="muted" style={{ margin: 0 }}>{waiting.length === 1 ? 'One thing is' : `${waiting.length} things are`} waiting for your feedback:</p>
      <ul className="lib-list">
        {waiting.map(({ p, d }) => (
          <li key={d._key}>
            <button
              type="button"
              className="lib-row"
              onClick={() => onOpen([...(multi ? [p.client._id] : []), p.slug, categoryOf(d) === 'video' ? 'videos' : 'documents', `${categoryOf(d)}:${d.title.trim().toLowerCase()}`, d._key])}
            >
              <span className="fd-dot fd-dot-awaiting" aria-hidden="true" />
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <strong>{d.title} · {versionLabel(d)}</strong>
                <span className="muted small">{projectLabel(p)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProjectPanel({ p }: { p: ClientProject }) {
  const dates = (p.keyDates ?? []).filter((k) => k.label).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <span className={`pill pill-${p.status}`}>{PROJECT_STATUS[p.status]}</span>
        <h4 className="lib-title">{projectLabel(p)}</h4>
        {p.summary && <p className="muted" style={{ margin: 0 }}>{p.summary}</p>}
      </div>
      {p.nextStep && (
        <p className="lib-next"><span className="label">Next</span> {p.nextStep}</p>
      )}
      {dates.length > 0 && (
        <dl className="key-dates">
          {dates.map((k) => (
            <div key={k._key}><dt>{k.label}</dt><dd>{k.date ? day(k.date) : 'To be set'}</dd></div>
          ))}
        </dl>
      )}
      <p className="muted small" style={{ margin: 0 }}>Open Videos, Documents or Reference Assets to see everything for this project.</p>
    </div>
  )
}

function VersionPanel({ project, d }: { project: ClientProject; d: Deliverable }) {
  const video = categoryOf(d) === 'video'
  const base = `/api/portal/review/${d._key}?project=${encodeURIComponent(project.slug)}`
  const comments = d.vimeoReview ?? d.shareUrl
  const watch = d.vimeoEmbed ?? d.shareUrl
  const waiting = d.status === 'awaiting-feedback'
  const docExt = d.fileName?.split('.').pop()
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <VersionHead title={d.title} kind={video ? 'video' : fileKind({ name: d.fileName })} ext={video ? undefined : docExt} version={versionLabel(d)} date={d.date} length={d.length} />

      {video ? (
        watch && <WatchTile href={watch} thumb={d.thumbUrl ?? d.vimeoThumb} title={`${d.title}, ${versionLabel(d)}`} />
      ) : d.fileUrl ? (
        <a className="review-thumb doc-tile" href={`${base}&mode=view`} target="_blank" rel="noopener noreferrer" aria-label={`View ${d.title} (opens in a new tab)`}>
          <ReviewThumb src={`${base}&mode=preview`} kind={fileKind({ name: d.fileName })} ext={docExt} />
        </a>
      ) : null}

      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <span className={`pill pill-${d.status}`}>{d.final ? 'Final' : STATUS[d.status]}</span>
        {d.notes && <p className="deliv-note">{d.notes}</p>}
      </div>

      <div className="btn-row">
        {video
          ? comments && waiting && <a className="btn btn-secondary btn-sm" href={comments} target="_blank" rel="noopener noreferrer">Leave comments on video <span aria-hidden="true">↗</span><span className="sr-only"> (opens Vimeo in a new tab)</span></a>
          : d.fileUrl && (
              <>
                <a className="btn btn-secondary btn-sm" href={`${base}&mode=view`} target="_blank" rel="noopener noreferrer">View <span aria-hidden="true">↗</span><span className="sr-only"> (new tab)</span></a>
                <a className="btn btn-secondary btn-sm" href={`${base}&mode=download`} download>Download <span aria-hidden="true">↓</span></a>
              </>
            )}
      </div>

      {waiting && <FeedbackButtons project={project.slug} deliverable={d._key} title={`${d.title}, ${versionLabel(d)}`} notes={!video} />}
      {d.status === 'approved' && <p className="muted small" style={{ margin: 0 }}>You approved this version. Thank you!</p>}
      {d.status === 'changes-requested' && <p className="muted small" style={{ margin: 0 }}>We’re working on your changes. The next version will show up here.</p>}
    </div>
  )
}

/** Logos, scripts, music: anything either side shares for the project. */
function AssetsPanel({ project, demo, uploaderName }: { project: ClientProject; demo: boolean; uploaderName: string }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [connected, setConnected] = useState(true)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setFailed(false)
    try {
      const r = await fetch(`/api/portal/files?project=${encodeURIComponent(project.slug)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error()
      setConnected(j.connected !== false)
      setFiles((j.files as DriveFile[]).filter((f) => f.from === 'Reference Assets'))
    } catch {
      setFailed(true)
      setFiles([])
    }
  }, [project.slug])
  useEffect(() => {
    load()
  }, [load])

  if (!connected) return <p className="muted">File sharing for this project isn’t switched on yet. Email us files for now.</p>
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <p className="muted small" style={{ margin: 0 }}>Logos, photos, scripts, music: anything useful for the project. Both of us can add files here.</p>
      <Uploader
        compact
        start={async (file) => {
          const r = await fetch('/api/portal/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: project.slug, name: file.name, size: file.size, type: file.type }),
          })
          return r.json().catch(() => ({ error: 'failed' }))
        }}
        onDone={async (done) => {
          if (!demo) {
            await fetch('/api/portal/upload-complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project: project.slug, files: done.map((f) => ({ name: f.name, size: f.size })) }),
            }).catch(() => {})
          }
          await load()
        }}
      />
      {files === null ? (
        <p className="muted small">Loading…</p>
      ) : failed ? (
        <p className="err small">Couldn’t load the files. <button type="button" className="linklike" onClick={load}>Try again</button></p>
      ) : files.length ? (
        <ul className="file-list lib-files">
          {files.map((f) => (
            <li key={f.id}>
              <IconFor name={f.name} mime={f.mimeType} />
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <span className="fname">{f.name}</span>
                <span className="muted small">{[f.uploadedBy === uploaderName ? 'From you' : f.uploadedBy ? `From ${f.uploadedBy}` : null, day(f.modifiedTime), fmtSize(f.size)].filter(Boolean).join(' · ')}</span>
              </span>
              {demo ? (
                <span className="muted small">Download</span>
              ) : (
                <a className="text-link small" href={`/api/portal/download/${encodeURIComponent(f.id)}?project=${encodeURIComponent(project.slug)}`} download>Download<span className="sr-only"> {f.name}</span></a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>No files yet.</p>
      )}
    </div>
  )
}
