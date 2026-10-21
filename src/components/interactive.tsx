'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ProjectCard, Testimonial } from '@/lib/types'
import { CATEGORY_LABELS } from '@/lib/video'
import { Mark } from './brand'

export function Testimonials({ items }: { items: Testimonial[] }) {
  const [i, setI] = useState(0)
  const t = items[i]
  if (!t) return null
  const n = items.length
  return (
    <figure className="testimonial" style={{ margin: 0 }}>
      <Mark size={52} right="var(--ink)" />
      <blockquote style={{ marginTop: 24 }} aria-live="polite">
        <span className={t.quote.startsWith('[') ? 'placeholder-text' : undefined}>{t.quote}</span>
      </blockquote>
      <figcaption>
        <span className="by">{t.name}</span>
        <span className="muted">{[t.role, t.organization].filter(Boolean).join(', ')}</span>
        {t.projectSlug && (
          <Link className="link-arrow" href={`/stories/${t.projectSlug}`} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            See the story <span aria-hidden="true">→</span>
          </Link>
        )}
      </figcaption>
      {n > 1 && (
        <div className="testimonial-nav">
          <button type="button" className="round-btn" aria-label="Previous testimonial" onClick={() => setI((i + n - 1) % n)}>←</button>
          <button type="button" className="round-btn" aria-label="Next testimonial" onClick={() => setI((i + 1) % n)}>→</button>
          <span className="dots" aria-hidden="true">
            {items.map((x, k) => <span key={x._id} className={k === i ? 'on' : ''} />)}
          </span>
          <span className="sr-only">Testimonial {i + 1} of {n}</span>
        </div>
      )}
    </figure>
  )
}

export function Checklist({ situations, closing, cta }: { situations: string[]; closing: string; cta: string }) {
  const [on, setOn] = useState<boolean[]>(() => situations.map(() => false))
  const any = on.some(Boolean)
  return (
    <div className="checklist">
      {situations.map((s, k) => (
        <label key={k} className="check">
          <input type="checkbox" checked={on[k]} onChange={() => setOn((o) => o.map((v, j) => (j === k ? !v : v)))} />
          <span className={s.startsWith('[') ? 'placeholder-text' : undefined}>{s}</span>
        </label>
      ))}
      <div aria-live="polite">
        {any && (
          <div className="reveal dark">
            <p className="body-lg" style={{ margin: 0 }}>{closing}</p>
            <Link href="/contact" className="btn btn-primary">{cta}</Link>
          </div>
        )}
      </div>
    </div>
  )
}

/** Category filter chips for the Stories page. The choice is kept in the URL (?category=…) so it can be shared. */
export function useCategoryFilter(projects: ProjectCard[], initial: string | null) {
  const [cat, setCat] = useState<string | null>(initial)
  const select = (c: string | null) => {
    setCat(c)
    const url = new URL(window.location.href)
    if (c) url.searchParams.set('category', c)
    else url.searchParams.delete('category')
    window.history.replaceState(null, '', url)
  }
  const list = cat ? projects.filter((p) => p.category === cat) : projects
  return { cat, select, list, setCat }
}

export function CategoryChips({ cat, select, count }: { cat: string | null; select: (c: string | null) => void; count: number }) {
  return (
    <div className="chips" role="group" aria-label="Filter by category">
      <button type="button" className="chip" aria-pressed={cat === null} onClick={() => select(null)}>All</button>
      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
        <button key={value} type="button" className="chip" aria-pressed={cat === value} onClick={() => select(value)}>
          {label}
        </button>
      ))}
      <span className="count" aria-live="polite">{count} {count === 1 ? 'story' : 'stories'}</span>
    </div>
  )
}
