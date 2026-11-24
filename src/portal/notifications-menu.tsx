'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { NoticeGroup } from './notifications'
import { usePopover } from './use-popover'

/** The top bar's bell: hover, focus or tap for everything waiting on the client, grouped by project. */
export function NotificationsMenu({ groups, count }: { groups: NoticeGroup[]; count: number }) {
  const { bind, close } = usePopover<'bell'>()
  const pop = bind('bell')
  const id = useId()
  const label = count ? `Notifications: ${count} waiting for you` : 'Notifications: you’re all caught up'

  return (
    <div className="nt-wrap" {...pop.wrap}>
      <button type="button" className="theme-btn nt-btn" aria-label={label} aria-controls={id} {...pop.button}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && <span className="nt-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </button>
      <div id={id} className="nt-panel" hidden={!pop.isOpen}>
        <p className="nt-head">Notifications</p>
        {groups.length ? (
          groups.map((g) => (
            <section key={g.key} className="nt-group" aria-labelledby={`${id}-${g.key}`}>
              <h3 id={`${id}-${g.key}`} className="nt-group-h">{g.title}</h3>
              <ul>
                {g.items.map((it) => (
                  <li key={it.key}>
                    <Link className="nt-item" href={it.href} onClick={close}>
                      <span className="fd-dot fd-dot-awaiting" aria-hidden="true" />
                      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                        <strong>{it.label}</strong>
                        {it.sub && <span className="muted small">{it.sub}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="nt-empty muted">You’re all caught up.</p>
        )}
      </div>
    </div>
  )
}
