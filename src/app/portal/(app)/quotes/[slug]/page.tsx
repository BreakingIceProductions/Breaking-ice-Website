import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/site'
import { requireAccess } from '@/portal/current'
import { addActivity, getPortalSettings, producerFor } from '@/portal/data'
import { notifyJosh } from '@/portal/email'
import { quoteDeposit, today } from '@/portal/library'
import { PRE_PORTAL_STAGES } from '@/sanity/portal/office-constants'
import { QuoteSign } from '@/portal/quote-sign'
import { fmtMoment, markQuoteViewed, quoteExpired } from '@/portal/quotes'
import { fmtDate, ProducerCard } from '@/portal/ui'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const { quotes } = await requireAccess()
  const q = quotes.find((x) => x.slug === slug)
  return { title: q ? `Quote · ${q.title}` : 'Quote' }
}

const cad = (n?: number) => (n ? `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined)

export default async function QuotePage({ params }: Props) {
  const { slug } = await params
  const { quotes, clients, session } = await requireAccess()
  const q = quotes.find((x) => x.slug === slug)
  if (!q) notFound()
  const demo = Boolean(session.demo)
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)
  const client = clients.find((c) => c.organizationName === q.org) ?? clients[0]
  const producer = producerFor({ client }, await getPortalSettings())
  const expired = quoteExpired(q, today())
  const booked = !PRE_PORTAL_STAGES.includes((q.pipelineStage ?? 'lead') as (typeof PRE_PORTAL_STAGES)[number])

  // The first time the client opens it, Josh hears about it.
  if (!demo && !session.preview && !q.signature) {
    const who = me?.name || session.email
    const first = await markQuoteViewed(q.projectId, who).catch(() => false)
    if (first) {
      await addActivity(q.projectId, `${who} opened the quote`, 'view')
      await notifyJosh(`👀 ${who} opened the quote for ${q.title}. ${SITE_URL}/admin/projects/${q.projectId}`)
    }
  }

  const fileUrl = `/api/portal/quote/file?project=${encodeURIComponent(q.slug)}`
  const signedUrl = `${fileUrl}&signed=1`

  return (
    <div className="wrap q-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/portal/quotes">← All quotes</Link>
      </nav>

      <header className="q-head">
        <span className="eyebrow">{q.org}</span>
        <h1 className="h1">Quote · {q.title}</h1>
        <p className={`q-status ${q.signature ? 'q-status-signed' : expired ? 'q-status-expired' : ''}`}>
          <span className="billing-dot" aria-hidden="true" />
          {q.signature
            ? `Signed by ${q.signature.name} on ${fmtDate(q.signature.at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}`
            : expired
              ? `Expired ${fmtDate(q.validUntil, { month: 'long', day: 'numeric' })}. Reply to our email for a fresh one.`
              : `Ready for your signature${q.validUntil ? ` · valid until ${fmtDate(q.validUntil, { month: 'long', day: 'numeric' })}` : ''}`}
        </p>
      </header>

      <div className="q-grid">
        <section className="q-doc" aria-label="The quote">
          {demo ? (
            <div className="q-pdf q-pdf-sample"><p className="muted">The quote PDF appears here.</p></div>
          ) : (
            <iframe className="q-pdf" src={`${q.signature ? signedUrl : fileUrl}#view=FitH`} title={`Quote for ${q.title} (PDF)`} />
          )}
          <div className="row-wrap">
            <a className="btn btn-secondary btn-sm" href={q.signature ? signedUrl : fileUrl} target="_blank" rel="noopener noreferrer">
              Open the PDF<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="text-link small" href={`${q.signature ? signedUrl : fileUrl}&download=1`}>Download{q.signature ? ' signed copy' : ''}</a>
          </div>
        </section>

        <aside className="q-side stack">
          <section className="p-card q-summary" aria-labelledby="sum-h">
            <h2 id="sum-h" className="p-label">At a glance</h2>
            {q.signature?.option && <p className="small" style={{ margin: 0 }}>Package: <strong>{q.signature.option}</strong></p>}
            {!q.signature && q.options?.length ? (
              <ul className="q-packages">
                {q.options.map((o) => (
                  <li key={o._key}><span>{o.name}</span><strong>{cad(o.total)}</strong></li>
                ))}
                <li className="muted small">Before GST. You choose one when you sign.</li>
              </ul>
            ) : q.total ? (
              <p className="q-total">
                <span>{cad(q.total)}</span>
                <span className="muted small">+ GST</span>
              </p>
            ) : null}
            {q.signature?.deposit ? (
              <p className="small" style={{ margin: 0 }}>Deposit of {cad(q.signature.deposit)} + GST to book, then the balance on delivery.</p>
            ) : q.depositPercent ? (
              <p className="small" style={{ margin: 0 }}>A {q.depositPercent}% deposit books the project, then the balance on delivery.</p>
            ) : quoteDeposit(q.total, q) ? (
              <p className="small" style={{ margin: 0 }}>Deposit of {cad(quoteDeposit(q.total, q))} + GST to book, then the balance on delivery.</p>
            ) : null}
            {q.summary && <p style={{ margin: 0 }}>{q.summary}</p>}
            {q.includes && q.includes.length > 0 && (
              <>
                <h3 className="p-label">What’s included</h3>
                <ul className="q-includes">
                  {q.includes.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </>
            )}
            <p className="muted small" style={{ margin: 0 }}>The PDF has the full details{q.version > 1 ? ` (version ${q.version})` : ''}.</p>
          </section>

          {q.signature ? (
            <section className="p-card q-signed" aria-labelledby="signed-h">
              <h2 id="signed-h" className="p-label">Signed</h2>
              <p style={{ margin: 0 }}>
                <strong>{q.signature.name}</strong>{q.signature.title ? `, ${q.signature.title}` : ''}
                <br />
                <span className="muted small">{fmtMoment(q.signature.at)} · Certificate {q.signature.certificateId}</span>
              </p>
              <div className="row-wrap">
                {!demo && <a className="btn btn-primary btn-sm" href={`${signedUrl}&download=1`}>Download signed copy</a>}
                {booked && <Link className="text-link small" href={`/portal/${q.slug}`}>Go to your project →</Link>}
              </div>
            </section>
          ) : expired ? null : (
            <section className="p-card">
              <QuoteSign slug={q.slug} version={q.version} org={q.org} options={q.options} depositPercent={q.depositPercent} deposit={q.deposit} defaultName={me?.name ?? ''} defaultTitle={me?.role ?? ''} demo={demo} preview={Boolean(session.preview)} />
            </section>
          )}

          <ProducerCard producer={producer} title="Questions about the quote?" />
        </aside>
      </div>
    </div>
  )
}
