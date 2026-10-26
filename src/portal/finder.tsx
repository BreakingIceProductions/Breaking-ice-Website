'use client'

import { useEffect, useRef } from 'react'

export type Dot = 'awaiting' | 'changes' | 'approved' | 'final' | 'hidden'

export type FinderNode = {
  id: string
  label: string
  /** Small orange line above the label (a project's start date). */
  kicker?: string
  /** Small grey line under the label. */
  meta?: string
  /** Greyed out (an older version the client can't open). Still selectable on Josh's side. */
  dim?: boolean
  /** Can't be opened at all. */
  locked?: boolean
  dot?: Dot
  /** Title of the column this node's children appear in. */
  childTitle?: string
  children?: FinderNode[]
}

const DOT_LABEL: Record<Dot, string> = {
  awaiting: 'Waiting for feedback',
  changes: 'Changes in progress',
  approved: 'Approved',
  final: 'Final',
  hidden: 'Hidden from the client',
}

const Chevron = () => (
  <svg className="fd-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

const Folder = () => (
  <svg className="fd-folder" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </svg>
)

/**
 * Columns like the Mac Finder: each selection opens the next column to the right, and the
 * last column shows the selected item. On phones it's one column at a time with a back button.
 */
export function Finder({
  rootTitle,
  root,
  path,
  onPath,
  panel,
  panelTitle,
}: {
  rootTitle: string
  root: FinderNode[]
  path: string[]
  onPath: (path: string[]) => void
  panel?: React.ReactNode
  panelTitle?: string
}) {
  // Build the visible columns from the selected path.
  const columns: { title: string; nodes: FinderNode[]; selected?: string }[] = []
  let nodes: FinderNode[] | undefined = root
  let title = rootTitle
  for (let depth = 0; nodes; depth++) {
    const sel = path[depth]
    columns.push({ title, nodes, selected: sel })
    const picked: FinderNode | undefined = nodes.find((n) => n.id === sel)
    if (!picked?.children) break
    title = picked.childTitle ?? ''
    nodes = picked.children
  }

  const scroller = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    // Keep the newest column in view, like Finder does (instantly on first load).
    const el = scroller.current
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: first.current ? 'auto' : 'smooth' })
    first.current = false
  }, [path.join('/')])

  const depthShown = Math.min(path.length, columns.length - 1)
  const showPanelOnPhone = Boolean(panel) && path.length >= columns.length

  return (
    <div className={`finder${showPanelOnPhone ? ' fd-phone-panel' : ''}`} data-depth={depthShown}>
      <div className="fd-cols" ref={scroller}>
        {columns.map((col, i) => (
          <section key={i} className={`fd-col${i === depthShown && !showPanelOnPhone ? ' fd-phone-current' : ''}`} aria-label={col.title}>
            <header className="fd-head">
              {i > 0 && (
                <button type="button" className="fd-back" onClick={() => onPath(path.slice(0, i - 1))} aria-label="Back">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
              )}
              <h3>{col.title}</h3>
            </header>
            {col.nodes.length ? (
              <ul role="list">
                {col.nodes.map((n) => {
                  const on = n.id === col.selected
                  // A version the client can't open is just text: no button, nothing to click.
                  if (n.locked)
                    return (
                      <li key={n.id}>
                        <div className="fd-row fd-text-only" title="An older version. Ask Breaking Ice if you need it.">
                          <span className="fd-text">
                            <span className="fd-label">{n.label}</span>
                            {n.meta && <span className="fd-meta">{n.meta}</span>}
                          </span>
                        </div>
                      </li>
                    )
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`fd-row${on ? ' on' : ''}${n.dim ? ' dim' : ''}`}
                        aria-current={on ? 'true' : undefined}
                        disabled={n.locked}
                        title={n.locked ? 'An older version. Ask Breaking Ice if you need it.' : undefined}
                        onClick={() => onPath([...path.slice(0, i), n.id])}
                      >
                        {n.children && <Folder />}
                        <span className="fd-text">
                          {n.kicker && <span className="fd-kicker">{n.kicker}</span>}
                          <span className="fd-label">{n.label}</span>
                          {n.meta && <span className="fd-meta">{n.meta}</span>}
                        </span>
                        {n.dot && <span className={`fd-dot fd-dot-${n.dot}`} role="img" aria-label={DOT_LABEL[n.dot]} title={DOT_LABEL[n.dot]} />}
                        {n.children && <Chevron />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="fd-empty">Nothing here yet.</p>
            )}
          </section>
        ))}
        {panel && (
          <section className={`fd-panel${showPanelOnPhone ? ' fd-phone-current' : ''}`} aria-label={panelTitle ?? 'Details'}>
            <header className="fd-head fd-panel-head">
              <button type="button" className="fd-back" onClick={() => onPath(path.slice(0, -1))} aria-label="Back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <h3>{panelTitle ?? 'Details'}</h3>
            </header>
            <div className="fd-panel-body">{panel}</div>
          </section>
        )}
      </div>
    </div>
  )
}
