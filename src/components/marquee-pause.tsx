'use client'

import { useState } from 'react'

/** Pause / play for the logo marquee (WCAG 2.2.2): toggles .paused on the strip it sits beside. */
export function MarqueePause({ target }: { target: string }) {
  const [paused, setPaused] = useState(false)
  const toggle = () => {
    document.getElementById(target)?.classList.toggle('paused', !paused)
    setPaused(!paused)
  }
  return (
    <button type="button" className="marquee-pause" onClick={toggle} aria-pressed={paused} aria-controls={target}>
      {paused ? 'Play logos' : 'Pause logos'}
    </button>
  )
}
