import Link from 'next/link'
import { urlFor } from '@/sanity/client'
import { CATEGORY_LABELS } from '@/lib/video'
import type { Location, ProjectCard, Service } from '@/lib/types'
import { Still } from './brand'
import { VideoLoop } from './video'

export function StoryCard({ p, priority }: { p: ProjectCard; priority?: boolean }) {
  const poster = p.thumbnail?.asset ? urlFor(p.thumbnail).width(900).height(675).fit('crop').url() : null
  const isPhoto = p.storyType === 'photo'
  return (
    <Link href={`/stories/${p.slug}`} className="card">
      <div className="card-frame">
        {p.category && <span className="tag">{CATEGORY_LABELS[p.category] ?? p.category}</span>}
        {isPhoto ? (
          <Still image={p.thumbnail} label="Photo story" />
        ) : (
          <VideoLoop url={p.cardVideo} posterUrl={poster} posterAlt={p.thumbnail?.alt} label="Preview loop" className="ratio-43" priority={priority} hoverOnly />
        )}
      </div>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <span className="card-meta">
          {[p.client, p.location].filter(Boolean).join(' · ')}
          {isPhoto && <span aria-hidden="true">· Photo story</span>}
        </span>
        <h3 className="card-title">{p.title}</h3>
      </div>
    </Link>
  )
}

export function ServiceCard({ s }: { s: Service }) {
  if (s.showAsFullCard === false) {
    return (
      <Link href={`/services/${s.slug}`} className="svc-card svc-also">
        <div className="body">
          <span className="eyebrow">Also</span>
          <h3 className="h3">{s.title}</h3>
          {s.summary && <p className="muted" style={{ margin: 0 }}>{s.summary}</p>}
          <span className="link-arrow">{s.title} <span aria-hidden="true">→</span></span>
        </div>
      </Link>
    )
  }
  return (
    <Link href={`/services/${s.slug}`} className="svc-card">
      <Still image={s.cardImage} label={s.title} ratio="ratio-169" width={900} />
      <div className="body">
        <h3 className="h3">{s.title}</h3>
        {s.summary && <p className="muted" style={{ margin: 0 }}>{s.summary}</p>}
        <span className="link-arrow">Learn more <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  )
}

export function LocationCard({ l }: { l: Location }) {
  return (
    <Link href={`/${l.slug}`} className="loc-card">
      <Still image={l.cardImage} label={l.title} ratio="ratio-169" />
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">{l.baseLine}</span>
        <h3 className="h2">{l.title}</h3>
        {l.summary && <p className="muted" style={{ margin: 0 }}>{l.summary}</p>}
      </div>
    </Link>
  )
}
