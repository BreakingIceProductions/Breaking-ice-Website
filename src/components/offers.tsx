import Link from 'next/link'
import type { Offer } from '@/lib/types'

/**
 * The three offers as a rising staircase: each step sits a little higher than the one before, read left to right.
 * The featured offer (Story Kit by default) is the emphasised, navy step. Not a pricing table: no prices, no ticks.
 */
export function OfferLadder({ offers, headingLevel = 'h3' }: { offers: Offer[]; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel
  return (
    <ol className="offer-ladder" style={{ ['--steps' as string]: offers.length }}>
      {offers.map((o, i) => {
        const main = Boolean(o.featured)
        return (
          <li key={o._id} className={`offer-step${main ? ' is-main' : ''}`} style={{ ['--i' as string]: i }}>
            <Link href={`/services/${o.slug}`} className={`offer-step-link${main ? ' dark' : ''}`}>
              <span className="offer-step-top">
                <span className="step-num">0{i + 1}</span>
                {o.badge && <span className="offer-badge">{o.badge}</span>}
              </span>
              <H className="h3 offer-step-name">{o.name}</H>
              {(o.ladderLine || o.oneLiner) && <p className="offer-step-line">{o.ladderLine || o.oneLiner}</p>}
              {o.ladderBlurb && <p className="offer-step-blurb">{o.ladderBlurb}</p>}
              <span className="link-arrow">{o.ladderLink || o.name} <span aria-hidden="true">→</span></span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/** A list item whose opening short sentence ("A plan first. We agree…") is set in bold. Plain items stay plain. */
export function LeadItem({ text }: { text: string }) {
  const m = text.match(/^([^.]{2,60}\.)\s+(.+)$/)
  if (!m) return <>{text}</>
  return (
    <span>
      <strong>{m[1]}</strong> {m[2]}
    </span>
  )
}
