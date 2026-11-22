'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'

/* ── Confirm dialog, notices and inline errors: the back office's replacements for confirm() and alert() ── */

export type ConfirmOptions = {
  /** The question, e.g. "Delete the draft?" */
  title: string
  /** What will happen, in a sentence or two. Plain text keeps its line breaks. */
  body?: React.ReactNode
  /** Label of the button that goes ahead. Default "OK". Say what it does: "Delete", "Send", "Replace". */
  confirmLabel?: string
  /** Default "Cancel". */
  cancelLabel?: string
  /** Red confirm button, and focus starts on Cancel. Use it for deletes and anything that can't be undone. */
  danger?: boolean
}

export type Notice = {
  text: string
  /** 'error' stays until dismissed and is announced at once; 'info' clears itself after a few seconds. */
  tone?: 'info' | 'error'
  /** Shows a "Try again" button that runs this. */
  retry?: () => void
  retryLabel?: string
  /** Shows an "Undo" button that runs this; the notice stays quiet (not an error) and clears itself after 6 seconds. */
  undo?: () => void
  undoLabel?: string
  /** Runs when an Undo notice goes without Undo being pressed: it timed out, was dismissed, or a newer notice replaced it. */
  onExpire?: () => void
}

type Feedback = { confirm: (o: ConfirmOptions | string) => Promise<boolean>; notify: (n: Notice | string) => void }

const Ctx = createContext<Feedback | null>(null)

/** True when the element can be seen (and so focused). A closed <details> hides its content without removing its box. */
export const isShown = (el: HTMLElement) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null)

/** Puts focus back where it was before a dialog opened. A menu item that has since closed hands focus to its menu button. */
function restoreFocus(el: Element | null) {
  if (!(el instanceof HTMLElement)) return
  // Wait a frame: the click that closed the dialog may also close a menu around the trigger.
  requestAnimationFrame(() => {
    if (!el.isConnected) return
    const target = !isShown(el) && el.closest('details') ? el.closest('details')?.querySelector<HTMLElement>('summary') : el
    target?.focus({ preventScroll: true })
  })
}

/**
 * A controlled confirm dialog on the back office's dialog style. Escape, the backdrop and Cancel all say no;
 * focus goes back to whatever opened it.
 */
export function ConfirmDialog({ open, title, body, confirmLabel = 'OK', cancelLabel = 'Cancel', danger, onAnswer, className }: ConfirmOptions & { open: boolean; onAnswer: (yes: boolean) => void; /** Extra class, e.g. to style it outside the back office. */ className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const yes = useRef(false)
  const opener = useRef<Element | null>(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement
      yes.current = false
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`a-dialog a-confirm${className ? ` ${className}` : ''}`}
      aria-labelledby={`${id}-h`}
      aria-describedby={body ? `${id}-b` : undefined}
      onClose={(e) => { if (e.target !== e.currentTarget) return; onAnswer(yes.current); restoreFocus(opener.current) }}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}
    >
      {open && (
        <div className="a-dialog-body">
          <h2 id={`${id}-h`} className="a-h2 a-h2-lg">{title}</h2>
          {body != null && (typeof body === 'string' ? <p id={`${id}-b`} className="a-confirm-text">{body}</p> : <div id={`${id}-b`} className="a-confirm-text">{body}</div>)}
          <div className="btn-row a-dialog-actions">
            <button type="button" className="btn btn-secondary" autoFocus={danger} onClick={() => ref.current?.close()}>{cancelLabel}</button>
            <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} autoFocus={!danger} onClick={() => { yes.current = true; ref.current?.close() }}>{confirmLabel}</button>
          </div>
        </div>
      )}
    </dialog>
  )
}

/**
 * The same confirm dialog for components that also render outside the back office (the review room is in the
 * client portal and on share links too): `const [confirm, dialog] = useConfirmDialog('rr-confirm')`, render
 * `{dialog}` once, then `if (!(await confirm({ title, danger: true }))) return`. Never falls back to confirm().
 */
export function useConfirmDialog(className?: string) {
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setAsk((prev) => { prev?.resolve(false); return { ...o, resolve } })
  }), [])
  const dialog = (
    <ConfirmDialog className={className} open={Boolean(ask)} title={ask?.title ?? ''} body={ask?.body} confirmLabel={ask?.confirmLabel} cancelLabel={ask?.cancelLabel} danger={ask?.danger}
      onAnswer={(yes) => { ask?.resolve(yes); setAsk(null) }} />
  )
  return [confirm, dialog] as const
}

/** Wraps the back office (in the app layout) so any component can ask with useConfirm() and report with useNotify(). */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [notice, setNotice] = useState<(Notice & { n: number }) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef<Notice | null>(null)
  // The countdown pauses while the notice has the pointer or keyboard focus, so Undo can't vanish mid-reach.
  const left = useRef(0)
  const since = useRef(0)
  const held = useRef({ hover: false, focus: false, paused: false })

  const pending = useRef<((v: boolean) => void) | null>(null)
  const confirm = useCallback((o: ConfirmOptions | string) => new Promise<boolean>((resolve) => {
    // Only one question at a time: a new one answers an unanswered one with no.
    pending.current?.(false)
    pending.current = resolve
    setAsk({ ...(typeof o === 'string' ? { title: o } : o), resolve })
  }), [])

  /** Takes the notice down. `expired` (the default) tells an Undo notice its chance has passed. */
  const close = useCallback((expired = true) => {
    const was = current.current
    current.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    held.current = { hover: false, focus: false, paused: false }
    setNotice(null)
    if (expired) was?.onExpire?.()
  }, [])

  const countdown = useCallback((ms: number) => {
    left.current = ms
    since.current = Date.now()
    timer.current = setTimeout(() => close(), ms)
  }, [close])

  const notify = useCallback((n: Notice | string) => {
    const next = typeof n === 'string' ? { text: n } : n
    const was = current.current
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    held.current = { hover: false, focus: false, paused: false }
    current.current = next
    setNotice({ ...next, n: Date.now() })
    was?.onExpire?.()
    if (next.tone !== 'error' && (!next.retry || next.undo)) countdown(UNDO_MS)
  }, [countdown])

  /** Pause while hovered or focused; pick the countdown up again (with at least a moment left) once both have gone. */
  const hold = (k: 'hover' | 'focus', on: boolean) => {
    const h = held.current
    h[k] = on
    if ((h.hover || h.focus) && timer.current && !h.paused) {
      clearTimeout(timer.current)
      timer.current = null
      left.current -= Date.now() - since.current
      h.paused = true
    } else if (!h.hover && !h.focus && h.paused) {
      h.paused = false
      countdown(Math.max(left.current, 2000))
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    current.current?.onExpire?.()
  }, [])

  const isError = notice?.tone === 'error' || (Boolean(notice?.retry) && !notice?.undo)
  return (
    <Ctx.Provider value={{ confirm, notify }}>
      {children}
      <ConfirmDialog open={Boolean(ask)} title={ask?.title ?? ''} body={ask?.body} confirmLabel={ask?.confirmLabel} cancelLabel={ask?.cancelLabel} danger={ask?.danger}
        onAnswer={(yes) => { ask?.resolve(yes); if (pending.current === ask?.resolve) pending.current = null; setAsk(null) }} />
      <div className="a-toasts" aria-live="polite">
        {notice && (
          <div key={notice.n} className={`a-toast${isError ? ' is-error' : ''}`} role={isError ? 'alert' : 'status'}
            onMouseEnter={() => hold('hover', true)} onMouseLeave={() => hold('hover', false)}
            onFocus={() => hold('focus', true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) hold('focus', false) }}>
            <p>{notice.text}</p>
            {notice.undo && <button type="button" onClick={() => { const u = notice.undo; close(false); u?.() }}>{notice.undoLabel ?? 'Undo'}</button>}
            {notice.retry && <button type="button" onClick={() => { const r = notice.retry; close(false); r?.() }}>{notice.retryLabel ?? 'Try again'}</button>}
            <button type="button" className="a-toast-x" aria-label="Dismiss" onClick={() => close()}>×</button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}

/**
 * `const confirm = useConfirm()` then `if (!(await confirm({ title, body, confirmLabel, danger }))) return`.
 * Outside the back-office layout it falls back to the browser's own confirm box.
 */
export function useConfirm() {
  const c = useContext(Ctx)
  return c?.confirm ?? (async (o: ConfirmOptions | string) => {
    const t = typeof o === 'string' ? o : [o.title, typeof o.body === 'string' ? o.body : ''].filter(Boolean).join('\n\n')
    return window.confirm(t)
  })
}

/** `const notify = useNotify()` then `notify({ text, tone: 'error', retry })`. Falls back to alert() outside the layout. */
export function useNotify() {
  const c = useContext(Ctx)
  return c?.notify ?? ((n: Notice | string) => window.alert(typeof n === 'string' ? n : n.text))
}

/** How long Undo is offered (the notice's own life) before a held-back change is saved. Paused while the notice is hovered or focused. */
export const UNDO_MS = 6000

/** True inside the back-office layout, where Undo notices report when they expire (so the save waits for the notice). */
export const useHasFeedback = () => Boolean(useContext(Ctx))

/**
 * Hold a change back for the Undo window, the way Today's Dismiss does: hide it at once, offer Undo for six
 * seconds, then save. Leaving the page (or the component going away) saves anything still waiting.
 * `const later = useUndoable()` then `later(key, { text: 'Removed X', commit: () => save(), restore: () => show() })`.
 * `commit` should use `fetch(..., { keepalive: true })` so it still lands if the page is closing.
 */
export function useUndoable() {
  const notify = useNotify()
  const managed = useHasFeedback()
  const waiting = useRef(new Map<string, { timer?: ReturnType<typeof setTimeout>; commit: () => void }>())
  useEffect(() => {
    const all = waiting.current
    const flush = () => {
      for (const [k, w] of all) {
        clearTimeout(w.timer)
        all.delete(k)
        w.commit()
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])
  return useCallback((key: string, o: { text: string; commit: () => void; restore: () => void; undoLabel?: string }) => {
    const all = waiting.current
    const prev = all.get(key)
    if (prev) {
      clearTimeout(prev.timer)
      all.delete(key)
      prev.commit()
    }
    const entry: { timer?: ReturnType<typeof setTimeout>; commit: () => void } = { commit: o.commit }
    const save = () => {
      if (all.get(key) !== entry) return
      clearTimeout(entry.timer)
      all.delete(key)
      o.commit()
    }
    // In the back office the notice says when Undo has run out (its countdown pauses on hover and focus); elsewhere, a plain timer.
    if (!managed) entry.timer = setTimeout(save, UNDO_MS + 500)
    all.set(key, entry)
    notify({
      text: o.text,
      undoLabel: o.undoLabel,
      onExpire: save,
      undo: () => {
        if (all.get(key) !== entry) return
        clearTimeout(entry.timer)
        all.delete(key)
        o.restore()
      },
    })
  }, [notify, managed])
}

/** The message for a failed save. Says what to do; the page keeps what you typed. */
export const saveFailed = (status?: number) => (status === 401 ? 'You’ve been signed out, or this sign-in can’t make changes. Sign in again to save.' : 'That didn’t save. Check your connection and try again.')

/** An error shown where the thing failed, with an optional Try again. */
export function InlineError({ children, onRetry, retryLabel = 'Try again', busy }: { children: React.ReactNode; onRetry?: () => void; retryLabel?: string; busy?: boolean }) {
  return (
    <p className="a-error" role="alert">
      <span>{children}</span>
      {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={busy}>{busy ? 'Trying…' : retryLabel}</button>}
    </p>
  )
}
