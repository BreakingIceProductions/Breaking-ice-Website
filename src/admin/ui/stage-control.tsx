'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { PlannedAction, StagePlan } from '../types'

type Stage = { title: string; value: string }
type Result = { id: string; ok: boolean; message: string }

const APPS: PlannedAction['app'][] = ['Back office', 'TickTick', 'Google Calendar', 'Zoho Books', 'Client portal']

/**
 * "Move to …" button. Asks the server for a preview of everything the move will
 * do, lets you untick any step, and only then runs it.
 */
export function StageControl({ projectId, projectTitle, current, next, stages }: { projectId: string; projectTitle: string; current: string; next?: Stage; stages: Stage[] }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [target, setTarget] = useState<Stage | null>(null)
  const [plan, setPlan] = useState<StagePlan | null>(null)
  const [skip, setSkip] = useState<string[]>([])
  const [results, setResults] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const d = dialog.current
    if (target && d && !d.open) d.showModal()
  }, [target])

  async function open(s: Stage) {
    setTarget(s)
    setPlan(null)
    setResults(null)
    setSkip([])
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/admin/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, to: s.value }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error === 'signed-out' ? 'You’ve been signed out. Reload the page.' : 'The preview couldn’t be built.')
      setPlan(j.plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  async function run() {
    if (!target) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/admin/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, to: target.value, run: true, skip }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.message || 'The move didn’t go through. Nothing was changed.')
      setResults(j.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  function close() {
    dialog.current?.close()
  }

  function onClosed() {
    const ran = Boolean(results)
    setTarget(null)
    setPlan(null)
    setResults(null)
    if (ran) router.refresh()
  }

  const toggle = (id: string) => setSkip((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const others = stages.filter((s) => s.value !== current && s.value !== next?.value)

  return (
    <>
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

      <dialog ref={dialog} className="a-dialog" aria-labelledby="stage-h" onClose={onClosed}>
        {target && (
          <div className="a-dialog-body">
            <span className="eyebrow">{results ? 'Done' : 'Preview · nothing has run yet'}</span>
            <h2 id="stage-h" className="a-h2 a-h2-lg">
              {results ? `${projectTitle} is now in ${target.title}` : `Move ${projectTitle} to ${target.title}?`}
            </h2>

            {busy && !plan && !results && <p className="muted" role="status">Working out what this will do…</p>}
            {error && <p className="err" role="alert">{error}</p>}

            {plan && !results && (
              <>
                {plan.warnings.map((w) => (
                  <p key={w} className="a-warning">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.5" /></svg>
                    <span>{w}</span>
                  </p>
                ))}
                {APPS.map((app) => {
                  const list = plan.actions.filter((a) => a.app === app)
                  if (!list.length) return null
                  return (
                    <fieldset key={app} className="a-plan">
                      <legend>{app}</legend>
                      {list.map((a) => (
                        <label key={a.id} className={`a-plan-item${a.blocked ? ' blocked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={a.id === 'stage' || (!a.blocked && !skip.includes(a.id))}
                            disabled={a.id === 'stage' || Boolean(a.blocked) || busy}
                            onChange={() => toggle(a.id)}
                          />
                          <span className="stack">
                            <span>{a.label}</span>
                            {a.blocked && <span className="small muted">Skipped: {a.blocked}</span>}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )
                })}
                <div className="btn-row a-dialog-actions">
                  <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
                    {busy ? 'Running…' : 'Confirm and run'}
                  </button>
                </div>
              </>
            )}

            {results && (
              <>
                <ul className="a-results" aria-label="What happened">
                  {results.map((r) => (
                    <li key={r.id} className={r.ok ? 'ok' : 'fail'}>
                      <span className="sr-only">{r.ok ? 'Done:' : 'Failed:'}</span>
                      {r.message}
                    </li>
                  ))}
                </ul>
                {results.some((r) => !r.ok) && <p className="muted small">The rest went through. You can redo a failed step by hand, or move the stage again later.</p>}
                <div className="btn-row a-dialog-actions">
                  <button type="button" className="btn btn-primary" onClick={close} autoFocus>Done</button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}
