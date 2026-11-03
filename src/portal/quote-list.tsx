import Link from 'next/link'
import { quoteExpired } from './quotes'
import type { PortalQuote } from './types'
import { fmtDate } from './ui'

/** Quotes as rows, for the dashboard and the Quotes page. */
export function QuoteList({ id, label, quotes, t }: { id: string; label: string; quotes: PortalQuote[]; t: string }) {
  return (
    <section aria-labelledby={id} className="p-home-sec">
      <h2 id={id} className="p-label">{label}</h2>
      <ul className="lib-list">
        {quotes.map((q) => <QuoteRow key={q.projectId} q={q} t={t} />)}
      </ul>
    </section>
  )
}

function QuoteRow({ q, t }: { q: PortalQuote; t: string }) {
  const expired = quoteExpired(q, t)
  const status = q.signature
    ? `Signed ${fmtDate(q.signature.at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}`
    : expired ? 'Expired' : q.validUntil ? `Valid until ${fmtDate(q.validUntil, { month: 'short', day: 'numeric' })}` : 'Ready to sign'
  return (
    <li>
      <Link className="lib-row" href={`/portal/quotes/${q.slug}`}>
        <span className={`fd-dot ${q.signature ? 'fd-dot-approved' : expired ? '' : 'fd-dot-awaiting'}`} aria-hidden="true" />
        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
          <strong>{q.title}</strong>
          <span className="muted small">{[q.org, status].join(' · ')}</span>
        </span>
        <span className="lib-row-go" aria-hidden="true">→</span>
      </Link>
    </li>
  )
}
