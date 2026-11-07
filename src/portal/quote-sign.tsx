'use client'

import { Dancing_Script } from 'next/font/google'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mark } from '@/components/brand'
import { quoteDeposit } from './library'
import type { QuoteOption } from './types'

const script = Dancing_Script({ subsets: ['latin'], weight: '500', display: 'swap' })

/** Keep in step with CONSENT in quotes.ts: it's printed on the certificate. */
const CONSENT =
  'I have read this quote and agree to its terms. I agree to sign electronically, and that my electronic signature is as binding as a handwritten one.'

type Props = {
  slug: string
  version: number
  org: string
  options?: QuoteOption[]
  depositPercent?: number
  deposit?: number
  defaultName: string
  defaultTitle: string
  demo: boolean
  preview?: boolean
  noGst?: boolean
  /** The cover image, folded into the envelope after signing. */
  coverUrl?: string
  /** Whether a deposit is paid in the portal next (the animation says so). */
  depositNext?: boolean
}

const cad = (n?: number) => (n ? `$${n.toLocaleString('en-CA', { maximumFractionDigits: 2 })}` : '')
/** What follows a price: "+ GST", or nothing for a GST-exempt client. */
const plusGst = (noGst?: boolean) => (noGst ? '' : ' + GST')

/** The package being looked at, shared by the At a glance card and the Sign panel. */
const Choice = createContext<[string, (key: string) => void] | null>(null)

export function QuoteChoice({ initial = '', children }: { initial?: string; children: React.ReactNode }) {
  const state = useState(initial)
  return <Choice.Provider value={state}>{children}</Choice.Provider>
}

const useChoice = (fallback: string) => {
  const shared = useContext(Choice)
  const local = useState(fallback)
  return shared ?? local
}

type GlanceProps = {
  options?: QuoteOption[]
  total?: number
  depositPercent?: number
  deposit?: number
  summary?: string
  includes?: string[]
  version: number
  noGst?: boolean
  /** Once signed, the numbers are the signed ones and nothing switches. */
  signed?: { option?: string; total?: number; deposit?: number }
}

/** Price, deposit due and balance: they follow the package chosen. */
export function QuoteGlance({ options, total, depositPercent, deposit, summary, includes, version, noGst, signed }: GlanceProps) {
  const [option, setOption] = useChoice(options?.length === 1 ? options[0]._key : '')
  const chosen = signed ? undefined : options?.find((o) => o._key === option)
  const price = signed ? signed.total : options?.length ? chosen?.total : total
  const due = signed ? signed.deposit : price ? quoteDeposit(price, { depositPercent, deposit }) : undefined
  const from = !signed && options?.length && !chosen ? Math.min(...options.map((o) => o.total)) : undefined

  return (
    <section className="p-card q-summary" aria-labelledby="sum-h">
      <h2 id="sum-h" className="p-label">At a glance</h2>
      {!signed && options && options.length > 1 && (
        <div className="q-packages" role="radiogroup" aria-label="Packages">
          {options.map((o) => (
            <button key={o._key} type="button" role="radio" aria-checked={option === o._key} className={`q-package${option === o._key ? ' on' : ''}`} onClick={() => setOption(o._key)}>
              <span className="stack" style={{ gap: 0, textAlign: 'left' }}>
                <strong>{o.name}</strong>
                {o.note && <span className="muted small">{o.note}</span>}
              </span>
              <span className="q-package-price">{cad(o.total)}</span>
            </button>
          ))}
        </div>
      )}
      {signed?.option && <p className="small" style={{ margin: 0 }}>Package: <strong>{signed.option}</strong></p>}
      <div aria-live="polite" className="stack" style={{ gap: 'var(--space-2)' }}>
        {price ? (
          <p className="q-total">
            <span className="q-amount">{cad(price)}</span>
            {(!noGst || chosen) && <span className="muted small">{noGst ? chosen!.name : `+ GST${chosen ? ` · ${chosen.name}` : ''}`}</span>}
          </p>
        ) : from ? (
          <p className="q-total">
            <span className="muted small">From</span>
            <span className="q-amount">{cad(from)}</span>
            {!noGst && <span className="muted small">+ GST</span>}
          </p>
        ) : null}
        {price && due ? (
          <dl className="q-money">
            <div><dt>Deposit due to book{depositPercent && !signed ? ` (${depositPercent}%)` : ''}</dt><dd>{cad(due)}{plusGst(noGst)}</dd></div>
            <div><dt>Balance on delivery</dt><dd>{cad(Math.round((price - due) * 100) / 100)}{plusGst(noGst)}</dd></div>
          </dl>
        ) : options && options.length > 1 && !signed ? (
          <p className="muted small" style={{ margin: 0 }}>Choose a package to see your total and the deposit due{depositPercent ? ` (${depositPercent}%)` : ''}.</p>
        ) : null}
      </div>
      {summary && <p style={{ margin: 0 }}>{summary}</p>}
      {includes && includes.length > 0 && (
        <>
          <h3 className="p-label">What’s included</h3>
          <ul className="q-includes">
            {includes.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </>
      )}
      <p className="muted small" style={{ margin: 0 }}>The PDF has the full details{version > 1 ? ` (version ${version})` : ''}.</p>
    </section>
  )
}

/** Type or draw a signature, agree, sign. */
export function QuoteSign({ slug, version, org, options, depositPercent, deposit, defaultName, defaultTitle, demo, preview, noGst, coverUrl, depositNext }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [sending, setSending] = useState(false)
  const [name, setName] = useState(defaultName)
  const [title, setTitle] = useState(defaultTitle)
  const [method, setMethod] = useState<'typed' | 'drawn'>('typed')
  const [agree, setAgree] = useState(false)
  const [option, setOption] = useChoice(options?.length === 1 ? options[0]._key : '')
  const [drawn, setDrawn] = useState(false)
  const [state, setState] = useState<{ busy?: boolean; err?: string; done?: string }>({})
  const pad = useRef<HTMLCanvasElement>(null)

  const ready = name.trim().length >= 2 && agree && (method === 'typed' || drawn) && (!options?.length || Boolean(option))

  async function sign(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || state.busy) return
    setState({ busy: true })
    const r = await fetch('/api/portal/quote/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: slug, version, option: option || undefined, name: name.trim(), title: title.trim(), method, typed: name.trim(), agree,
        image: method === 'drawn' ? pad.current?.toDataURL('image/png') : undefined,
      }),
    }).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (r?.ok && j?.ok) {
      // Fold it up and send it off, then show the signed page (which leads with the deposit).
      setSending(true)
      setTimeout(() => {
        if (demo) {
          setSending(false)
          setState({ done: 'Sample only: nothing was signed or sent.' })
        } else {
          window.scrollTo({ top: 0 })
          router.replace(`${pathname}?signed=1`)
        }
      }, reducedMotion() ? 1400 : 4300)
      return
    }
    const err =
      j?.error === 'preview' ? 'You’re viewing as the client, so signing is switched off. Everything up to here works as it does for them.'
      : j?.error === 'changed' ? 'This quote was just updated. Reload the page to see the latest version, then sign.'
      : j?.error === 'already-signed' ? 'This quote has already been signed.'
      : j?.error === 'expired' ? 'This quote has expired. Reply to our email and we’ll send a fresh one.'
      : j?.error === 'too-many' ? 'Too many tries. Wait a little and try again.'
      : 'Something went wrong and nothing was signed. Try again, or reply to our email.'
    setState({ err })
  }

  if (sending) return <SentOff coverUrl={coverUrl} next={depositNext ? 'Next: your deposit.' : 'A signed copy is on its way to your inbox.'} />
  if (state.done) return <p className="q-signed-note" role="status">{state.done}</p>

  return (
    <form className="q-sign stack" onSubmit={sign} aria-labelledby="sign-h">
      <h2 id="sign-h" className="h3" style={{ margin: 0 }}>Sign and accept</h2>
      {options && options.length > 0 && (
        <fieldset className="q-sig">
          <legend className="small">Choose a package</legend>
          <div className="q-options">
            {options.map((o) => (
              <label key={o._key} className={`q-option${option === o._key ? ' on' : ''}`}>
                <input type="radio" name="option" value={o._key} checked={option === o._key} onChange={() => setOption(o._key)} required />
                <span className="stack" style={{ gap: 0 }}>
                  <strong>{o.name}</strong>
                  <span className="small">{cad(o.total)}{plusGst(noGst)}</span>
                  {o.note && <span className="muted small">{o.note}</span>}
                  {quoteDeposit(o.total, { depositPercent, deposit }) ? <span className="muted small">Deposit {cad(quoteDeposit(o.total, { depositPercent, deposit }))}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="q-sign-row">
        <div className="field">
          <label htmlFor="s-name">Full name</label>
          <input id="s-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
        </div>
        <div className="field">
          <label htmlFor="s-title">Title <span className="muted small">(optional)</span></label>
          <input id="s-title" className="input" autoComplete="organization-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Signing for {org}</p>

      <fieldset className="q-sig">
        <legend className="small">Signature</legend>
        <div className="q-sig-tabs" role="radiogroup" aria-label="How to sign">
          {(['typed', 'drawn'] as const).map((m) => (
            <label key={m} className={method === m ? 'on' : undefined}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
              {m === 'typed' ? 'Type' : 'Draw'}
            </label>
          ))}
        </div>
        {method === 'typed' ? (
          <div className={`q-sig-box q-sig-typed ${script.className}`} aria-label={`Your signature: ${name}`}>{name.trim() || 'Your name'}</div>
        ) : (
          <SignaturePad canvas={pad} onChange={setDrawn} />
        )}
      </fieldset>

      <label className="q-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
        <span>{CONSENT}</span>
      </label>

      {state.err && <p className="err small" role="alert" style={{ margin: 0 }}>{state.err}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={!ready || state.busy}>{state.busy ? 'Signing…' : 'Sign quote'}</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        You’ll get the signed PDF by email, with a certificate page recording your name, email, the time and this device.{depositNext ? ' Your project is booked once the deposit is paid.' : ' Signing books your project in.'}
      </p>
    </form>
  )
}

function SignaturePad({ canvas, onChange }: { canvas: React.RefObject<HTMLCanvasElement | null>; onChange: (has: boolean) => void }) {
  const drawing = useRef(false)
  const [has, setHas] = useState(false)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#18202F'
  }, [canvas])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!has) {
      setHas(true)
      onChange(true)
    }
  }
  const up = () => (drawing.current = false)
  const clear = () => {
    const c = canvas.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setHas(false)
    onChange(false)
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <canvas
        ref={canvas}
        className="q-sig-box q-sig-pad"
        aria-label="Signature pad: draw your signature with a mouse, finger or stylus. To sign with the keyboard, choose Type instead."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <div className="row-wrap">
        <button type="button" className="linklike small" onClick={clear} disabled={!has}>Clear</button>
        {!has && <span className="muted small">Sign in the box above</span>}
      </div>
    </div>
  )
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** After signing: the quote folds in three, slips into an envelope, the flap seals and it flies off. */
function SentOff({ coverUrl, next }: { coverUrl?: string; next: string }) {
  const face = (i: number) => (coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundPosition: `0 ${i * 50}%` } : undefined)
  // On <body>, so nothing on the page (the sticky side column, the header) sits above it.
  return createPortal(
    <div className="qs" role="status" aria-live="polite">
      <div className="qs-stage" aria-hidden="true">
        <div className="qs-fly">
          <div className="qs-env-back" />
          <div className="qs-letter">
            <div className="qs-p qs-p1"><i className="qs-front" style={face(0)} /><i className="qs-back" /></div>
            <div className="qs-p qs-p2"><i className="qs-front" style={face(1)} /></div>
            <div className="qs-p qs-p3"><i className="qs-front" style={face(2)} /><i className="qs-back" /></div>
          </div>
          <div className="qs-env-front" />
          <div className="qs-flap"><Mark size={26} className="qs-seal" right="#faf7f2" /></div>
        </div>
      </div>
      <p className="qs-text">
        <strong>Signed and sent.</strong>
        <span>{next}</span>
      </p>
    </div>,
    document.body,
  )
}
