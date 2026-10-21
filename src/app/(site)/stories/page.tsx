import { Eyebrow } from '@/components/brand'
import { ClosingBand } from '@/components/sections'
import { StoriesGrid } from '@/components/stories-grid'
import { getProjects, getSettings, getSimplePage, pick } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const p = await getSimplePage('storiesPage')
  return seoMeta(p.seo, 'Stories', 'Films and photo stories made with airlines, operators, school boards, towns, Indigenous governments and outfitters across Alberta and the Northwest Territories.', { path: '/stories', eyebrow: 'Stories' })
}

export default async function StoriesPage() {
  const [page, projects, s] = await Promise.all([getSimplePage('storiesPage'), getProjects(), getSettings()])
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>{pick(page.eyebrow, 'Stories')}</Eyebrow>
          <h1 className="display-xl">{pick(page.headline, 'The people inside the work')}</h1>
          <p className="body-lg muted lede">
            {pick(page.intro, 'Films and photo stories from companies, communities, crews and nonprofits across Alberta and the Northwest Territories.')}
          </p>
        </div>
      </section>
      <section className="section flush-top">
        <div className="wrap">
          <StoriesGrid projects={projects} />
        </div>
      </section>
      <ClosingBand s={s} secondary={false} />
    </>
  )
}
