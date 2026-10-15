import { Eyebrow } from '@/components/brand'
import { ContactForm } from '@/components/contact-form'
import { getContact, getServices, getSettings, pick } from '@/lib/data'
import { seoMeta } from '@/lib/seo'

export async function generateMetadata() {
  const c = await getContact()
  return seoMeta(c.seo, 'Start a conversation', 'Tell us about the story. We’ll get back to you, usually within a day or two.', { path: '/contact', eyebrow: 'Contact' })
}

export default async function ContactPage() {
  const [c, s, services] = await Promise.all([getContact(), getSettings(), getServices()])
  const nextSteps: { title: string; text: string }[] = pick(c.nextSteps, [
    { title: '[Step 1]', text: '[We read it and reply within [N] business days.]' },
    { title: '[Step 2]', text: '[A short call to listen and ask questions.]' },
    { title: '[Step 3]', text: '[A written plan and quote.]' },
  ])

  return (
    <>
      <section className="page-head" style={{ paddingBottom: 'var(--space-12)' }}>
        <div className="wrap">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="display-xl">{pick(c.headline, 'Start a conversation')}</h1>
          <p className="body-lg muted" style={{ margin: 0, maxWidth: '52ch' }}>
            {pick(c.intro, 'No pitch, no pressure. Tell us a little about the story and we’ll take it from there.')}
          </p>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap contact-grid">
          <ContactForm
            services={services.map((sv) => ({ value: sv.slug, label: sv.title }))}
            budget={pick(c.budgetOptions, ['[Range 1]', '[Range 2]', '[Range 3]', 'Not sure yet'])}
            timeline={pick(c.timelineOptions, ['[Option 1]', '[Option 2]', '[Option 3]', 'Flexible'])}
            heard={pick(c.heardOptions, ['Google search', 'Referral / word of mouth', 'Social media', 'Saw your work', 'Other'])}
            privacyLine={pick(c.privacyLine, '[How we use what you send: one short line.]')}
            successHeadline={pick(c.successHeadline, 'Thanks. We’ve got it.')}
            successMessage={pick(c.successMessage, 'Hi [first name], we’ll read this properly and get back to you soon.')}
            nextSteps={nextSteps}
            bookingLink={s.bookingLink}
            email={s.email}
          />
          <aside className="stack" style={{ gap: 24 }}>
            <div id="book" className="book-card dark cut-lg">
              <span className="eyebrow">Rather talk first?</span>
              <span className="h3">Book a 20-minute call</span>
              <p className="muted" style={{ margin: 0 }}>Pick a time that suits you. No prep needed.</p>
              {s.bookingLink ? (
                <a className="btn btn-primary" href={s.bookingLink} target="_blank" rel="noopener noreferrer">Pick a time ↗</a>
              ) : (
                <span className="caption" style={{ color: 'var(--ink-inverse-muted)' }}>[Booking link: add your Google appointment schedule in Site settings]</span>
              )}
            </div>
            <div className="panel stack" style={{ gap: 8 }}>
              <span className="eyebrow">Talk directly</span>
              <a className="h3" style={{ textDecoration: 'none' }} href={`mailto:${s.email}`}>{s.email}</a>
              <span className="h3">{s.phone}</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">What happens next</span>
              <ol className="steps-list">
                {nextSteps.map((st, i) => (
                  <li key={i}>
                    <span><strong className={st.title.startsWith('[') ? 'placeholder-text' : ''}>{st.title}</strong><br /><span className="muted">{st.text}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
