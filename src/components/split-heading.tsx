import type { CSSProperties } from 'react'

/** A heading whose words rise into place when it scrolls into view (see Motion). Plain, readable text without JS. */
export function SplitHeading({ as: As = 'h2', className, text }: { as?: 'h1' | 'h2'; className?: string; text: string }) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <As className={`split-h ${className ?? ''}`} aria-label={text}>
      {words.map((w, i) => (
        <span className="sw" aria-hidden="true" key={`${w}-${i}`}>
          <span style={{ '--i': i } as CSSProperties}>{w}</span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </As>
  )
}
