'use client'

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mark } from '@/components/brand'
import type { QuoteStoryConfig, StoryOption, StorySection } from './stories/types'

const money = (n: number) => `$${n.toLocaleString('en-CA')}`

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Story first, then the quote. Progress is remembered per quote version, so someone who has
 * read the story lands on the proposal next time. ?story or "Back to the walkthrough" reopens it.
 */
export function StoryGate({ storageKey, story, children }: { storageKey: string; story: QuoteStoryConfig; children: React.ReactNode }) {
  const [stage, setStage] = useState<'loading' | 'story' | 'quote'>('loading')

  useEffect(() => {
    const forced = new URLSearchParams(location.search).has('story')
    setStage(forced || read(storageKey) !== 'proposal' ? 'story' : 'quote')
    const reopen = () => setStage('story')
    window.addEventListener('quote-story', reopen)
    return () => window.removeEventListener('quote-story', reopen)
  }, [storageKey])

  const done = useCallback(() => {
    write(storageKey, 'proposal')
    const u = new URL(location.href)
    if (u.searchParams.has('story')) {
      u.searchParams.delete('story')
      history.replaceState(null, '', u.toString())
    }
    window.scrollTo({ top: 0 })
    setStage('quote')
  }, [storageKey])

  if (stage === 'loading') return <div className="qst-wait" aria-hidden="true" />
  if (stage === 'story') return <QuoteStory story={story} onDone={done} />
  return <>{children}</>
}

/** Small link on the quote page that brings the walkthrough back. */
export function ReplayStory() {
  return (
    <button type="button" className="linklike small" onClick={() => window.dispatchEvent(new Event('quote-story'))}>
      ← Back to the walkthrough
    </button>
  )
}

function QuoteStory({ story, onDone }: { story: QuoteStoryConfig; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    document.documentElement.style.overflow = 'hidden'
    el.focus({ preventScroll: true })
    const items = el.querySelectorAll<HTMLElement>('.qst-rv')
    let io: IntersectionObserver | undefined
    if (reduced() || !('IntersectionObserver' in window)) items.forEach((i) => i.classList.add('in'))
    else {
      io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io!.unobserve(e.target))), { root: el, rootMargin: '0px 0px -12% 0px', threshold: 0.08 })
      items.forEach((i) => io!.observe(i))
    }
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = el.scrollHeight - el.clientHeight
        bar.current?.style.setProperty('--p', String(max > 0 ? el.scrollTop / max : 0))
        if (!reduced()) el.style.setProperty('--y', String(Math.min(el.scrollTop, el.clientHeight * 1.2)))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      document.documentElement.style.overflow = ''
      el.removeEventListener('scroll', onScroll)
      io?.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={root} className="qst" tabIndex={-1} role="region" aria-label={`Walkthrough: ${story.title}`}>
      <div className="qst-top">
        <span className="qst-brand"><Mark size={22} right="#faf7f2" /> <span>Breaking Ice Productions</span></span>
        <button type="button" className="qst-skip" onClick={onDone}>Skip to the proposal →</button>
        <div ref={bar} className="qst-progress" aria-hidden="true" />
      </div>
      <article className="qst-body">
        {story.sections.map((s, i) => <Section key={i} s={s} onDone={onDone} />)}
      </article>
    </div>
  )
}

function Section({ s, onDone }: { s: StorySection; onDone: () => void }) {
  switch (s.kind) {
    case 'hero':
      return (
        <header className="qst-hero">
          <img className="qst-hero-img" src={s.image.src} alt={s.image.alt} style={{ objectPosition: s.image.focus }} fetchPriority="high" />
          <div className="qst-hero-shade" />
          <div className="qst-hero-in">
            <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
            <h1 className="qst-title qst-rv">{s.title}</h1>
            <p className="qst-sub qst-rv">{s.subtitle}</p>
            <blockquote className="qst-opener qst-rv">
              <p>{s.opener}</p>
              {s.from && <footer>{s.from}</footer>}
            </blockquote>
          </div>
          <span className="qst-scroll" aria-hidden="true">Scroll</span>
        </header>
      )
    case 'stats':
      return (
        <section className="qst-sec qst-stats" aria-labelledby={id(s.title)}>
          <div className="qst-wrap">
            <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
            <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
            <dl className="qst-stat-row">
              {s.stats.map((x, i) => (
                <div key={x.value} className="qst-stat qst-rv" style={{ '--d': i } as React.CSSProperties}>
                  <dt>{x.value}</dt>
                  <dd>{x.label}</dd>
                </div>
              ))}
            </dl>
            {s.body && <p className="qst-lede qst-rv">{s.body}</p>}
          </div>
          {s.image && (
            <figure className="qst-band qst-rv">
              <img src={s.image.src} alt={s.image.alt} loading="lazy" style={{ objectPosition: s.image.focus }} />
            </figure>
          )}
        </section>
      )
    case 'films':
      return (
        <section className="qst-sec qst-films dark" aria-labelledby={id(s.title)}>
          <div className="qst-wrap">
            <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
            <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
            {s.body && <p className="qst-lede qst-rv">{s.body}</p>}
            <ul className="qst-film-list">
              {s.films.map((f, i) => (
                <li key={f.url} className="qst-film qst-rv" style={{ '--d': i } as React.CSSProperties}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <span className="qst-film-poster">
                      <img src={f.poster.src} alt={f.poster.alt} loading="lazy" />
                      <span className="qst-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
                    </span>
                    <span className="qst-film-text">
                      <strong>{f.title}{f.year ? <span className="qst-film-year"> · {f.year}</span> : null}</strong>
                      <span>{f.blurb}</span>
                      <span className="qst-film-link">Watch on Vimeo<span className="sr-only"> (opens in a new tab)</span> ↗</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )
    case 'text-image':
      return (
        <section className={`qst-sec qst-ti${s.side === 'left' ? ' qst-ti-left' : ''}`} aria-labelledby={id(s.title)}>
          <div className="qst-wrap qst-ti-grid">
            <div className="qst-ti-text">
              <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
              <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
              {s.paragraphs.map((p) => <p key={p} className="qst-p qst-rv">{p}</p>)}
              {s.quote && <p className="qst-pull qst-rv">{s.quote}</p>}
            </div>
            <figure className="qst-ti-img qst-rv">
              <img src={s.image.src} alt={s.image.alt} loading="lazy" style={{ objectPosition: s.image.focus }} />
            </figure>
          </div>
        </section>
      )
    case 'kinds':
      return (
        <section className="qst-sec qst-kinds" aria-labelledby={id(s.title)}>
          <div className="qst-wrap">
            <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
            <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
            {s.body && <p className="qst-lede qst-rv">{s.body}</p>}
            <ul className="qst-kind-list">
              {s.kinds.map((k, i) => (
                <li key={k.name} className="qst-kind qst-rv" style={{ '--d': i } as React.CSSProperties}>
                  <img src={k.image.src} alt={k.image.alt} loading="lazy" />
                  <div>
                    <h3>{k.name}</h3>
                    <p>{k.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            {s.footnote && <p className="qst-foot qst-rv">{s.footnote}</p>}
          </div>
        </section>
      )
    case 'gallery':
      return (
        <section className="qst-gallery" aria-label="Photos from our Imperial work">
          <div className="qst-gallery-row">
            {s.images.map((im, i) => (
              <figure key={im.src} className="qst-rv" style={{ '--d': i } as React.CSSProperties}>
                <img src={im.src} alt={im.alt} loading="lazy" style={{ objectPosition: im.focus }} />
              </figure>
            ))}
          </div>
          {s.caption && <p className="qst-gallery-cap qst-rv">{s.caption}</p>}
        </section>
      )
    case 'options':
      return <Options s={s} />
    case 'buyout':
      return (
        <section className="qst-sec qst-buyout dark" aria-labelledby={id(s.title)}>
          <div className="qst-wrap qst-ti-grid">
            <div>
              <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
              <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
              {s.paragraphs.map((p) => <p key={p} className="qst-p qst-rv">{p}</p>)}
              {s.prices && (
                <table className="qst-bo qst-rv">
                  <caption className="sr-only">Media buyout prices</caption>
                  <thead><tr><th scope="col"><span className="sr-only">Option</span></th><th scope="col">Booked with the retainer (50%)</th><th scope="col">Added later (75%)</th></tr></thead>
                  <tbody>{s.prices.map((p) => <tr key={p.name}><th scope="row">{p.name}</th><td>{p.now}</td><td>{p.later}</td></tr>)}</tbody>
                </table>
              )}
            </div>
            <aside className="qst-archive qst-rv" aria-labelledby="qst-archive-h">
              <p className="qst-eyebrow">One-time offer</p>
              <h3 id="qst-archive-h">{s.archive.title}</h3>
              <p className="qst-archive-price">
                <span className="qst-was"><span className="sr-only">Was </span>{money(s.archive.later)}</span>
                <strong>{money(s.archive.price)}</strong>
                <span className="small">with the 2027 buyout</span>
              </p>
              <p>{s.archive.body}</p>
            </aside>
          </div>
        </section>
      )
    case 'billing':
      return (
        <section className="qst-sec qst-billing" aria-labelledby={id(s.title)}>
          <div className="qst-wrap">
            <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
            <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
            <ol className="qst-steps">
              {s.points.map((p, i) => (
                <li key={p.title} className="qst-rv" style={{ '--d': i } as React.CSSProperties}>
                  <strong>{p.title}</strong>
                  <span>{p.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )
    case 'close':
      return (
        <section className="qst-close dark" aria-labelledby={id(s.title)}>
          <img src={s.image.src} alt="" loading="lazy" style={{ objectPosition: s.image.focus }} />
          <div className="qst-close-shade" />
          <div className="qst-wrap qst-close-in">
            <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
            <blockquote className="qst-note qst-rv">
              <p>{s.note}</p>
              <footer>— {s.from}</footer>
            </blockquote>
            <div className="qst-rv">
              <button type="button" className="btn btn-primary qst-cta" onClick={onDone}>{s.cta} →</button>
              <p className="qst-after">Next: the full proposal, then choose your option and sign. Nothing is due today.</p>
            </div>
          </div>
        </section>
      )
  }
}

function Options({ s }: { s: Extract<StorySection, { kind: 'options' }> }) {
  const [pick, setPick] = useState(s.recommended ?? 0)
  const [buyout, setBuyout] = useState(false)
  const o: StoryOption = s.options[pick]
  return (
    <section className="qst-sec qst-options" aria-labelledby={id(s.title)}>
      <div className="qst-wrap">
        <p className="qst-eyebrow qst-rv">{s.eyebrow}</p>
        <h2 id={id(s.title)} className="qst-h2 qst-rv">{s.title}</h2>
        {s.body && <p className="qst-lede qst-rv">{s.body}</p>}

        <div className="qst-opt-cards qst-rv" role="radiogroup" aria-label="Options">
          {s.options.map((x, i) => (
            <button key={x.name} type="button" role="radio" aria-checked={pick === i} className={`qst-opt${pick === i ? ' on' : ''}`} onClick={() => setPick(i)}>
              <span className="qst-opt-name">{x.name}{s.recommended === i && <span className="qst-opt-tag">Most like 2026</span>}</span>
              <span className="qst-opt-price">{money(buyout ? x.monthly + x.buyoutMonthly : x.monthly)}<span>/mo</span></span>
              <span className="qst-opt-note">{x.note}</span>
            </button>
          ))}
        </div>

        <label className="qst-toggle qst-rv">
          <input type="checkbox" checked={buyout} onChange={(e) => setBuyout(e.target.checked)} />
          <span className="qst-switch" aria-hidden="true" />
          <span>Show with the media buyout booked at signing (50%)</span>
        </label>

        <div className="qst-table-wrap qst-rv">
          <table className={`qst-table pick-${pick}`}>
            <caption className="sr-only">What each option includes. {o.name} is selected.</caption>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Item</span></th>
                {s.options.map((x, i) => <th key={x.name} scope="col" className={pick === i ? 'on' : undefined}>{x.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <Row label="Monthly" vals={s.options.map((x) => money(x.monthly))} pick={pick} strong />
              <Row label="Annual" vals={s.options.map((x) => money(x.annual))} pick={pick} />
              <Row label="Same work, piece by piece" vals={s.options.map((x) => money(x.pieceByPiece))} pick={pick} muted />
              <Row label="You save" vals={s.options.map((x) => money(x.save))} pick={pick} accent />
              {buyout && <Row label="Media buyout, booked now (50%)" vals={s.options.map((x) => `+${money(x.buyoutMonthly)}/mo · ${money(x.buyoutAnnual)}`)} pick={pick} />}
              {buyout && <Row label="Media buyout, added later (75%)" vals={s.options.map((x) => money(x.buyoutLater))} pick={pick} />}
              {buyout && <Row label="Monthly with the buyout" vals={s.options.map((x) => money(x.monthly + x.buyoutMonthly))} pick={pick} strong />}
              {s.rows.map((r, ri) => <Row key={r} label={r} vals={s.options.map((x) => String(x.counts[ri]))} pick={pick} />)}
            </tbody>
          </table>
        </div>
        <p className="qst-foot qst-rv" aria-live="polite">
          {o.name}: {money(buyout ? o.monthly + o.buyoutMonthly : o.monthly)} a month for 12 months{buyout ? ', with the buyout' : ''}. Before tax.
          {buyout ? ` Added later in the year, the buyout would be ${money(o.buyoutLater)}.` : ''}
        </p>
        {s.footnote && <p className="qst-foot qst-rv">{s.footnote}</p>}
      </div>
    </section>
  )
}

function Row({ label, vals, pick, strong, muted, accent }: { label: string; vals: string[]; pick: number; strong?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <tr className={`${strong ? 'strong' : ''}${muted ? ' muted' : ''}${accent ? ' accent' : ''}`}>
      <th scope="row">{label}</th>
      {vals.map((v, i) => <td key={i} className={pick === i ? 'on' : undefined}>{v}</td>)}
    </tr>
  )
}

const id = (t: string) => `qst-${t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
