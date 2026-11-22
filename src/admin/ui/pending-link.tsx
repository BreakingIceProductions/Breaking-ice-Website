'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ComponentProps } from 'react'

/**
 * The pending cue for in-page link switches (tabs, sort headers, filters, Money views). Put it inside any
 * next/link <Link>: while that link's page is loading, the link gets a small pulsing dot and, inside an
 * `.a-pending-scope`, the scope's `.a-pending-body` dims a little (after a short delay, so fast loads don't
 * flicker). Nothing moves under reduced motion; the dim still shows.
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  return <span className={`a-link-pending${pending ? ' on' : ''}`} aria-hidden="true" />
}

/**
 * A next/link <Link> with the pending cue built in. Same props as Link.
 * `<PendingLink href="?tab=money" className={on ? 'on' : ''}>Money</PendingLink>`
 */
export function PendingLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <LinkPending />
    </Link>
  )
}
