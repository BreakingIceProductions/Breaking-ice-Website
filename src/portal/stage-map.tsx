'use client'

import Link from 'next/link'
import { useId } from 'react'
import { usePopover } from './use-popover'

export type StageMapStage = { title: string; projects: { title: string; slug: string }[] }

/**
 * One timeline for a client with several projects: the same stages as a project's "Where we are",
 * with a numbered caret over each stage that has projects in it. Hover, focus or tap a number to see
 * (and open) the projects at that stage.
 */
export function StageMap({ stages }: { stages: StageMapStage[] }) {
  const { bind } = usePopover<number>()
  const uid = useId()
  const n = stages.length

  return (
    <ol className="stagebar stagemap" style={{ ['--n' as string]: n }} aria-label="Your projects by stage">
      {stages.map((s, i) => {
        const count = s.projects.length
        const state = count ? 'has' : 'empty'
        const pop = bind(i)
        const label = `${s.title}: ${count} project${count === 1 ? '' : 's'}`
        const align = i < 2 ? 'start' : i > n - 3 ? 'end' : 'mid'
        return (
          <li key={s.title} className={state}>
            <div className="sm-slot">
              {count > 0 && (
                <div className="sm-mark" {...pop.wrap}>
                  <button type="button" className="sm-btn" aria-label={label} aria-controls={`${uid}-${i}`} {...pop.button}>
                    {count}
                  </button>
                  <div id={`${uid}-${i}`} className={`sm-pop sm-pop-${align}`} hidden={!pop.isOpen}>
                    {count > 1 && <span className="sm-pop-h">{label}</span>}
                    <ul>
                      {s.projects.map((p) => (
                        <li key={p.slug}><Link href={`/portal/${p.slug}`}>{p.title}<span className="sm-go" aria-hidden="true">→</span></Link></li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <span className="bar" aria-hidden="true" />
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <span className="name">{s.title}</span>
          </li>
        )
      })}
    </ol>
  )
}
