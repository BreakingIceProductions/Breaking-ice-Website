import { Btn, Mark } from '@/components/brand'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { getSettings } from '@/lib/data'

export default async function NotFound() {
  const s = await getSettings()
  return (
    <>
    <Header locations={s.locations} cta={s.primaryCta} />
    <main id="main">
    <section className="notfound dark shard-field">
      <span className="shard-highlight" style={{ right: '14%', top: '30%' }} aria-hidden="true">
        <Mark size={64} right="var(--warm-white)" />
      </span>
      <div className="wrap stack" style={{ gap: 20, padding: 'var(--space-24) var(--gutter)' }}>
        <span className="eyebrow">404 · Page not found</span>
        <h1 className="display-xl" style={{ maxWidth: '14ch' }}>This page isn’t here.</h1>
        <p className="body-lg muted" style={{ margin: 0, maxWidth: '44ch' }}>But the stories are.</p>
        <div className="btn-row">
          <Btn href="/">Back to home</Btn>
          <Btn href="/stories" variant="secondary">See the stories</Btn>
        </div>
      </div>
    </section>
    </main>
    <Footer s={s} />
    </>
  )
}
