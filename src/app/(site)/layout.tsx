import { BackRow, NavTracker } from '@/components/back-link'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Motion } from '@/components/motion'
import { JsonLd, organizationLd } from '@/components/json-ld'
import { Tracking } from '@/components/tracking'
import { getOffers, getSettings } from '@/lib/data'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, offers] = await Promise.all([getSettings(), getOffers()])
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Header locations={s.locations} cta={s.primaryCta} social={s.social} />
      <main id="main">
        <BackRow />
        {children}
      </main>
      <Footer s={s} />
      <Motion />
      <NavTracker />
      <Tracking bookingLink={s.bookingLink} />
      <JsonLd data={organizationLd(s, offers)} />
    </>
  )
}
