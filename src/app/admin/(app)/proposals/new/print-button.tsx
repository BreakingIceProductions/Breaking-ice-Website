'use client'

import { useEffect, useState } from 'react'

/**
 * Prints the client's Investment table (admin-pages.css keeps everything else off the page); "Save as PDF"
 * is in the print dialog. It sits right under "What the client sees" and stays off until a package has a
 * deliverable, read from that table (the builder keeps its own state).
 */
export function PrintQuote() {
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const section = document.getElementById('pb-h-prev')?.closest('section')
    if (!section) return
    // The table shows a single "Nothing in a package yet." row (one cell across) until something is in a package.
    const check = () => setFilled([...section.querySelectorAll('tbody tr')].some((tr) => !tr.querySelector('td[colspan]')))
    check()
    const watch = new MutationObserver(check)
    watch.observe(section, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])
  return (
    <div className="pb-print-row">
      <button type="button" className="btn btn-primary" disabled={!filled} aria-describedby="pb-print-why" onClick={() => window.print()}>
        Print or save as PDF
      </button>
      <p id="pb-print-why" className="pb-print-why sr-only">
        {filled ? 'Prints just the table above, ready to save as a PDF and drop into the quote.' : 'Put a deliverable in a package first; then the table above can be printed.'}
      </p>
    </div>
  )
}
