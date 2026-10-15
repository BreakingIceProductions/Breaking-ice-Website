'use client'

import { Analytics } from '@vercel/analytics/next'
import { track } from '@vercel/analytics'
import { useEffect } from 'react'

/**
 * Page views (Vercel Web Analytics) plus the clicks that count as leads:
 * email, phone and booking-link clicks anywhere on the site.
 * Records nothing until Web Analytics is enabled for the project in Vercel.
 */
export function Tracking({ bookingLink }: { bookingLink?: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a) return
      const href = a.getAttribute('href') || ''
      const page = window.location.pathname
      if (href.startsWith('mailto:')) track('Email click', { page })
      else if (href.startsWith('tel:')) track('Phone click', { page })
      else if ((bookingLink && href === bookingLink) || /calendar\.(app\.)?google\.com|calendar\.google\.com\/calendar\/appointments/.test(href))
        track('Booking link click', { page })
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [bookingLink])
  return <Analytics />
}
