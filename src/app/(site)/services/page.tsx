import { Eyebrow } from '@/components/brand'
import { ServiceCard } from '@/components/cards'
import { ClosingBand, Process } from '@/components/sections'
import { getServices, getSettings, getSimplePage, pick } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const p = await getSimplePage('servicesPage')
  return seoMeta(p.seo, 'Corporate video production services', 'Organizational and brand films, social stories, event coverage, retainers and documentary, from Alberta to the NWT.', { path: '/services', eyebrow: 'Services' })
}

export default async function ServicesPage() {
  const [page, services, s] = await Promise.all([getSimplePage('servicesPage'), getServices(), getSettings()])
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>{pick(page.eyebrow, 'Services')}</Eyebrow>
          <h1 className="display-xl">{pick(page.headline, 'Films that sound like your people')}</h1>
          <p className="body-lg muted" style={{ margin: 0, maxWidth: '56ch' }}>
            {pick(page.intro, 'Video first. Organizational and brand films lead, with room for whatever your story needs.')}
          </p>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap grid-3">
          {services.map((sv) => <ServiceCard key={sv._id} s={sv} />)}
        </div>
      </section>
      <section className="section ruled" aria-labelledby="how">
        <div className="wrap">
          <div className="sec-head">
            <Eyebrow>How we work</Eyebrow>
            <h2 id="how" className="h2">Four steps, every time</h2>
          </div>
          <Process steps={s.processSteps} compact />
        </div>
      </section>
      <ClosingBand s={s} />
    </>
  )
}
