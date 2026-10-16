import Link from 'next/link'
import type { ProcessStep } from '@/lib/types'

/** Four process steps as a tight numbered list (number, title, one line), linking to About. */
export function ProcessCompact({ steps, headingId = 'how' }: { steps: ProcessStep[]; headingId?: string }) {
  return (
    <div className="split">
      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        <h2 id={headingId} className="eyebrow" style={{ margin: 0 }}>How it works</h2>
        <Link className="link-arrow" href="/about" style={{ alignSelf: 'flex-start' }}>
          How we work <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ol className="process-compact">
        {steps.map((st, i) => (
          <li key={st._key}>
            <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3 className="process-compact-title">{st.title}</h3>
              {st.line && <p className={`muted${st.line.startsWith('[') ? ' placeholder-text' : ''}`}>{st.line}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
