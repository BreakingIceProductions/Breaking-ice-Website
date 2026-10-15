import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { JsonLd, organizationLd } from '@/components/json-ld'
import { Tracking } from '@/components/tracking'
import { getSettings } from '@/lib/data'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings()
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <div className="preview-ribbon">Private preview · sample content · not yet public</div>
      <Header locations={s.locations} cta={s.primaryCta} />
      <main id="main">{children}</main>
      <Footer s={s} />
      <Tracking bookingLink={s.bookingLink} />
      <JsonLd data={organizationLd(s)} />
    </>
  )
}
