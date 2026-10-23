import { Fragment, type CSSProperties } from 'react'

/** A heading whose words rise into place when it scrolls into view (see Motion). Plain, readable text without JS. */
export function SplitHeading({ as: As = 'h2', className, text }: { as?: 'h1' | 'h2'; className?: string; text: string }) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <As className={`split-h ${className ?? ''}`} aria-label={text}>
      {words.map((w, i) => (
        // The space sits between the word boxes: inside an inline-block a trailing space is dropped.
        <Fragment key={`${w}-${i}`}>
          <span className="sw" aria-hidden="true">
            <span style={{ '--i': i } as CSSProperties}>{w}</span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </As>
  )
}
