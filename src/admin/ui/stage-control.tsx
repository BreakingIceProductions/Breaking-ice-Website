'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveFailed, useNotify } from './confirm'
import { StageDialog, type Stage } from './stage-dialog'

/**
 * "Move to …" button. Asks the server for a preview of everything the move will
 * do, lets you untick any step, and only then runs it.
 */
export function StageControl({ projectId, projectTitle, current, next, stages, compact, archived, declined, onRun }: { projectId: string; projectTitle: string; current: string; next?: Stage; stages: Stage[]; compact?: boolean; archived?: boolean; declined?: boolean; /** Optimistic placement on a board: called when Confirm is pressed and when the move ends. */ onRun?: (to: Stage, phase: 'start' | 'done' | 'failed') => void }) {
  const router = useRouter()
  const [target, setTarget] = useState<Stage | null>(null)
  const [busy, setBusy] = useState(false)
  const notify = useNotify()
  const open = (st: Stage) => setTarget(st)
  const others = stages.filter((s) => s.value !== current && s.value !== next?.value)

  // Archiving and declining only file the project away in the back office; no stage steps run.
  async function file(change: { archived: boolean } | { declined: boolean }) {
    setBusy(true)
    const r = await fetch('/api/admin/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...change }) }).catch(() => null)
    setBusy(false)
    if (r?.ok) router.refresh()
    else notify({ text: `${projectTitle} wasn’t ${'archived' in change && !change.archived ? 'unarchived' : 'archived'}. ${saveFailed(r?.status)}`, tone: 'error', retry: () => file(change) })
  }

  return (
    <>
      {compact ? (
        <label className="a-select a-select-sm">
          <span className="sr-only">Stage of {projectTitle}</span>
          <select
            value={archived ? '__archived' : current}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__archive') return void file({ archived: true })
              if (v === '__unarchive') return void file({ archived: false })
              if (v === '__decline') return void file({ declined: true })
              const s = stages.find((x) => x.value === v)
              if (s) open(s)
            }}
          >
            {archived && <option value="__archived" disabled>{declined ? 'Archived · declined' : 'Archived'}</option>}
            {stages.map((s) => (
              <option key={s.value} value={s.value} disabled={!archived && s.value === current}>{s.value === current && !archived ? s.title : `Move to ${s.title}`}</option>
            ))}
            <option disabled>──────────</option>
            {archived ? (
              <option value="__unarchive">Unarchive</option>
            ) : (
              <>
                <option value="__archive">Archive as completed</option>
                <option value="__decline">Archive as declined</option>
              </>
            )}
          </select>
        </label>
      ) : (
      <div className="btn-row">
        {next && (
          <button type="button" className="btn btn-primary" onClick={() => open(next)}>
            Move to {next.title}
          </button>
        )}
        <label className="a-select">
          <span className="sr-only">Move to another stage</span>
          <select
            value=""
            onChange={(e) => {
              const s = stages.find((x) => x.value === e.target.value)
              if (s) open(s)
            }}
          >
            <option value="" disabled>{next ? 'Other stage…' : 'Move to…'}</option>
            {others.map((s) => (
              <option key={s.value} value={s.value}>{s.title}</option>
            ))}
          </select>
        </label>
      </div>
      )}

      <StageDialog projectId={projectId} projectTitle={projectTitle} target={target} onClose={() => setTarget(null)} onRun={onRun && target ? (phase) => onRun(target, phase) : undefined} />
    </>
  )
}
