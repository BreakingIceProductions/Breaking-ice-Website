import { Eyebrow } from '@/components/brand'
import { RichText } from '@/components/sections'
import { getLegal, getSettings } from '@/lib/data'

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function LegalPage({ slug, title }: { slug: string; title: string }) {
  const [doc, s] = await Promise.all([getLegal(slug), getSettings()])
  const body: any[] | null = doc?.body ?? null
  const headings: string[] = (body ?? [])
    .filter((b) => b._type === 'block' && b.style === 'h2')
    .map((b) => b.children?.map((c: any) => c.text).join('') ?? '')

  return (
    <>
      <section className="page-head" style={{ paddingBottom: 'var(--space-12)' }}>
        <div className="wrap">
          <Eyebrow>Legal</Eyebrow>
          <h1 className="h1">{doc?.title ?? title}</h1>
          <p className="caption" style={{ margin: 0 }}>Last updated {doc?.lastUpdated ?? '[date]'}</p>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap legal-grid">
          <nav aria-label="On this page" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <span className="caption" style={{ letterSpacing: '.18em', textTransform: 'uppercase', fontSize: 12 }}>On this page</span>
            <ul className="shard-list" style={{ marginTop: 16, fontSize: 15 }}>
              {(headings.length ? headings : ['[Heading 1]', '[Heading 2]', '[Heading 3]']).map((h) => <li key={h}>{h}</li>)}
            </ul>
          </nav>
          <article style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <RichText value={body} fallback={[`[${title} text comes from you or your lawyer. Nothing is drafted here.]`]} />
            <div className="panel" style={{ marginTop: 'var(--space-12)' }}>
              <strong>Questions about this page?</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                <a className="text-link" href={`mailto:${s.email}`}>{s.email}</a>
              </p>
            </div>
          </article>
        </div>
      </section>
    </>
  )
}
