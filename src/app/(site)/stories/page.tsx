import { Eyebrow } from '@/components/brand'
import { ClosingBand } from '@/components/sections'
import { StoriesGrid } from '@/components/stories-grid'
import { getProjects, getSettings, getSimplePage, pick } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const p = await getSimplePage('storiesPage')
  return seoMeta(p.seo, 'Stories', 'Films and photo stories from organizations across Alberta and the Northwest Territories.')
}

export default async function StoriesPage() {
  const [page, projects, s] = await Promise.all([getSimplePage('storiesPage'), getProjects(), getSettings()])
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Eyebrow>{pick(page.eyebrow, 'Stories')}</Eyebrow>
          <h1 className="display-xl">{pick(page.headline, 'The people inside the work')}</h1>
          <p className="body-lg muted" style={{ margin: 0, maxWidth: '56ch' }}>
            {pick(page.intro, 'Films and photo stories from companies, communities, crews and nonprofits across Alberta and the Northwest Territories.')}
          </p>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
                      <StoriesGrid projects={projects} />
                  </div>
      </section>
      <ClosingBand s={s} secondary={false} />
    </>
  )
}
