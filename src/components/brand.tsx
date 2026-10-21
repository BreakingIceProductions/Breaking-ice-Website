import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { urlFor } from '@/sanity/client'
import type { Img } from '@/lib/types'

/** The symbol: two shards of the split I. Doubles as the quotation mark. */
export function Mark({ size = 40, left = 'var(--accent-fill)', right = 'currentColor', className }: { size?: number; left?: string; right?: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 43.9" width={size} height={(size * 43.9) / 48} className={className} aria-hidden="true">
      <polygon points="0,0 20,0 20,29.9 0,43.9" fill={left} />
      <polygon points="28,0 48,0 48,29.9 28,43.9" fill={right} />
    </svg>
  )
}

export function Logo({ tone = 'light', height = 40, className }: { tone?: 'light' | 'dark'; height?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={tone === 'dark' ? '/brand/bi-horizontal-dark.svg' : '/brand/bi-horizontal-light.svg'}
      alt="Breaking Ice Productions"
      height={height}
      width={Math.round((height * 12666) / 1551.5)}
      style={{ height: `var(--logo-h, ${height}px)`, width: 'auto' }}
    />
  )
}

/**
 * Vertical and stacked lockups. tone="auto" renders the light-background and dark-background versions and lets the
 * theme pick one (see .logo-for-light / .logo-for-dark); tone="dark" is for bands that are always dark (splash, footer).
 */
export function Lockup({ variant = 'vertical', tone = 'auto', height = 200, className }: { variant?: 'vertical' | 'stacked'; tone?: 'auto' | 'dark'; height?: number; className?: string }) {
  const ratio = variant === 'vertical' ? 812.52 / 878.71 : 1 // padded viewBoxes; width follows the file
  const style = { height: `var(--lh, ${height}px)`, width: 'auto' } as const
  const dim = { height, width: Math.round(height * (variant === 'vertical' ? ratio : 1.48)) }
  const img = (src: string, cls?: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cls} src={src} alt={cls === 'logo-for-dark' ? '' : 'Breaking Ice Productions'} aria-hidden={cls === 'logo-for-dark' ? true : undefined} style={style} {...dim} />
  )
  if (tone === 'dark') return <span className={`lockup ${className ?? ''}`}>{img(`/brand/bi-${variant}-ondark.svg`)}</span>
  return (
    <span className={`lockup ${className ?? ''}`}>
      {img(`/brand/bi-${variant}-onlight.svg`, 'logo-for-light')}
      {img(`/brand/bi-${variant}-ondark.svg`, 'logo-for-dark')}
    </span>
  )
}

export function Eyebrow({ children, as: As = 'span' }: { children: ReactNode; as?: 'span' | 'p' | 'h2' }) {
  return <As className="eyebrow">{children}</As>
}

export function Btn({ href, children, variant = 'primary', external }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary'; external?: boolean }) {
  const cls = `btn btn-${variant}`
  if (external) return <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  return <Link className={cls} href={href}>{children}</Link>
}

export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link className={`link-arrow ${className ?? ''}`} href={href}>
      {children} <span aria-hidden="true">→</span>
    </Link>
  )
}

export function SectionHead({ eyebrow, title, children, as = 'h2' }: { eyebrow?: string; title?: ReactNode; children?: ReactNode; as?: 'h1' | 'h2' }) {
  const H = as
  return (
    <div className="sec-head">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && <H className={as === 'h1' ? 'h1' : 'h2'}>{title}</H>}
      {children}
    </div>
  )
}

export function Placeholder({ label, play }: { label: string; play?: boolean }) {
  return (
    <div className="media-placeholder">
      {play ? (
        <span className="play-dot" style={{ position: 'static', translate: 'none' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor" /></svg>
        </span>
      ) : (
        <Mark size={40} left="currentColor" right="currentColor" />
      )}
      <span>{label}</span>
    </div>
  )
}

/** A still image from Sanity, or a labelled placeholder. Never a stock stand-in. */
export function Still({
  image,
  label = 'Still from the film',
  ratio = 'ratio-43',
  width = 1200,
  onDark,
  priority,
  sizes = '(max-width: 820px) 100vw, 50vw',
}: {
  image?: Img
  label?: string
  ratio?: string
  width?: number
  onDark?: boolean
  priority?: boolean
  sizes?: string
}) {
  const has = Boolean(image?.asset)
  const h = ratio === 'ratio-169' ? Math.round(width * 0.5625) : ratio === 'ratio-45' ? Math.round(width * 1.25) : Math.round(width * 0.75)
  return (
    <div className={`media ${ratio} ${onDark ? 'on-dark' : ''}`}>
      {has ? (
        <Image
          src={urlFor(image).width(width).height(h).fit('crop').url()}
          alt={image?.alt || ''}
          fill
          sizes={sizes}
          priority={priority}
          style={{ objectFit: 'cover' }}
        />
      ) : (
        // No picture yet: a quiet brand pattern, never a labelled grey box on a live page.
        <div className="media-pattern" aria-hidden="true" data-label={label} />
      )}
    </div>
  )
}
