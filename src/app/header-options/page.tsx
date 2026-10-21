/**
 * TEMPORARY: three header options for Josh to choose from (homepage revisions, item 9).
 * Static mock-ups using the real logo, type and colours. Delete this route once a header is picked.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import './header-options.css'

export const metadata = { title: 'Header options (preview)', robots: { index: false, follow: false } }

const Lock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
)
const Burger = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
)
const BothLogos = ({ h = 34 }: { h?: number }) => (
  <span className="ho-logo" style={{ '--logo-h': `${h}px` } as CSSProperties}>
    <Logo className="logo-for-light" height={h} />
    <Logo tone="dark" className="logo-for-dark" height={h} />
  </span>
)

function Frame({ label, children, phone }: { label: string; children: ReactNode; phone?: boolean }) {
  return (
    <figure className={`ho-frame ${phone ? 'ho-phone' : ''}`}>
      <figcaption className="label">{label}</figcaption>
      <div className="ho-canvas">{children}<div className="ho-page" aria-hidden="true" /></div>
    </figure>
  )
}

export default function HeaderOptions() {
  return (
    <main className="ho">
      <header className="ho-intro wrap">
        <p className="eyebrow">Preview · not linked from the site</p>
        <h1 className="h1">Header options</h1>
        <p className="body-lg muted lede">
          Three ways to give the header more room and put client login where clients will find it. Use the theme button to see each in light and dark.
        </p>
        <div style={{ marginTop: 'var(--space-6)' }}><ThemeToggle /></div>
      </header>

      {/* ── Option A ─────────────────────────────────────────────── */}
      <section className="ho-option wrap">
        <h2 className="h2">A · Utility strip</h2>
        <p className="muted lede">
          A thin strip above the header holds the small things: where we work on the left, <strong>Client login</strong> and the theme switch on the right.
          The main header keeps the logo, five links and one button. Locations move out of the nav into the strip.
        </p>
        <Frame label="Desktop">
          <div className="ho-strip">
            <span>Stony Plain, AB · Norman Wells, NT</span>
            <span className="ho-strip-right">
              <a href="#" className="ho-login"><Lock /> Client login</a>
              <span className="ho-mini-toggle" aria-hidden="true">◐</span>
            </span>
          </div>
          <div className="ho-bar">
            <BothLogos />
            <nav className="ho-nav"><a>Stories</a><a>Services</a><a>About</a><a>Locations</a><a>Contact</a></nav>
            <a className="btn btn-primary">Start a conversation</a>
          </div>
        </Frame>
        <Frame label="Phone" phone>
          <div className="ho-strip ho-strip-sm">
            <span>Alberta · NWT</span>
            <a href="#" className="ho-login"><Lock /> Client login</a>
          </div>
          <div className="ho-bar">
            <BothLogos h={24} />
            <span className="ho-round"><Burger /></span>
          </div>
        </Frame>
        <p className="caption">On phones the strip stays (one short line) so login is always one tap away; everything else goes in the menu.</p>
      </section>

      {/* ── Option B ─────────────────────────────────────────────── */}
      <section className="ho-option wrap">
        <h2 className="h2">B · Two buttons, fewer links</h2>
        <p className="muted lede">
          One row. The nav drops to four words (Stories, Services, About, Contact); Alberta and the NWT live on a Locations page and in the footer.
          On the right, an outlined <strong>Client login</strong> button sits beside the copper call to action. The theme switch moves to the footer.
        </p>
        <Frame label="Desktop">
          <div className="ho-bar ho-bar-tall">
            <BothLogos />
            <nav className="ho-nav"><a>Stories</a><a>Services</a><a>About</a><a>Contact</a></nav>
            <span className="ho-actions">
              <a href="#" className="btn btn-secondary ho-btn-sm"><Lock /> Client login</a>
              <a className="btn btn-primary">Start a conversation</a>
            </span>
          </div>
        </Frame>
        <Frame label="Phone" phone>
          <div className="ho-bar">
            <BothLogos h={24} />
            <span className="ho-actions">
              <span className="ho-round" title="Client login"><Lock /></span>
              <span className="ho-round"><Burger /></span>
            </span>
          </div>
        </Frame>
        <p className="caption">On phones client login becomes a lock icon next to the menu button, still visible without opening the menu.</p>
      </section>

      {/* ── Option C ─────────────────────────────────────────────── */}
      <section className="ho-option wrap">
        <h2 className="h2">C · Quiet bar, full menu</h2>
        <p className="muted lede">
          The calmest: logo on the left; on the right only <strong>Client login</strong> as a text link, the call to action and a Menu button, on every screen size.
          The menu opens a full-screen page with Stories, Services, About, both locations, Contact and the theme switch. Most like a studio or agency site.
        </p>
        <Frame label="Desktop">
          <div className="ho-bar ho-bar-tall">
            <BothLogos />
            <span className="ho-actions">
              <a href="#" className="ho-login ho-login-lg"><Lock /> Client login</a>
              <a className="btn btn-primary">Start a conversation</a>
              <span className="ho-menu-word"><Burger /> Menu</span>
            </span>
          </div>
        </Frame>
        <Frame label="Phone" phone>
          <div className="ho-bar">
            <BothLogos h={24} />
            <span className="ho-actions">
              <a href="#" className="ho-login"><Lock /> Login</a>
              <span className="ho-round"><Burger /></span>
            </span>
          </div>
        </Frame>
        <p className="caption">On phones the call to action moves into the menu; Login stays as a short text link beside the menu button.</p>
      </section>
    </main>
  )
}
