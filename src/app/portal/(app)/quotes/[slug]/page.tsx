import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/site'
import { requireAccess } from '@/portal/current'
import { addActivity, getPortalSettings, portalImage, producerFor } from '@/portal/data'
import { notifyJosh } from '@/portal/email'
import { CLIENT_STAGES, clientStage, today } from '@/portal/library'
import { PRE_PORTAL_STAGES } from '@/sanity/portal/office-constants'
import { PdfPages } from '@/portal/pdf-view'
import { QuoteReveal, ReplayReveal } from '@/portal/quote-reveal'
import { QuoteChoice, QuoteGlance, QuoteSign } from '@/portal/quote-sign'
import { fmtMoment, markQuoteViewed, quoteExpired } from '@/portal/quotes'
import { fmtDate, ProducerCard, StageBar } from '@/portal/ui'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const { quotes } = await requireAccess()
  const q = quotes.find((x) => x.slug === slug)
  return { title: q ? `Quote · ${q.title}` : 'Quote' }
}

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
  const money = (n: number) => `$${n.toLocaleString('en-CA', { maximumFractionDigits: 2 })}`
  const price = q.options?.length
    ? `${q.options.length > 1 ? 'From ' : ''}${money(Math.min(...q.options.map((o) => o.total)))} + GST`
    : q.total ? `${money(q.total)} + GST` : undefined
  const from = producer?.name ? { name: producer.name, photo: portalImage(producer.portrait, 160, 160) } : undefined

  return (
    <div className="wrap q-page">
      {!q.signature && !expired && (
        <QuoteReveal
          seenKey={`quote-reveal:${q.projectId}:v${q.version}`}
          pdfUrl={fileUrl}
          title={q.title}
          org={q.org}
          firstName={(session.preview ? client?.contacts?.[0]?.name : me?.name)?.split(' ')[0]}
          price={price}
          note={q.note}
          from={from}
        />
      )}
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

      <section className="p-where" aria-labelledby="where-h">
        <h2 id="where-h" className="p-label">Where we are</h2>
        <StageBar stage={clientStage(q.pipelineStage)} names={CLIENT_STAGES.map((s) => s.title)} />
      </section>

      <div className="q-grid">
        <section className="q-doc" aria-label="The quote">
          <PdfPages url={q.signature ? signedUrl : fileUrl} title={`Quote for ${q.title}`} />
          <div className="row-wrap">
            <a className="btn btn-secondary btn-sm" href={q.signature ? signedUrl : fileUrl} target="_blank" rel="noopener noreferrer">
              Open the PDF<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="text-link small" href={`${q.signature ? signedUrl : fileUrl}&download=1`}>Download{q.signature ? ' signed copy' : ''}</a>
            {!q.signature && !expired && <ReplayReveal />}
          </div>
        </section>

        <QuoteChoice>
        <aside className="q-side stack">
          {q.note && (
            <figure className="p-card q-note">
              <blockquote>{q.note}</blockquote>
              {from && <figcaption>{from.name}</figcaption>}
            </figure>
          )}
          <QuoteGlance
            options={q.options}
            total={q.total}
            depositPercent={q.depositPercent}
            deposit={q.deposit}
            summary={q.summary}
            includes={q.includes}
            version={q.version}
            signed={q.signature ? { option: q.signature.option, total: q.signature.total, deposit: q.signature.deposit } : undefined}
          />

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
        </QuoteChoice>
      </div>
    </div>
  )
}
