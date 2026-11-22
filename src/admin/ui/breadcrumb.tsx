import Link from 'next/link'

export type Crumb = { label: string; href: string }

/**
 * The one "where am I" line for back-office pages: parent links, then the current page.
 * `<Breadcrumb trail={[{ label: 'Pipeline', href: '/admin/pipeline' }]} current="Closure video series" />`
 * Leave `current` out when the page's H1 already says it; the last parent link is then the way back.
 */
export function Breadcrumb({ trail, current, className }: { trail: Crumb[]; current?: string; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`a-crumbs${className ? ` ${className}` : ''}`}>
      <ol>
        {trail.map((c) => (
          <li key={c.href}><Link href={c.href}>{c.label}</Link></li>
        ))}
        {current && <li><span aria-current="page">{current}</span></li>}
      </ol>
    </nav>
  )
}
