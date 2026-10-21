import { Eyebrow } from '@/components/brand'
import { PhoneLink, RichText, blockText, headingId } from '@/components/sections'
import { getLegal, getSettings } from '@/lib/data'

/** "2026-10-16" → "October 16, 2026". Dates are stored without a time, so read them as UTC. */
const formatDate = (value?: string) => {
  if (!value) return '[date]'
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function LegalPage({ slug, title }: { slug: string; title: string }) {
  const [doc, s] = await Promise.all([getLegal(slug), getSettings()])
  const body: any[] | null = doc?.body ?? null
  const headings = (body ?? [])
    .filter((b) => b._type === 'block' && b.style === 'h2')
    .map((b) => ({ text: blockText(b), id: headingId(blockText(b), b._key) }))

  return (
    <>
      <section className="page-head tight">
        <div className="wrap">
          <Eyebrow>Legal</Eyebrow>
          <h1 className="h1">{doc?.title ?? title}</h1>
          <p className="caption" style={{ margin: 0 }}>
            Last updated {doc?.lastUpdated ? <time dateTime={doc.lastUpdated}>{formatDate(doc.lastUpdated)}</time> : '[date]'}
          </p>
        </div>
      </section>
      <section className="section flush-top">
        <div className="wrap legal-grid">
          <nav aria-label="On this page" className="legal-toc" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <span className="label">On this page</span>
            <ul className="shard-list" style={{ marginTop: 16, fontSize: 15 }}>
              {headings.length
                ? headings.map((h) => (
                    <li key={h.id}>
                      <a className="text-link-plain" href={`#${h.id}`}>{h.text}</a>
                    </li>
                  ))
                : ['[Heading 1]', '[Heading 2]', '[Heading 3]'].map((h) => <li key={h}>{h}</li>)}
            </ul>
          </nav>
          <article className="legal-body" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <RichText value={body} anchors fallback={[`[${title} text comes from you or your lawyer. Nothing is drafted here.]`]} />
            <div className="panel" style={{ marginTop: 'var(--space-12)' }}>
              {slug === 'accessibility' ? (
                <>
                  <strong>Something hard to use? Tell us.</strong>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    <a className="text-link" href={`mailto:${s.email}`}>{s.email}</a>
                    <span aria-hidden="true"> · </span>
                    <PhoneLink className="text-link" phone={s.phone} />
                  </p>
                </>
              ) : (
                <>
                  <strong>Questions about this page?</strong>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    <a className="text-link" href={`mailto:${s.email}`}>{s.email}</a>
                  </p>
                </>
              )}
            </div>
          </article>
        </div>
      </section>
    </>
  )
}
