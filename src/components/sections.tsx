import { PortableText, type PortableTextComponents } from '@portabletext/react'
import type { ProcessStep, Settings } from '@/lib/types'
import { Btn, Mark } from './brand'
import { vimeoPoster } from '@/lib/vimeo'
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
/** Plain text of a Portable Text block. */
export const blockText = (b: any): string => b?.children?.map((c: any) => c.text).join('') ?? ''

/** URL-safe id for a heading, so "On this page" links can jump to it. */
export const headingId = (text: string, key?: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `h-${key ?? 'section'}`

const anchoredComponents: PortableTextComponents = {
  ...ptComponents,
  block: {
    h2: ({ children, value }) => <h2 id={headingId(blockText(value), value?._key)}>{children}</h2>,
  },
}

export function RichText({ value, fallback, anchors }: { value?: any[] | null; fallback?: string | string[]; anchors?: boolean }) {
  if (value?.length) {
    return (
      <div className="prose">
        <PortableText value={value} components={anchors ? anchoredComponents : ptComponents} />
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

/** A phone number as a tel: link, or plain text while it's still a placeholder. */
export function PhoneLink({ phone, className, style }: { phone: string; className?: string; style?: React.CSSProperties }) {
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.replace('+', '').length < 7) return <span className={className} style={style}>{phone}</span>
  return <a className={className} style={style} href={`tel:${digits}`}>{phone}</a>
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

export async function Process({ steps, compact }: { steps: ProcessStep[]; compact?: boolean }) {
  // A still per clip, so each box shows a picture while its player loads.
  const posters = compact ? [] : await Promise.all(steps.map((st) => vimeoPoster(st.clip)))
  return (
    <ol className="process">
      {steps.map((st, i) => (
        <li key={st._key} className="step">
          <span className="step-num">0{i + 1}</span>
          {!compact && <VideoLoop url={st.clip} posterUrl={posters[i]} label="Short clip" className="ratio-43" />}
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
              <details open={i === 0}>
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
