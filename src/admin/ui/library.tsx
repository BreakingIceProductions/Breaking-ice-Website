'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { IconFor, fileKind } from '@/portal/file-icon'
import { Finder, type FinderNode } from '@/portal/finder'
import { byStart, categoryOf, clientCanOpen, isLatest, projectLabel, projectNode, REFERENCE, resolvePath, versionLabel, type Category, type DeliverableGroup } from '@/portal/library'
import { fmtSize } from '@/portal/resumable'
import { FeedbackList, ReviewThumb, VersionHead, WatchTile } from '@/portal/review-ui'
import type { Deliverable, DriveFile } from '@/portal/types'
import { Uploader } from '@/portal/uploader'

export type LibClient = { _id: string; organizationName: string; contacts?: { _key: string; name: string; email: string; role?: string }[] }
export type LibProject = {
  _id: string
  slug?: string
  title: string
  startDate?: string
  status?: 'in-production' | 'in-review' | 'delivered'
  pipelineStage: string
  stageTitle: string
  nextStep?: string
  clientId: string
  deliverables: Deliverable[]
}

const STATUS_OPTIONS: { value: Deliverable['status']; label: string }[] = [
  { value: 'in-progress', label: 'Not sent yet (hidden)' },
  { value: 'awaiting-feedback', label: 'With the client' },
  { value: 'changes-requested', label: 'Changes in progress' },
  { value: 'approved', label: 'Approved' },
]

const json = (method: string, url: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))

/** Every client's projects as Finder-style columns: exactly what each client sees, plus Josh's controls. */
export function AdminLibrary({ clients, projects }: { clients: LibClient[]; projects: LibProject[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
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
  const refresh = () => router.refresh()

  const root: FinderNode[] = clients.map((c) => {
    const mine = projects.filter((p) => p.clientId === c._id).sort(byStart)
    return {
      id: c._id,
      label: c.organizationName,
      meta: `${mine.length} ${mine.length === 1 ? 'project' : 'projects'}`,
      childTitle: 'Projects',
      children: mine.map((p) => ({ ...projectNode(p, 'studio'), meta: p.stageTitle })),
    }
  })

  const client = clients.find((c) => c._id === path[0])
  const at = resolvePath(projects.filter((p) => p.clientId === path[0]), path, 1)

  let panel: React.ReactNode
  let title = 'Details'
  if (at.version && at.project) {
    title = versionLabel(at.version)
    panel = <VersionPanel project={at.project} d={at.version} onChange={refresh} />
  } else if (at.group && at.project) {
    title = at.group.title
    panel = <GroupPanel project={at.project} group={at.group} onChange={refresh} onOpen={(key) => setPath([...path.slice(0, 4), key])} />
  } else if (at.project && at.folder === 'assets') {
    title = REFERENCE
    panel = <AssetsPanel project={at.project} />
  } else if (at.project && at.category) {
    title = at.category === 'video' ? 'Videos' : 'Documents'
    panel = <AddVersion project={at.project} category={at.category} onAdded={refresh} />
  } else if (at.project) {
    title = 'Project'
    panel = <ProjectPanel p={at.project} />
  } else if (client) {
    title = client.organizationName
    panel = <ClientPanel c={client} count={projects.filter((p) => p.clientId === client._id).length} />
  } else {
    panel = <p className="muted">Pick a client. Their columns match exactly what they see in their portal, with your controls added.</p>
  }

  return <Finder rootTitle="Clients" root={root} path={path} onPath={setPath} panel={panel} panelTitle={title} />
}

function ClientPanel({ c, count }: { c: LibClient; count: number }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <h4 className="lib-title">{c.organizationName}</h4>
      <p className="muted small" style={{ margin: 0 }}>{count} {count === 1 ? 'project' : 'projects'}</p>
      {c.contacts?.length ? (
        <dl className="key-dates">
          {c.contacts.map((p) => (
            <div key={p._key}><dt><a className="text-link-plain" href={`mailto:${p.email}`}>{p.name}</a></dt><dd className="muted">{p.role || p.email}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="muted small">No contacts yet, so nobody can sign in for this client.</p>
      )}
      <div className="btn-row">
        <Link className="btn btn-secondary btn-sm" href={`/admin/clients/${c._id}`}>Client overview</Link>
        <a className="btn btn-secondary btn-sm" href="/studio/portal/intent/create/template=clientProject;type=clientProject" target="_blank" rel="noopener noreferrer">New project ↗</a>
      </div>
    </div>
  )
}

function ProjectPanel({ p }: { p: LibProject }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <h4 className="lib-title">{projectLabel(p)}</h4>
      <p className="muted small" style={{ margin: 0 }}>{p.stageTitle}{p.startDate ? '' : ' · No start date yet: add one in the Studio so the folder is dated'}</p>
      {p.nextStep && <p className="lib-next"><span className="label">Next</span> {p.nextStep}</p>}
      <div className="btn-row">
        <Link className="btn btn-primary btn-sm" href={`/admin/projects/${p._id}`}>Open project</Link>
        <a className="btn btn-secondary btn-sm" href={`/studio/portal/structure/clientProject;${encodeURIComponent(p._id)}`} target="_blank" rel="noopener noreferrer">Edit in Studio ↗</a>
      </div>
    </div>
  )
}

/** Add a version: a Vimeo link for videos, a file for documents. */
function AddVersion({ project, category, title: fixedTitle, onAdded }: { project: LibProject; category: Category; title?: string; onAdded: () => void }) {
  const [title, setTitle] = useState(fixedTitle ?? '')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [send, setSend] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const existing = [...new Set(project.deliverables.filter((d) => categoryOf(d) === category).map((d) => d.title))]
  const listId = `titles-${project._id}-${category}`

  async function addVideo(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const r = await json('POST', '/api/admin/version', { projectId: project._id, title, url, notes, send })
    setBusy(false)
    if (r.ok) {
      setUrl('')
      setNotes('')
      if (!fixedTitle) setTitle('')
      setMsg(send ? 'Added and sent. The client gets the email after the 10-minute hold.' : 'Added, not sent yet.')
      onAdded()
    } else setMsg(r.error === 'invalid' ? 'Add a title and a vimeo.com link.' : 'Couldn’t add it. Try again.')
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <h4 className="lib-sub">{fixedTitle ? 'Add the next version' : category === 'video' ? 'Add a video' : 'Add a document'}</h4>
      {!fixedTitle && (
        <>
          <label htmlFor={`t-${listId}`} className="small muted">Title (pick an existing one to add its next version)</label>
          <input id={`t-${listId}`} className="input" list={listId} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === 'video' ? 'Management Plan Explainer' : 'Event poster'} maxLength={140} />
          <datalist id={listId}>{existing.map((t) => <option key={t} value={t} />)}</datalist>
        </>
      )}
      {category === 'video' ? (
        <form onSubmit={addVideo} className="stack" style={{ gap: 'var(--space-3)' }}>
          <label htmlFor={`u-${listId}`} className="small muted">Vimeo link (upload the video to Vimeo first)</label>
          <input id={`u-${listId}`} className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://vimeo.com/123456789/abcdef" required />
          <label htmlFor={`n-${listId}`} className="small muted">Note to the client (optional)</label>
          <textarea id={`n-${listId}`} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed and what to look for" />
          <label className="small a-check"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send to the client now (emails them)</label>
          <div><button type="submit" className="btn btn-primary btn-sm" disabled={busy || !title.trim() || !url.trim()}>{busy ? 'Adding…' : 'Add version'}</button></div>
        </form>
      ) : (
        <>
          <label htmlFor={`n-${listId}`} className="small muted">Note to the client (optional)</label>
          <textarea id={`n-${listId}`} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed and what to look for" />
          <label className="small a-check"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send to the client now (emails them)</label>
          {title.trim() || fixedTitle ? (
            <Uploader
              compact
              multiple={false}
              hint="One file per version: PDF, image, design file…"
              start={(file) => json('POST', '/api/admin/upload', { projectId: project._id, folder: 'Documents', name: file.name, size: file.size, type: file.type })}
              onDone={async (files) => {
                const r = await json('POST', '/api/admin/upload-complete', { projectId: project._id, folder: 'Documents', title: fixedTitle ?? title, notes, send, files })
                setMsg(r.ok ? (send ? 'Uploaded and sent. The client gets the email after the 10-minute hold.' : 'Uploaded, not sent yet.') : 'Uploaded, but couldn’t add the version. Try again.')
                if (r.ok) {
                  setNotes('')
                  if (!fixedTitle) setTitle('')
                  onAdded()
                }
              }}
            />
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Add a title first, then the file.</p>
          )}
        </>
      )}
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  )
}

function GroupPanel({ project, group, onChange, onOpen }: { project: LibProject; group: DeliverableGroup; onChange: () => void; onOpen: (key: string) => void }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <ul className="lib-list">
        {[...group.versions].reverse().map((d) => (
          <li key={d._key}>
            <button type="button" className="lib-row" onClick={() => onOpen(d._key)}>
              <span className={`fd-dot fd-dot-${d.final ? 'final' : d.status === 'awaiting-feedback' ? 'awaiting' : d.status === 'approved' ? 'approved' : d.status === 'changes-requested' ? 'changes' : 'hidden'}`} aria-hidden="true" />
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <strong>{versionLabel(d)}</strong>
                <span className="muted small">{[d.date, clientCanOpen(d, project.deliverables) ? 'client can see it' : 'hidden from client'].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AddVersion project={project} category={group.category} title={group.title} onAdded={onChange} />
    </div>
  )
}

function VersionPanel({ project, d, onChange }: { project: LibProject; d: Deliverable; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const latest = isLatest(d, project.deliverables)
  const video = categoryOf(d) === 'video'
  const set = async (fields: Record<string, unknown>) => {
    setBusy(true)
    await json('PATCH', '/api/admin/version', { projectId: project._id, key: d._key, ...fields })
    setBusy(false)
    onChange()
  }
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <VersionHead title={d.title} kind={video ? 'video' : fileKind({ name: d.fileName })} ext={video ? undefined : d.fileName?.split('.').pop()} version={versionLabel(d)} date={d.date} length={d.length} />
      {video ? (
        d.vimeoEmbed || d.shareUrl ? (
          <WatchTile href={(d.vimeoEmbed ?? d.shareUrl)!} thumb={d.vimeoThumb} title={`${d.title}, ${versionLabel(d)}`} />
        ) : null
      ) : d.fileUrl ? (
        <a className="review-thumb lib-doc-thumb doc-tile" href={d.fileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${d.title} in Drive (new tab)`}>
          <ReviewThumb src={`/api/admin/preview?projectId=${encodeURIComponent(project._id)}&key=${encodeURIComponent(d._key)}`} kind={fileKind({ name: d.fileName })} ext={d.fileName?.split('.').pop()} />
        </a>
      ) : null}
      {video && !d.vimeoThumb && <p className="muted small" style={{ margin: 0 }}>The thumbnail shows up after the next sync with Vimeo.</p>}

      {d.fileName && <p className="muted small" style={{ margin: 0 }}>{d.fileName}</p>}
      {d.notes && <p className="deliv-note">{d.notes}</p>}
      <FeedbackList items={d.feedback} title="Client feedback" />

      <label className="small muted" htmlFor={`st-${d._key}`}>Status</label>
      <select id={`st-${d._key}`} className="input a-select" value={d.status} disabled={busy} onChange={(e) => set({ status: e.target.value })}>
        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <label className="lib-switch">
        <input type="checkbox" role="switch" checked={Boolean(d.final)} disabled={busy} onChange={(e) => set({ final: e.target.checked })} />
        <span><strong>Final</strong><span className="muted small">Shows as “Final” instead of {`Version ${d.version}`}</span></span>
      </label>
      <label className="lib-switch">
        <input type="checkbox" role="switch" checked={latest || Boolean(d.clientCanView)} disabled={busy || latest} onChange={(e) => set({ clientCanView: e.target.checked })} />
        <span>
          <strong>Client can view</strong>
          <span className="muted small">{latest ? 'This is the newest version, so the client always sees it.' : 'Older version: off keeps it greyed out in the portal, so the client can see it existed but can’t open it.'}</span>
        </span>
      </label>

      <div className="btn-row">
        {d.shareUrl && <a className="btn btn-secondary btn-sm" href={d.shareUrl} target="_blank" rel="noopener noreferrer">Vimeo ↗</a>}
        {d.vimeoReview && <a className="btn btn-secondary btn-sm" href={d.vimeoReview} target="_blank" rel="noopener noreferrer">Review page ↗</a>}
        {d.fileUrl && <a className="btn btn-secondary btn-sm" href={d.fileUrl} target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>}
      </div>
    </div>
  )
}

function AssetsPanel({ project }: { project: LibProject }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [connected, setConnected] = useState(true)
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/files?projectId=${encodeURIComponent(project._id)}`, { cache: 'no-store' }).catch(() => null)
    const j = await r?.json().catch(() => null)
    setConnected(j?.connected !== false)
    setFiles(((j?.files ?? []) as DriveFile[]).filter((f) => f.from === 'Reference Assets'))
  }, [project._id])
  useEffect(() => {
    load()
  }, [load])
  if (!connected) return <p className="muted">Google Drive isn’t connected yet.</p>
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <p className="muted small" style={{ margin: 0 }}>Logos, scripts, music: shared both ways. The client sees and can download everything here.</p>
      <Uploader
        compact
        start={(file) => json('POST', '/api/admin/upload', { projectId: project._id, folder: 'Reference Assets', name: file.name, size: file.size, type: file.type })}
        onDone={async (done) => {
          await json('POST', '/api/admin/upload-complete', { projectId: project._id, folder: 'Reference Assets', files: done })
          await load()
        }}
      />
      {files === null ? (
        <p className="muted small">Loading…</p>
      ) : files.length ? (
        <ul className="file-list lib-files">
          {files.map((f) => (
            <li key={f.id}>
              <IconFor name={f.name} mime={f.mimeType} />
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <span className="fname">{f.name}</span>
                <span className="muted small">{[f.uploadedBy, new Date(f.modifiedTime).toLocaleDateString('en-CA'), fmtSize(f.size)].filter(Boolean).join(' · ')}</span>
              </span>
              <a className="text-link small" href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noopener noreferrer">Open<span className="sr-only"> {f.name} in Drive</span></a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>No files yet.</p>
      )}
    </div>
  )
}
