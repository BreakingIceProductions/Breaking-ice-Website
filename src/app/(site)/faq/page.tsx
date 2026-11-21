import { Eyebrow } from '@/components/brand'
import { JsonLd, breadcrumbLd } from '@/components/json-ld'
import { ClosingBand } from '@/components/sections'
import { getFaqItems, getFaqPage, getSettings } from '@/lib/data'
import { COPY, FAQ_CATEGORIES } from '@/lib/offers'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const p = await getFaqPage()
  return seoMeta(p.seo, COPY.faq.seoTitle, COPY.faq.seoDescription, { path: '/faq', eyebrow: 'FAQ' })
}

/** Every FAQ question, grouped by category, as native disclosures (keyboard and screen-reader friendly without JS). */
export default async function FaqPage() {
  const [page, items, s] = await Promise.all([getFaqPage(), getFaqItems(), getSettings()])
  const groups = FAQ_CATEGORIES.map((c) => ({ ...c, items: items.filter((q) => (q.category ?? 'general') === c.value) })).filter((g) => g.items.length)

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.filter((q) => q.answer).map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
          },
          breadcrumbLd([['FAQ', '/faq']]),
        ]}
      />
      <section className="page-head tight">
        <div className="wrap">
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="display-xl">{page.headline}</h1>
          <p className="body-lg muted lede">{page.intro}</p>
        </div>
      </section>
      <section className="section flush-top" aria-label="Questions">
        <div className="wrap">
          {groups.map((g) => (
            <div key={g.value} className="faq-group split" id={g.value}>
              <h2 id={`faq-${g.value}`} className="h3">{g.title}</h2>
              <div className="faq" role="group" aria-labelledby={`faq-${g.value}`}>
                {g.items.map((q) => (
                  <details key={q._id}>
                    <summary>{q.question}</summary>
                    <p>{q.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <ClosingBand s={s} headline={page.closingHeadline} />
    </>
  )
}
