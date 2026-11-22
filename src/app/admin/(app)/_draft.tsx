'use client'

import { useEffect, useRef, useState } from 'react'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
type Snapshot = Record<string, string | boolean>

const SKIP = new Set(['hidden', 'submit', 'button', 'reset', 'password', 'file'])

const fieldsOf = (root: HTMLElement) =>
  [...root.querySelectorAll<Field>('input, select, textarea')].filter((el) => (el.id || el.name) && !SKIP.has(el.type))

const keyOf = (el: Field) => (el.type === 'radio' ? `${el.name || el.id}=${el.value}` : el.id || el.name)

function snapshot(root: HTMLElement): Snapshot {
  const out: Snapshot = {}
  for (const el of fieldsOf(root)) out[keyOf(el)] = el.type === 'checkbox' || el.type === 'radio' ? (el as HTMLInputElement).checked : el.value
  return out
}

/** Sets a value the way typing would, so React's own state follows. */
function setValue(el: Field, v: string) {
  if (el.value === v) return
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

const frames = (n = 2) => new Promise<void>((done) => { const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : done()); step(n) })

const toggles = (root: HTMLElement) => fieldsOf(root).filter((el): el is HTMLInputElement => el.type === 'radio' || el.type === 'checkbox')

/** Clicks the radios and checkboxes that differ, as a person would; true if any did. */
function applyToggles(root: HTMLElement, snap: Snapshot) {
  let changed = false
  for (const el of toggles(root)) {
    const want = snap[keyOf(el)]
    if (typeof want === 'boolean' && el.checked !== want && (want || el.type === 'checkbox')) { el.click(); changed = true }
  }
  return changed
}

function applyTyped(root: HTMLElement, snap: Snapshot) {
  for (const el of fieldsOf(root)) {
    if (el.type === 'radio' || el.type === 'checkbox') continue
    const want = snap[keyOf(el)]
    if (typeof want === 'string') setValue(el, want)
  }
}

/**
 * Radios and checkboxes first (they can change which fields show), then everything typed. Each step
 * waits a couple of frames and checks again, so it lands even if the form is still settling in.
 */
async function apply(root: HTMLElement, snap: Snapshot) {
  for (let i = 0; i < 3 && applyToggles(root, snap); i++) await frames()
  await frames()
  applyTyped(root, snap)
  await frames()
  applyTyped(root, snap)
}

const read = (key: string): Snapshot | null => {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch {
    return null
  }
}
const write = (key: string, snap: Snapshot | null) => {
  try {
    if (snap) sessionStorage.setItem(key, JSON.stringify(snap))
    else sessionStorage.removeItem(key)
  } catch {
    /* Private window or storage off: the form still works, it just won't remember. */
  }
}
const same = (a: Snapshot, b: Snapshot) => Object.keys({ ...a, ...b }).every((k) => (a[k] ?? '') === (b[k] ?? ''))

/**
 * Keeps what's typed in the form inside it for this browser tab, so leaving the page and coming back
 * doesn't lose it. The draft is dropped once the form saves (the page moves on with no error showing)
 * or when "Clear" is pressed.
 */
export function FormDraft({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const initial = useRef<Snapshot>({})
  const submitted = useRef(false)
  const restoring = useRef(false)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    initial.current = snapshot(root)
    const saved = read(storageKey)
    let alive = true
    if (saved && !same(saved, initial.current)) {
      restoring.current = true
      // A beat after mount, so the form's own handlers are in place before the values go back in.
      setTimeout(() => {
        if (!alive) return
        void apply(root, saved).finally(() => { restoring.current = false })
        setRestored(true)
      }, 60)
    }
    const onEdit = () => {
      if (restoring.current) return
      submitted.current = false
      // Wait a frame so fields that appear after a switch are included.
      requestAnimationFrame(() => {
        const now = snapshot(root)
        write(storageKey, same(now, initial.current) ? null : now)
      })
    }
    const onSubmit = () => { submitted.current = true }
    root.addEventListener('input', onEdit)
    root.addEventListener('change', onEdit)
    root.addEventListener('submit', onSubmit)
    return () => {
      alive = false
      root.removeEventListener('input', onEdit)
      root.removeEventListener('change', onEdit)
      root.removeEventListener('submit', onSubmit)
      // Leaving right after a submit with no error on screen means it saved.
      if (submitted.current && !root.querySelector('[role="alert"]')) write(storageKey, null)
    }
  }, [storageKey])

  function clear() {
    const root = ref.current
    write(storageKey, null)
    setRestored(false)
    if (!root) return
    restoring.current = true
    void apply(root, initial.current).finally(() => {
      restoring.current = false
      root.querySelector<Field>('input:not([type=hidden]), select, textarea')?.focus()
    })
  }

  return (
    <div ref={ref} className="stack ap-gap-3">
      {restored && (
        <p className="ap-draft-note" role="status">
          Draft restored.
          <button type="button" onClick={clear}>Clear<span className="sr-only"> the draft and start again</span></button>
        </p>
      )}
      {children}
    </div>
  )
}
