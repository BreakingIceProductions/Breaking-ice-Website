'use client'

import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'

/**
 * Hover-or-tap popovers (the home page's stage markers, the notifications bell). Mouse hover opens one
 * and leaving closes it; focus opens it; a click or tap pins it open (again closes it). Escape closes
 * and returns focus to the trigger; a click outside or tabbing away closes it. One open at a time.
 *
 * `bind(key)` returns props for the wrapper (trigger + panel) and for the trigger button.
 */
export function usePopover<K extends string | number>() {
  const [open, setOpen] = useState<K | null>(null)
  const [pinned, setPinned] = useState(false)
  const wraps = useRef(new Map<K, HTMLElement>())

  const close = () => { setOpen(null); setPinned(false) }

  useEffect(() => {
    if (open === null) return
    const wrap = wraps.current.get(open)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      wrap?.querySelector<HTMLButtonElement>('button')?.focus()
      setOpen(null)
      setPinned(false)
    }
    const onDown = (e: globalThis.PointerEvent) => {
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return
      setOpen(null)
      setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const bind = (key: K) => {
    const isOpen = open === key
    return {
      isOpen,
      wrap: {
        ref: (el: HTMLElement | null) => { if (el) wraps.current.set(key, el); else wraps.current.delete(key) },
        onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse' && !pinned) setOpen(key) },
        onPointerLeave: (e: PointerEvent) => { if (e.pointerType === 'mouse' && !pinned && open === key) setOpen(null) },
        onBlur: (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && open === key) close() },
      },
      button: {
        'aria-expanded': isOpen,
        onFocus: () => { if (open !== key) { setOpen(key); setPinned(false) } },
        onClick: () => { if (isOpen && pinned) close(); else { setOpen(key); setPinned(true) } },
      },
    }
  }

  return { bind, close }
}
