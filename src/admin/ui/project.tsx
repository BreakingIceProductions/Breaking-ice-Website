'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { saveFailed, useConfirm, useNotify } from './confirm'
import { StageDialog, type Stage } from './stage-dialog'
import { Ring } from './graphics'

const SAMPLE = 'Sample data: nothing was saved.'

/* ── Shared by the Next up card, the stage strip and the checklist ───── */

export type Check = { key: string; label: string; done: boolean }

type Progress = {
  checks: Check[]
  isDone: (c: Check) => boolean
  tick: (c: Check, done: boolean) => void
  /** Opens the usual stage preview. Nothing moves until it's confirmed there. */
  move: (to: Stage) => void
}

const Ctx = createContext<Progress | null>(null)
const useProgress = () => {
  const p = useContext(Ctx)
  if (!p) throw new Error('Used outside ProjectProgress')
  return p
}

/**
 * Wraps the project page. Holds the checklist ticks (so "Next up" follows a tick straight away)
 * and the one stage preview dialog every stage button on the page opens.
 */
export function ProjectProgress({ projectId, projectTitle, checks, children }: { projectId: string; projectTitle: string; checks: Check[]; children: React.ReactNode }) {
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [target, setTarget] = useState<Stage | null>(null)
  const isDone = (c: Check) => ticks[c.key] ?? c.done
  const notify = useNotify()

  async function tick(c: Check, done: boolean) {
    setTicks((t) => ({ ...t, [c.key]: done }))
    const r = await fetch('/api/admin/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, key: c.key, done }) }).catch(() => null)
    if (r?.ok) return
    setTicks((t) => ({ ...t, [c.key]: !done }))
    notify({ text: `“${c.label}” ${done ? 'wasn’t ticked' : 'wasn’t unticked'}. ${saveFailed(r?.status)}`, tone: 'error', retry: () => tick(c, done) })
  }

  return (
    <Ctx.Provider value={{ checks, isDone, tick, move: setTarget }}>
      {children}
      <StageDialog projectId={projectId} projectTitle={projectTitle} target={target} onClose={() => setTarget(null)} />
    </Ctx.Provider>
  )
}

/**
 * Next up: the first unticked step of the stage (once they're all ticked, the move to the next stage),
 * a ring for how many steps are done (press it for the steps themselves), and the one action.
 * `action` replaces the "Move to …" button, which shows only when nothing else is given.
 */
export function NextUp({ stage, next, action }: { stage: string; next?: Stage; action?: React.ReactNode }) {
  const { checks, isDone, move } = useProgress()
  const [showSteps, setShowSteps] = useState(false)
  const open = checks.find((c) => !isDone(c))
  const done = checks.filter(isDone).length
  return (
    <section className="sa-next" aria-label="Next up">
      <div className="sa-next-row">
        <div className="sa-next-main" aria-live="polite">
          <span className="eyebrow sa-next-eyebrow">Next up</span>
          <strong className="sa-next-title">{open ? open.label : next ? `Move it on to ${next.title}` : `${stage} is done`}</strong>
        </div>
        {checks.length > 0 && (
          <button type="button" className="sa-ring-btn" aria-expanded={showSteps} aria-controls="sa-next-steps" onClick={() => setShowSteps((x) => !x)}>
            <Ring value={Math.round((done / checks.length) * 100)}>{done}/{checks.length}</Ring>
            <span className="sr-only">{done} of {checks.length} steps done in {stage}. {showSteps ? 'Hide' : 'Show'} the steps</span>
          </button>
        )}
        {action ?? (!open && next && <button type="button" className="btn sa-copper" onClick={() => move(next)}>Move to {next.title}</button>)}
      </div>
      <div id="sa-next-steps" className="sa-next-steps" hidden={!showSteps}>
        <StageChecklist />
      </div>
    </section>
  )
}

/** The stages as a bar of segments, one button each: clicking one opens the stage preview for it. */
export function StageStrip({ stages, current }: { stages: (Stage & { when?: string })[]; current: string }) {
  const { move } = useProgress()
  const at = stages.findIndex((s) => s.value === current)
  return (
    <>
    <ol className="sa-stages" style={{ '--sa-n': String(stages.length) } as React.CSSProperties} aria-label={`Stage ${at + 1} of ${stages.length}: ${stages[at]?.title ?? current}`}>
      {stages.map((s, i) => (
        <li key={s.value} className={i < at ? 'is-done' : i === at ? 'is-current' : ''} aria-current={i === at ? 'step' : undefined}>
          <button type="button" disabled={i === at} onClick={() => move({ title: s.title, value: s.value })}>
            <span className="sa-stage-bar" aria-hidden="true" />
            <span className="sa-stage-name">{s.title}</span>
            {s.when && i !== at && <span className="sa-stage-when">{s.when}</span>}
            <span className="sr-only">{i === at ? ' (it is here)' : i < at ? ' (done). Move it back here' : '. Move it here'}</span>
          </button>
        </li>
      ))}
    </ol>
    <p className="sa-stage-now" aria-hidden="true">{stages[at]?.title} · {at + 1} of {stages.length}</p>
    </>
  )
}

/** "Left in <stage>": the stage's steps, ticked off here or on the board. */
export function StageChecklist() {
  const { checks, isDone, tick } = useProgress()
  if (!checks.length) return <p className="muted small m0">No steps for this stage</p>
  return (
    <div className="stack gap-3">
      {checks.map((c) => (
        <label key={c.key} className="a-plan-item pj-check">
          <input type="checkbox" checked={isDone(c)} onChange={(e) => tick(c, e.target.checked)} />
          <span>{c.label}</span>
        </label>
      ))}
    </div>
  )
}

/* ── The "More" menu ─────────────────────────────────────────────────── */

export type MenuLink = { label: string; href: string; newTab?: boolean }

/** Secondary actions: links out, and filing the project into or out of the archive. */
export function ProjectMenu({ projectId, title, archived, links }: { projectId: string; title: string; archived: boolean; links: MenuLink[] }) {
  const router = useRouter()
  const menu = useRef<HTMLDetailsElement>(null)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const notify = useNotify()

  // The menu closes on a click outside it or on Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const m = menu.current
      if (!m?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !m.contains(e.target as Node)) m.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  // Archiving only files the project away in the back office; no stage steps run and nothing is sent.
  async function file(change: { archived: boolean } | { declined: true }, ask?: { title: string; body: string; label: string }) {
    // Ask first (focus returns to the menu button if they cancel), then fold the menu away.
    const ok = !ask || (await confirm({ title: ask.title, body: ask.body, confirmLabel: ask.label }))
    if (menu.current) menu.current.open = false
    if (!ok) return
    setBusy(true)
    const r = await fetch('/api/admin/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...change }) }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { sample?: boolean } | null
    setBusy(false)
    if (!r?.ok) return notify({ text: `${title} wasn’t ${'archived' in change && !change.archived ? 'unarchived' : 'archived'}. ${saveFailed(r?.status)}`, tone: 'error', retry: () => file(change) })
    if (j?.sample) return notify(SAMPLE)
    router.refresh()
  }

  const leaves = `${title} leaves the board and stops counting in your pipeline and reminders. Nothing is sent to the client, and you can bring it back from the Archive bar or this menu.`

  return (
    <details className="ld-menu" ref={menu}>
      <summary className="btn btn-secondary btn-sm">More<span className="sr-only"> actions for {title}</span></summary>
      <ul>
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} {...(l.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {l.label}{l.newTab && <><span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></>}
            </a>
          </li>
        ))}
        {archived ? (
          <li><button type="button" disabled={busy} onClick={() => file({ archived: false })}>Unarchive</button></li>
        ) : (
          <>
            <li><button type="button" disabled={busy} onClick={() => file({ archived: true }, { title: `Archive ${title} as completed?`, body: leaves, label: 'Archive' })}>Archive as completed</button></li>
            <li><button type="button" disabled={busy} onClick={() => file({ declined: true }, { title: `Archive ${title} as declined?`, body: `${leaves} It counts as declined in your win rate.`, label: 'Archive as declined' })}>Archive as declined</button></li>
          </>
        )}
      </ul>
    </details>
  )
}

/* ── Copy a link ─────────────────────────────────────────────────────── */

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [msg, setMsg] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Copied.')
    } catch {
      setMsg(text)
    }
  }
  return (
    <span className="row-wrap">
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{label}</button>
      <span className="small muted" role="status">{msg}</span>
    </span>
  )
}
