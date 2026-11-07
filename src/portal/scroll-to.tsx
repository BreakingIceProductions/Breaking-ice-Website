'use client'

import { useEffect } from 'react'

/** Brings a section into view once, e.g. the deposit right after signing. */
export function ScrollTo({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [id])
  return null
}
