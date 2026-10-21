'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/** The key the contact form reads once on load (see contact-form.tsx). */
export const PREFILL_KEY = 'bi-contact-prefill'

/**
 * A link to /contact that hands the visitor's details to the form through sessionStorage,
 * so a name and email never ride along in the URL (history, logs, analytics).
 */
export function PrefillContactLink({ prefill, className, children }: { prefill: Record<string, string>; className?: string; children: ReactNode }) {
  return (
    <Link
      className={className}
      href="/contact"
      onClick={() => {
        try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill)) } catch {}
      }}
    >
      {children}
    </Link>
  )
}
