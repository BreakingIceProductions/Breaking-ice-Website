'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { PlannedAction, StagePlan } from '../types'
import { InlineError, isShown } from './confirm'

export type Stage = { title: string; value: string }
type Result = { id: string; ok: boolean; message: string }

const APPS: PlannedAction['app'][] = ['Back office', 'TickTick', 'Google Calendar', 'Zoho Books', 'Client portal']

/**
 * The stage-move preview. Give it a target stage and it asks the server what the
 * move will do, lets you untick any step, and only then runs it.
 */
export function StageDialog({ projectId, projectTitle, target, onClose, returnTo, onRun }: { projectId: string; projectTitle: string; target: Stage | null; onClose: () => void; /** Where focus goes after Cancel or Done when whatever opened the preview is gone (a drag, say). */ returnTo?: () => HTMLElement | null; /** For optimistic placement: 'start' when Confirm is pressed, then 'done' or 'failed' (nothing changed; the dialog offers Try again). */ onRun?: (phase: 'start' | 'done' | 'failed') => void }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [plan, setPlan] = useState<StagePlan | null>(null)
  const [skip, setSkip] = useState<string[]>([])
  const [results, setResults] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    if (!target) return
    const d = dialog.current
    if (d && !d.open) {
      // Remember the stage button or menu that opened this, to hand focus back on close.
      opener.current = document.activeElement
      d.showModal()
    }
    let stale = false
    setPlan(null)
    setResults(null)
    setSkip([])
    setError('')
    setBusy(true)
    ;(async () => {
      try {
        const r = await fetch('/api/admin/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, to: target.value }) })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error === 'signed-out' ? 'You’ve been signed out. Reload the page.' : 'The preview couldn’t be built.')
        if (!stale) setPlan(j.plan)
      } catch (e) {
        if (!stale) setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
      if (!stale) setBusy(false)
    })()
    return () => { stale = true }
  }, [target, projectId])

  async function run() {
    if (!target) return
    setBusy(true)
    setError('')
    onRun?.('start')
    try {
      const r = await fetch('/api/admin/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, to: target.value, run: true, skip }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.message || 'The move didn’t go through. Nothing was changed.')
      setResults(j.results)
      onRun?.((j.results as Result[] | undefined)?.find((x) => x.id === 'stage')?.ok === false ? 'failed' : 'done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      onRun?.('failed')
    }
    setBusy(false)
  }

  const close = () => dialog.current?.close()

  function onClosed() {
    const ran = Boolean(results)
    const from = opener.current
    const fallback = returnTo?.() ?? null
    setPlan(null)
    setResults(null)
    onClose()
    if (ran) router.refresh()
    // Back to the trigger (a select keeps its place too); otherwise to the card or button given.
    requestAnimationFrame(() => {
      const el = from instanceof HTMLElement && from.isConnected && from !== document.body && isShown(from) ? from : fallback
      el?.focus({ preventScroll: true })
    })
  }

  const toggle = (id: string) => setSkip((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <dialog ref={dialog} className="a-dialog" aria-labelledby="stage-h" onClose={(e) => { if (e.target === e.currentTarget) onClosed() }}>
      {target && (
        <div className="a-dialog-body">
          <span className="eyebrow">{results ? 'Done' : 'Preview · nothing has run yet'}</span>
          <h2 id="stage-h" className="a-h2 a-h2-lg">
            {results ? `${projectTitle} is now in ${target.title}` : `Move ${projectTitle} to ${target.title}?`}
          </h2>

          {busy && !plan && !results && <p className="muted" role="status">Working out what this will do…</p>}
          {error && <InlineError onRetry={plan && !results ? run : undefined} busy={busy}>{error}</InlineError>}
          {error && !plan && <div className="btn-row a-dialog-actions"><button type="button" className="btn btn-secondary" onClick={close}>Close</button></div>}

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
  )
}
