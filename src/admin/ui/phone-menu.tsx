'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * The Menu button in the phone top bar and the sheet it opens. The sheet is a modal <dialog>, so focus stays
 * inside it, Escape closes it, and so does a tap on the backdrop or moving to another page. Focus goes back to
 * the Menu button when it closes.
 */
export function PhoneMenu({ children, foot }: { children: React.ReactNode; foot?: React.ReactNode }) {
  const sheet = useRef<HTMLDialogElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const path = usePathname()

  useEffect(() => {
    if (sheet.current?.open) sheet.current.close()
  }, [path])

  // A wide window (rotating a tablet) has the sidebar again: close the sheet.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 821px)')
    const onChange = () => { if (mq.matches && sheet.current?.open) sheet.current.close() }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <>
      <button ref={button} type="button" className="a-top-btn" aria-haspopup="dialog" aria-controls="a-sheet" onClick={() => sheet.current?.showModal()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span>Menu</span>
      </button>
      <dialog
        ref={sheet}
        id="a-sheet"
        className="a-sheet"
        aria-labelledby="a-sheet-h"
        onClose={(e) => e.target === e.currentTarget && requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
          // Following a link to the page you're already on doesn't change the path; close anyway.
          else if ((e.target as HTMLElement).closest('a[href^="/admin"]')) e.currentTarget.close()
        }}
      >
        <div className="a-sheet-head">
          <h2 id="a-sheet-h">Menu</h2>
          <button type="button" className="a-top-btn is-icon" aria-label="Close menu" onClick={() => sheet.current?.close()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="a-sheet-body">{children}</div>
        {foot && <div className="a-sheet-foot">{foot}</div>}
      </dialog>
    </>
  )
}
