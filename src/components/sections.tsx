import { PortableText, type PortableTextComponents } from '@portabletext/react'
import type { ProcessStep, Settings } from '@/lib/types'
import { Btn, Mark } from './brand'
import { VideoLoop } from './video'

const ptComponents: PortableTextComponents = {
  marks: {
    link: ({ children, value }) => (
      <a className="text-link" href={value?.href} target={value?.href?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
        {children}
      </a>
    ),
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function RichText({ value, fallback }: { value?: any[] | null; fallback?: string | string[] }) {
  if (value?.length) {
    return (
      <div className="prose">
        <PortableText value={value} components={ptComponents} />
      </div>
    )
  }
  const lines = Array.isArray(fallback) ? fallback : fallback ? [fallback] : []
  return (
    <div className="prose">
      {lines.map((l, i) => (
        <p key={i} className={l.startsWith('[') ? 'placeholder-text' : undefined}>{l}</p>
      ))}
    </div>
  )
}

/** Navy closing band over the shard field, with exactly one copper quote. */
export function ClosingBand({ s, headline, secondary = true }: { s: Settings; headline?: string; secondary?: boolean }) {
  return (
    <section className="closing dark shard-field" aria-label="Start a conversation">
      <span className="shard-highlight" style={{ right: '12%', top: 'calc(50% - 30px)' }} aria-hidden="true">
        <Mark size={64} right="var(--warm-white)" />
      </span>
      <div className="wrap">
        <span className="eyebrow">{s.closingEyebrow}</span>
        <h2 className="h1">{headline || s.closingHeadline}</h2>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <Btn href="/contact">{s.primaryCta}</Btn>
          {secondary && <Btn href="/stories" variant="secondary">{s.secondaryCta}</Btn>}
        </div>
      </div>
    </section>
  )
}

export function Process({ steps, compact }: { steps: ProcessStep[]; compact?: boolean }) {
  return (
    <ol className="process" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {steps.map((st, i) => (
        <li key={st._key} className="step">
          <span className="step-num">0{i + 1}</span>
          {!compact && <VideoLoop url={st.clip} label="Short clip" className="ratio-43 cut-lg" />}
          <h3 className="h3">{st.title}</h3>
          {st.line && <p className="muted" style={{ margin: 0 }}>{st.line}</p>}
          {!compact && (
            <>
              <dl>
                <dt>What you bring</dt>
                <dd className={st.youBring?.startsWith('[') ? 'placeholder-text' : ''}>{st.youBring}</dd>
                <dt>What you get</dt>
                <dd className={st.youGet?.startsWith('[') ? 'placeholder-text' : ''}>{st.youGet}</dd>
              </dl>
              <details>
                <summary>What’s inside <span className="pm" aria-hidden="true" /></summary>
                <div style={{ paddingBottom: 8, fontSize: 15 }}>
                  <RichText value={st.inside} fallback={st.insideText} />
                </div>
              </details>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}
