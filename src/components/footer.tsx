import Link from 'next/link'
import type { Settings } from '@/lib/types'
import { Logo } from './brand'

export function Footer({ s }: { s: Settings }) {
  const social = [
    ['Instagram', s.social.instagram],
    ['LinkedIn', s.social.linkedin],
    ['YouTube', s.social.youtube],
    ['Vimeo', s.social.vimeo],
  ] as const
  return (
    <footer className="site-footer dark">
      <div className="wrap">
        <div className="footer-grid">
          <div className="stack" style={{ gap: 20 }}>
            <Link href="/" aria-label="Breaking Ice Productions, home"><Logo tone="dark" height={36} /></Link>
            <p className="muted" style={{ margin: 0, maxWidth: '36ch', fontSize: 15, lineHeight: '24px' }}>{s.footerDescription}</p>
            <p className="quote" style={{ margin: 0, fontSize: 22, lineHeight: '30px' }}>{s.tagline}</p>
          </div>
          <div>
            <h2>Explore</h2>
            <ul>
              <li><Link href="/stories">Stories</Link></li>
              <li><Link href="/services">Services</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h2>Where we work</h2>
            <ul>
              {s.locations.map((l) => (
                <li key={l._id}>
                  <Link href={`/${l.slug}`}>{l.title}</Link>
                  {l.baseLine && <div className="muted" style={{ fontSize: 13 }}>{l.baseLine}</div>}
                </li>
              ))}
              <li><a href={`mailto:${s.email}`}>{s.email}</a></li>
              <li><a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a></li>
            </ul>
          </div>
          <div>
            <h2>Follow</h2>
            <ul>
              {social.map(([label, href]) => (
                <li key={label}>
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : <span className="muted">{label}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-legal">
          <span>© {new Date().getFullYear()} {s.copyrightName}</span>
          <span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/accessibility">Accessibility</Link>
          </span>
        </div>
      </div>
    </footer>
  )
}
