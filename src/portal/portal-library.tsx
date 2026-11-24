'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { IconFor, fileKind } from './file-icon'
import { Finder } from './finder'
import { canDownloadVideo, categoryOf, clientCanOpen, FINALS, inReviewRoom, needsVimeoPreview, projectNode, REFERENCE, resolvePath, versionLabel, watchLink } from './library'
import { fmtSize } from './resumable'
import { FinalFiles } from './delivery'
import { DocLightbox, FeedbackButtons, FeedbackList, ReviewThumb, VersionHead, WatchTile } from './review-ui'
import { ReviewRoom } from './review-room'
import type { ClientProject, Deliverable, DriveFile } from './types'
import { Uploader } from './uploader'

const STATUS: Record<Deliverable['status'], string> = {
  'in-progress': 'In progress',
  'awaiting-feedback': 'Waiting for your feedback',
  'changes-requested': 'Changes in progress',
  approved: 'Approved',
}
const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

/**
 * One project's work as Finder-style columns: Videos / Documents / Reference Assets →
 * title → versions. The selection lives in the address (?at=…) so emails and the back
 * button land in the right place.
 */
export function ProjectLibrary({ project, ...rest }: LibraryProps & { project: ClientProject }) {
  return <Library projects={[project]} single {...rest} />
}

/**
 * Every project of a client's in one set of columns (the portal home): the first column lists the
 * projects, and each opens onto the same folders and panels as its project page. ?at= starts with the slug.
 */
export function ClientLibrary({ projects, ...rest }: LibraryProps & { projects: ClientProject[] }) {
  return <Library projects={projects} single={false} {...rest} />
}

type LibraryProps = { demo: boolean; uploaderName: string; viewOnly?: boolean }

function Library({ projects, single, demo, uploaderName, viewOnly = false }: LibraryProps & { projects: ClientProject[]; single: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const root = single ? (projectNode(projects[0], 'client').children ?? []) : projects.map((p) => projectNode(p, 'client'))
  const [path, setPathState] = useState<string[]>(() => (params.get('at') ?? '').split('/').filter(Boolean).map(decodeURIComponent))

  const setPath = useCallback(
    (next: string[]) => {
      setPathState(next)
      const q = new URLSearchParams()
      if (next.length) q.set('at', next.map(encodeURIComponent).join('/'))
      router.replace(`${pathname}${q.size ? `?${q}` : ''}`, { scroll: false })
    },
    [pathname, router],
  )

  // The sidebar links straight to a folder (?at=videos), so follow the address when it changes.
  const fromUrl = params.get('at') ?? ''
  useEffect(() => {
    setPathState(fromUrl.split('/').filter(Boolean).map(decodeURIComponent))
  }, [fromUrl])

  const at = resolvePath(projects, single ? [projects[0].slug, ...path] : path)
  const project = at.project

  let panel: React.ReactNode
  let panelTitle = 'Details'
  if (!project) {
    panel = <p className="muted">Open a project to see its videos, documents and reference assets.</p>
  } else if (at.version && !clientCanOpen(at.version, project.deliverables)) {
    // An older version you haven't opened up: never shown, even from a saved address.
    panelTitle = versionLabel(at.version)
    panel = <p className="muted">This is an older version. Ask Breaking Ice if you need it.</p>
  } else if (at.version) {
    panelTitle = versionLabel(at.version)
    panel = <VersionPanel project={project} d={at.version} uploaderName={uploaderName} />
  } else if (at.group) {
    panelTitle = at.group.title
    const open = [...at.group.versions].reverse().find((v) => clientCanOpen(v, project.deliverables))
    panel = open ? <VersionPanel project={project} d={open} uploaderName={uploaderName} /> : <p className="muted">Nothing to open here yet.</p>
  } else if (at.folder === 'assets') {
    panelTitle = REFERENCE
    panel = <AssetsPanel project={project} demo={demo} uploaderName={uploaderName} />
  } else if (at.folder === 'finals' && project.status === 'delivered') {
    panelTitle = FINALS
    panel = <FinalFiles project={project} demo={demo} />
  } else if (at.folder === 'videos' || at.folder === 'documents') {
    panelTitle = at.folder === 'videos' ? 'Videos' : 'Documents'
    panel = <p className="muted">Pick a {at.folder === 'videos' ? 'video' : 'document'} to see its versions.</p>
  } else {
    panel = <p className="muted">Open Videos, Documents or Reference Assets to see everything for this project. The newest version of each is always at the top.</p>
  }

  // A video in our own review room plays full width under the columns.
  const picked = project && (at.version ?? (at.group ? [...at.group.versions].reverse().find((v) => clientCanOpen(v, project.deliverables)) : undefined))
  const room = project && picked && inReviewRoom(picked) && clientCanOpen(picked, project.deliverables) ? picked : undefined

  return (
    <>
      <Finder rootTitle={single ? 'Folders' : 'Projects'} root={root} path={path} onPath={setPath} panel={panel} panelTitle={panelTitle} />
      {project && room && (
        <section id="review-room" className="p-room p-anchor" aria-labelledby="room-h">
          <h3 id="room-h" className="h3">{room.title} <span className="muted">· {versionLabel(room)}</span></h3>
          <ReviewRoom
            key={room._key}
            via="portal"
            project={project.slug}
            deliverableKey={room._key}
            title={room.title}
            versionLabel={versionLabel(room)}
            fps={room.fps ?? 23.976}
            duration={room.durationSec}
            status={room.status}
            canDecide={!viewOnly}
            readOnly={viewOnly}
            note={room.notes}
          />
        </section>
      )}
    </>
  )
}

function VersionPanel({ project, d, uploaderName = '' }: { project: ClientProject; d: Deliverable; uploaderName?: string }) {
  const video = categoryOf(d) === 'video'
  const inRoom = video && inReviewRoom(d)
  const preparing = video && needsVimeoPreview(d) && !watchLink(d)
  const base = `/api/portal/review/${d._key}?project=${encodeURIComponent(project.slug)}`
  const comments = d.vimeoReview ?? d.shareUrl
  const watch = watchLink(d)
  const waiting = d.status === 'awaiting-feedback'
  const docExt = d.fileName?.split('.').pop()
  const docKind = fileKind({ name: d.fileName })
  const [viewing, setViewing] = useState(false)
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <VersionHead title={d.title} kind={video ? 'video' : fileKind({ name: d.fileName })} ext={video ? undefined : docExt} version={versionLabel(d)} date={d.date} length={d.length} />

      {inRoom ? (
        <a className="btn btn-primary btn-sm" href="#review-room">Watch and comment <span aria-hidden="true">↓</span></a>
      ) : video ? (
        watch ? (
          <WatchTile href={watch} thumb={d.thumbUrl ?? d.vimeoThumb} title={`${d.title}, ${versionLabel(d)}`} />
        ) : preparing ? (
          <p className="muted small" style={{ margin: 0 }}>Preparing a preview. It shows up here soon; the file downloads now.</p>
        ) : null
      ) : d.fileUrl ? (
        <button type="button" className="review-thumb doc-tile" onClick={() => setViewing(true)} aria-label={`View ${d.title}`}>
          <ReviewThumb src={`${base}&mode=preview`} kind={docKind} ext={docExt} />
        </button>
      ) : null}

      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <span className={`pill pill-${d.status}`}>{d.final ? 'Final' : STATUS[d.status]}</span>
        {d.notes && <p className="deliv-note">{d.notes}</p>}
      </div>

      <div className="btn-row">
        {video
          ? (
              <>
                {comments && waiting && !inRoom && <a className="btn btn-secondary btn-sm" href={comments} target="_blank" rel="noopener noreferrer">Leave comments on video <span aria-hidden="true">↗</span><span className="sr-only"> (opens Vimeo in a new tab)</span></a>}
                {canDownloadVideo(project, d) && <a className="btn btn-secondary btn-sm" href={`/api/portal/video-download/${d._key}?project=${encodeURIComponent(project.slug)}`}>Download <span aria-hidden="true">↓</span></a>}
              </>
            )
          : d.fileUrl && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(true)}>View</button>
                <a className="btn btn-secondary btn-sm" href={`${base}&mode=download`} download>Download <span aria-hidden="true">↓</span></a>
              </>
            )}
      </div>

      {waiting && !inRoom && <FeedbackButtons project={project.slug} deliverable={d._key} title={`${d.title}, ${versionLabel(d)}`} notes={!video} />}
      {waiting && inRoom && <p className="muted small" style={{ margin: 0 }}>Comment on any frame in the player below, then approve or ask for changes there.</p>}
      <FeedbackList items={d.feedback} title="Notes on this version" you={uploaderName} />

      {!video && d.fileUrl && (
        <DocLightbox
          open={viewing}
          onClose={() => setViewing(false)}
          src={`${base}&mode=view`}
          download={`${base}&mode=download`}
          kind={docKind}
          title={d.title}
          meta={[versionLabel(d), d.date].filter(Boolean).join(' · ')}
        >
          {d.notes && <p className="deliv-note">{d.notes}</p>}
          <FeedbackList items={d.feedback} title="Notes on this version" you={uploaderName} />
          {waiting ? (
            <FeedbackButtons project={project.slug} deliverable={d._key} title={`${d.title}, ${versionLabel(d)}`} />
          ) : (
            <span className={`pill pill-${d.status}`}>{d.final ? 'Final' : STATUS[d.status]}</span>
          )}
        </DocLightbox>
      )}
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
