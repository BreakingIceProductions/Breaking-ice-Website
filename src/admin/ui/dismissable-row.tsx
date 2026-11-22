'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHasFeedback, useNotify } from './confirm'

/** Rows announce dismiss (-1) and undo (+1) so a count elsewhere on the page can follow along. */
const EVENT = 'a-dismissed'
const emit = (delta: number) => window.dispatchEvent(new CustomEvent(EVENT, { detail: delta }))

/** How long Undo is offered before the dismissal is saved, outside the back-office layout. Inside it the notice decides (it pauses on hover and focus). */
const UNDO_MS = 6000

/**
 * A dashboard reminder with a Dismiss button at the end of the row. Dismissing hides it at once and offers Undo
 * for six seconds; only then is it saved (sooner if you leave the page). Focus moves to the next row.
 */
export function DismissableRow({ projectId, dismissKey, label, children }: { projectId: string; dismissKey?: string; label: string; children: React.ReactNode }) {
  const [gone, setGone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const notify = useNotify()
  const managed = useHasFeedback()
  const li = useRef<HTMLLIElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const waiting = useRef(false)
  const refocus = useRef(false)
  useEffect(() => {
    if (gone || leaving || !refocus.current) return
    refocus.current = false
    li.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [gone, leaving])

  const restore = useCallback(() => {
    setGone(false)
    setLeaving(false)
    emit(1)
  }, [])

  const body = JSON.stringify({ projectId, key: dismissKey })
  const save = useCallback(() => {
    if (!waiting.current) return
    waiting.current = false
    clearTimeout(timer.current)
    fetch('/api/admin/dismiss', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
      })
      .catch(() => {
        // Didn't save: bring it back and say so.
        restore()
        notify({ text: `“${label}” couldn’t be dismissed. Check your connection and try again.`, tone: 'error', retry: () => li.current?.querySelector<HTMLButtonElement>('.a-dismiss-btn')?.click() })
      })
  }, [body, label, notify, restore])

  // Leaving the page (or this list going away) saves a dismissal that's still waiting out its Undo.
  useEffect(() => {
    const flush = () => {
      if (!waiting.current) return
      waiting.current = false
      clearTimeout(timer.current)
      navigator.sendBeacon?.('/api/admin/dismiss', new Blob([body], { type: 'application/json' }))
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      if (waiting.current) save()
    }
  }, [body, save])

  if (gone && !leaving) return null

  const dismiss = () => {
    // Hand focus to the next row (or the one before) so the keyboard doesn't fall back to the top of the page.
    const row = li.current
    const next = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>('a, button')
    setLeaving(true)
    setTimeout(() => { if (waiting.current) setGone(true); setLeaving(false) }, 250)
    next?.focus({ preventScroll: true })
    emit(-1)
    waiting.current = true
    clearTimeout(timer.current)
    // Saved once the Undo notice runs out (its countdown pauses while hovered or focused).
    if (!managed) timer.current = setTimeout(save, UNDO_MS + 500)
    notify({
      text: `Dismissed: ${label}`,
      onExpire: save,
      undo: () => {
        if (!waiting.current) return
        waiting.current = false
        clearTimeout(timer.current)
        restore()
        // Focus goes back to the row that came back (once it's on screen again), so the keyboard picks up where it was.
        refocus.current = true
      },
    })
  }

  return (
    <li ref={li} className={`a-row-x${leaving ? ' is-leaving' : ''}`}>
      {children}
      {dismissKey && (
        <button type="button" className="a-dismiss-btn" onClick={dismiss} title="Dismiss">
          <span aria-hidden="true">×</span>
          <span className="sr-only">Dismiss {label}</span>
        </button>
      )}
    </li>
  )
}

/**
 * A count that follows dismissals on the page: "7 things" → "6 things" → "All clear".
 * `<DismissCount className="ap-count" initial={onYou.length} one="thing" none="All clear" />`
 */
export function DismissCount({ initial, one, many = `${one}s`, none, className }: { initial: number; one: string; many?: string; none: string; className?: string }) {
  const [n, setN] = useState(initial)
  useEffect(() => setN(initial), [initial])
  useEffect(() => {
    const on = (e: Event) => setN((x) => Math.max(0, x + Number((e as CustomEvent<number>).detail || 0)))
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return <span className={className} aria-live="polite">{n ? `${n} ${n === 1 ? one : many}` : none}</span>
}
