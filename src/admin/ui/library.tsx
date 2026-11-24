'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { IconFor, fileKind } from '@/portal/file-icon'
import { Finder, type FinderNode } from '@/portal/finder'
import { byStart, categoryOf, clientCanOpen, FINALS, isLatest, needsVimeoPreview, projectLabel, projectNode, REFERENCE, resolvePath, versionLabel, type Category, type DeliverableGroup } from '@/portal/library'
import { fmtSize } from '@/portal/resumable'
import { FeedbackList, ReviewThumb, VersionHead, WatchTile } from '@/portal/review-ui'
import type { Deliverable, DriveFile } from '@/portal/types'
import { Uploader } from '@/portal/uploader'
import { useConfirm, useNotify } from './confirm'
import { R2Upload } from './r2-upload'
import { fmtDate } from '@/admin/dates'
import { Initials } from './viz'
import { StageChip } from './viz-c'

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
export function AdminLibrary({ clients, projects, reviewUpload = false }: { clients: LibClient[]; projects: LibProject[]; reviewUpload?: boolean }) {
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
      lead: <Initials name={c.organizationName} />,
      badge: <span className="sc-count-chip" role="img" aria-label={`${mine.length} ${mine.length === 1 ? 'project' : 'projects'}`} title={`${mine.length} ${mine.length === 1 ? 'project' : 'projects'}`}>{mine.length}</span>,
      childTitle: 'Projects',
      children: mine.map((p) => ({ ...projectNode(p, 'studio'), meta: undefined, sub: <span className="sc-fd-sub"><StageChip stage={p.pipelineStage} title={p.stageTitle} /></span> })),
    }
  })

  const client = clients.find((c) => c._id === path[0])
  const at = resolvePath(projects.filter((p) => p.clientId === path[0]), path, 1)

  let panel: React.ReactNode
  let title = 'Details'
  if (at.version && at.project) {
    title = versionLabel(at.version)
    panel = <VersionPanel project={at.project} d={at.version} onChange={refresh} onDeleted={() => { setPath(path.slice(0, 3)); refresh() }} />
  } else if (at.group && at.project) {
    title = at.group.title
    panel = <GroupPanel project={at.project} group={at.group} reviewUpload={reviewUpload} onChange={refresh} onOpen={(key) => setPath([...path.slice(0, 4), key])} />
  } else if (at.project && at.folder === 'assets') {
    title = REFERENCE
    panel = <AssetsPanel project={at.project} />
  } else if (at.project && at.folder === 'finals') {
    title = FINALS
    panel = <AssetsPanel project={at.project} folder={FINALS} />
  } else if (at.project && at.category) {
    title = at.category === 'video' ? 'Videos' : 'Documents'
    panel = <AddVersion project={at.project} category={at.category} reviewUpload={reviewUpload} onAdded={refresh} />
  } else if (at.project) {
    title = 'Project'
    panel = <ProjectPanel p={at.project} />
  } else if (client) {
    title = client.organizationName
    panel = <ClientPanel c={client} count={projects.filter((p) => p.clientId === client._id).length} />
  } else {
    // Nothing picked yet: the columns speak for themselves.
    panel = null
  }

  return <Finder rootTitle="Clients" root={root} path={path} onPath={setPath} panel={panel} panelTitle={title} />
}

function ClientPanel({ c, count }: { c: LibClient; count: number }) {
  return (
    <div className="stack gap-4">
      <h4 className="lib-title">{c.organizationName}</h4>
      <div className="sc-chips"><span className="sc-count-chip sc-count-inline">{count}</span><span className="sa-muted small">{count === 1 ? 'project' : 'projects'}</span></div>
      {c.contacts?.length ? (
        <dl className="key-dates">
          {c.contacts.map((p) => (
            <div key={p._key}><dt>{p.email ? <a className="text-link-plain" href={`mailto:${p.email}`}>{p.name}</a> : p.name}</dt><dd className="muted">{p.role || p.email}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="muted small">No contacts yet, so nobody can sign in for this client.</p>
      )}
      <div className="btn-row">
        <Link className="btn btn-secondary btn-sm" href={`/admin/clients/${c._id}`}>Client overview</Link>
        <Link className="btn btn-secondary btn-sm" href="/admin/projects/new">New project</Link>
      </div>
    </div>
  )
}

function ProjectPanel({ p }: { p: LibProject }) {
  return (
    <div className="stack gap-4">
      <h4 className="lib-title">{projectLabel(p)}</h4>
      <div className="sc-chips">
        <StageChip stage={p.pipelineStage} title={p.stageTitle} />
        {!p.startDate && <span className="sb-chip sb-warm" title="No start date yet: add one in the editor so the folder is dated"><span className="sb-dot" aria-hidden="true" />No start date<span className="sr-only">: add one in the editor so the folder is dated</span></span>}
      </div>
      {p.nextStep && <p className="lib-next"><span className="label">Next</span> {p.nextStep}</p>}
      <div className="btn-row">
        <Link className="btn btn-primary btn-sm" href={`/admin/projects/${p._id}`}>Open project</Link>
        <a className="btn btn-secondary btn-sm" href={`/studio/portal/structure/clientProject;${encodeURIComponent(p._id)}`} target="_blank" rel="noopener noreferrer">Edit details<span aria-hidden="true"> ↗</span><span className="sr-only"> in the editor (opens in a new tab)</span></a>
      </div>
    </div>
  )
}

/**
 * Add a version. Videos go up to our storage, for review (the review room) or for delivery (the
 * finished file: marked Final, with a copy pushed to Vimeo). Without storage set up, a Vimeo link. Documents: a file.
 */
function AddVersion({ project, category, title: fixedTitle, reviewUpload = false, onAdded }: { project: LibProject; category: Category; title?: string; reviewUpload?: boolean; onAdded: () => void }) {
  const [how, setHow] = useState<'review' | 'delivery'>('review')
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
    <div className="stack gap-3">
      <h4 className="lib-sub">{fixedTitle ? 'Add the next version' : category === 'video' ? 'Add a video' : 'Add a document'}</h4>
      {!fixedTitle && (
        <>
          <label htmlFor={`t-${listId}`} className="small muted">Title (pick an existing one to add its next version)</label>
          <input id={`t-${listId}`} className="input" list={listId} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === 'video' ? 'Management Plan Explainer' : 'Event poster'} maxLength={140} />
          <datalist id={listId}>{existing.map((t) => <option key={t} value={t} />)}</datalist>
        </>
      )}
      {category === 'video' && reviewUpload && (
        <div className="a-switch" role="group" aria-label="How to add it">
          <button type="button" aria-pressed={how === 'review'} onClick={() => setHow('review')}>Upload for review</button>
          <button type="button" aria-pressed={how === 'delivery'} onClick={() => setHow('delivery')}>Upload for delivery</button>
        </div>
      )}
      {category === 'video' && reviewUpload ? (
        <div className="stack gap-3">
          <p className="muted small m0">
            {how === 'delivery'
              ? 'The finished file. Your client downloads it from the portal, and a copy goes to your Vimeo (unlisted) for the website.'
              : 'Plays in our own review room: the client (and anyone you share a link with) comments on exact frames and can draw on the picture.'}
          </p>
          <label htmlFor={`n-${listId}`} className="small muted">Note to the client (optional)</label>
          <textarea id={`n-${listId}`} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed and what to look for" />
          <label className="small a-check"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send to the client now (emails them)</label>
          <R2Upload
            projectId={project._id}
            title={fixedTitle ?? title}
            notes={notes}
            send={send}
            delivery={how === 'delivery'}
            onAdded={(m) => {
              setMsg(m)
              setNotes('')
              if (!fixedTitle) setTitle('')
              onAdded()
            }}
          />
        </div>
      ) : category === 'video' ? (
        <form onSubmit={addVideo} className="stack gap-3">
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
            <p className="muted small m0">Add a title first, then the file.</p>
          )}
        </>
      )}
      {msg && <p className="small muted m0" role="status">{msg}</p>}
    </div>
  )
}

function GroupPanel({ project, group, reviewUpload, onChange, onOpen }: { project: LibProject; group: DeliverableGroup; reviewUpload: boolean; onChange: () => void; onOpen: (key: string) => void }) {
  return (
    <div className="stack gap-5">
      <ul className="lib-list">
        {[...group.versions].reverse().map((d) => (
          <li key={d._key}>
            <button type="button" className="lib-row" onClick={() => onOpen(d._key)}>
              <span className={`fd-dot fd-dot-${d.final ? 'final' : d.status === 'awaiting-feedback' ? 'awaiting' : d.status === 'approved' ? 'approved' : d.status === 'changes-requested' ? 'changes' : 'hidden'}`} aria-hidden="true" />
              <span className="stack gap-0 min0">
                <strong>{versionLabel(d)}</strong>
                <span className="muted small">{[d.date, clientCanOpen(d, project.deliverables) ? 'client can see it' : 'hidden from client'].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AddVersion project={project} category={group.category} title={group.title} reviewUpload={reviewUpload} onAdded={onChange} />
    </div>
  )
}

/** A finished file's copy on Vimeo: on its way, there, or stuck (with a retry). */
function VimeoCopyLine({ projectId, d, onChange }: { projectId: string; d: Deliverable; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const retry = async () => {
    setBusy(true)
    setErr('')
    const r = await json('POST', '/api/admin/vimeo-push', { projectId, key: d._key })
    setBusy(false)
    if (!r.ok) setErr('Couldn’t reach the server. Try again.')
    else if (r.vimeo === 'failed') setErr(r.vimeoError ?? 'Vimeo said no again.')
    onChange()
  }
  if (d.vimeoState === 'uploading') return <p className="muted small m0">Copying to Vimeo…</p>
  if (d.vimeoState === 'ready' && d.vimeoUrl) return <p className="small m0"><a href={d.vimeoUrl} target="_blank" rel="noopener noreferrer">On Vimeo ↗<span className="sr-only"> (opens in a new tab)</span></a></p>
  if (d.vimeoState !== 'failed') return null
  return (
    <p className="small m0" role="status">
      <span className="muted">Vimeo copy failed: {err || d.vimeoError || 'unknown problem'}</span>{' '}
      <button type="button" className="linklike small" disabled={busy} onClick={retry}>{busy ? 'Trying…' : 'Try again'}</button>
    </p>
  )
}

function VersionPanel({ project, d, onChange, onDeleted }: { project: LibProject; d: Deliverable; onChange: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const notify = useNotify()
  const remove = async (asked = false) => {
    const what = d.host === 'r2' ? `It comes off the project and the client’s portal, and the ${needsVimeoPreview(d) ? 'stored file is' : 'review copy is'} deleted from storage (its comments stay on record).` : categoryOf(d) === 'video' ? 'It comes off the project and the client’s portal. The video itself stays on Vimeo.' : 'It comes off the project and the client’s portal, and the file goes to Google Drive’s trash (restorable there for 30 days).'
    if (!asked && !(await confirm({ title: `Delete ${d.title}, ${versionLabel(d)}?`, body: what, confirmLabel: 'Delete', danger: true }))) return
    setBusy(true)
    const r = await json('DELETE', '/api/admin/version', { projectId: project._id, key: d._key })
    setBusy(false)
    if (r.ok) onDeleted()
    else notify({ text: `${d.title}, ${versionLabel(d)} wasn’t deleted. Check your connection and try again.`, tone: 'error', retry: () => remove(true) })
  }
  const latest = isLatest(d, project.deliverables)
  const video = categoryOf(d) === 'video'
  const set = async (fields: Record<string, unknown>) => {
    setBusy(true)
    await json('PATCH', '/api/admin/version', { projectId: project._id, key: d._key, ...fields })
    setBusy(false)
    onChange()
  }
  return (
    <div className="stack gap-4">
      <VersionHead title={d.title} kind={video ? 'video' : fileKind({ name: d.fileName })} ext={video ? undefined : d.fileName?.split('.').pop()} version={versionLabel(d)} date={d.date} length={d.length} />
      {video && needsVimeoPreview(d) ? (
        // A file the browser can't play (often ProRes): no review room; the client downloads it and the preview is the Vimeo copy.
        <div className="stack gap-2">
          {d.thumbUrl || d.vimeoThumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage or Vimeo address
            <img src={(d.thumbUrl ?? d.vimeoThumb)!} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 'var(--radius-md)', background: 'var(--surface-inverse)' }} />
          ) : null}
          <p className="muted small m0">{[d.r2Key?.split('/').pop()?.replace(/^v\d+-[a-f0-9]+/, `${d.title}`), d.r2Size ? fmtSize(d.r2Size) : '', 'won’t play in a browser, so no review room'].filter(Boolean).join(' · ')}</p>
          {d.vimeoState ? <VimeoCopyLine projectId={project._id} d={d} onChange={onChange} /> : <p className="muted small m0">No Vimeo copy yet.</p>}
        </div>
      ) : video && d.host === 'r2' ? (
        <div className="stack gap-2">
          {d.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage address
            <img src={d.thumbUrl} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 'var(--radius-md)', background: 'var(--surface-inverse)' }} />
          )}
          <Link className="btn btn-primary btn-sm self-start" href={`/admin/review/${encodeURIComponent(project._id)}/${encodeURIComponent(d._key)}`}>Open the review room</Link>
          {d.vimeoState && <VimeoCopyLine projectId={project._id} d={d} onChange={onChange} />}
          <p className="muted small m0">
            {[d.openComments ? `${d.openComments} open comment${d.openComments === 1 ? '' : 's'} from the client` : 'No open comments from the client', d.fps && `${d.fps} fps`, d.width && d.height && `${d.width}×${d.height}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      ) : video ? (
        d.vimeoEmbed || d.shareUrl ? (
          <WatchTile href={(d.vimeoEmbed ?? d.shareUrl)!} thumb={d.vimeoThumb} title={`${d.title}, ${versionLabel(d)}`} />
        ) : null
      ) : d.fileUrl ? (
        <a className="review-thumb lib-doc-thumb doc-tile" href={d.fileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${d.title} in Drive (new tab)`}>
          <ReviewThumb src={`/api/admin/preview?projectId=${encodeURIComponent(project._id)}&key=${encodeURIComponent(d._key)}`} kind={fileKind({ name: d.fileName })} ext={d.fileName?.split('.').pop()} />
        </a>
      ) : null}
      {video && d.host !== 'r2' && !d.vimeoThumb && <p className="muted small m0">The thumbnail shows up after the next sync with Vimeo.</p>}
      {video && d.host !== 'r2' && (
        <details className="lib-replace">
          <summary className="linklike small">Replace with a file</summary>
          <div className="stack gap-3" style={{ marginTop: 'var(--space-3)' }}>
            <p className="muted small m0">Moves this version into the review room. It keeps its number, status and feedback, and nothing is emailed. The Vimeo copy stays in your Vimeo.</p>
            <R2Upload key={d._key} projectId={project._id} title={d.title} notes="" send={false} replaceKey={d._key} replaceFinal={Boolean(d.final)} onAdded={(m) => { notify({ text: m }); onChange() }} />
          </div>
        </details>
      )}

      {d.fileName && <p className="muted small m0">{d.fileName}</p>}
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
      <div><button type="button" className="linklike small lib-delete" disabled={busy} onClick={() => remove()}>Delete this version</button></div>
    </div>
  )
}

function AssetsPanel({ project, folder = REFERENCE }: { project: LibProject; folder?: typeof REFERENCE | typeof FINALS }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [connected, setConnected] = useState(true)
  const confirm = useConfirm()
  const notify = useNotify()
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/files?projectId=${encodeURIComponent(project._id)}`, { cache: 'no-store' }).catch(() => null)
    const j = await r?.json().catch(() => null)
    setConnected(j?.connected !== false)
    setFiles(((j?.files ?? []) as DriveFile[]).filter((f) => f.from === folder))
  }, [project._id, folder])
  useEffect(() => {
    load()
  }, [load])
  if (!connected) return <p className="muted">Google Drive isn’t connected yet.</p>
  return (
    <div className="stack gap-4">
      <p className="muted small m0">
        {folder === FINALS
          ? `What the client downloads once it’s delivered: masters, web and vertical cuts, captions (.srt), stills. ${project.status === 'delivered' ? 'The client can see these now.' : 'Hidden from the client until you mark the project Delivered.'}`
          : 'Logos, scripts, music: shared both ways. The client sees and can download everything here.'}
      </p>
      <Uploader
        compact
        start={(file) => json('POST', '/api/admin/upload', { projectId: project._id, folder, name: file.name, size: file.size, type: file.type })}
        onDone={async (done) => {
          await json('POST', '/api/admin/upload-complete', { projectId: project._id, folder, files: done })
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
              <span className="stack gap-0 min0">
                <span className="fname">{f.name}</span>
                <span className="muted small">{[f.uploadedBy, fmtDate(f.modifiedTime), fmtSize(f.size)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="row-wrap small">
                <a className="text-link" href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noopener noreferrer">Open<span className="sr-only"> {f.name} in Drive</span></a>
                <button
                  type="button"
                  className="linklike lib-delete"
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete ${f.name}?`, body: 'The client stops seeing it, and it goes to Google Drive’s trash (restorable there for 30 days).', confirmLabel: 'Delete', danger: true }))) return
                    const del = async (): Promise<void> => {
                      const r = await json('DELETE', '/api/admin/files', { projectId: project._id, fileId: f.id })
                      if (r.ok) await load()
                      else notify({ text: `${f.name} wasn’t deleted. Check your connection and try again.`, tone: 'error', retry: () => void del() })
                    }
                    await del()
                  }}
                >
                  Delete<span className="sr-only"> {f.name}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small m0">No files yet.</p>
      )}
    </div>
  )
}
