'use client'

import { Dancing_Script } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
}

const cad = (n?: number) => (n ? `$${n.toLocaleString('en-CA', { maximumFractionDigits: 2 })}` : '')

/** Type or draw a signature, agree, sign. */
export function QuoteSign({ slug, version, org, options, depositPercent, deposit, defaultName, defaultTitle, demo, preview }: Props) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [title, setTitle] = useState(defaultTitle)
  const [method, setMethod] = useState<'typed' | 'drawn'>('typed')
  const [agree, setAgree] = useState(false)
  const [option, setOption] = useState(options?.length === 1 ? options[0]._key : '')
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
      setState({ done: demo ? 'Sample only: nothing was signed or sent.' : 'Signed. A copy is on its way to your inbox.' })
      if (!demo) router.refresh()
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
                  <span className="small">{cad(o.total)} + GST</span>
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
        You’ll get the signed PDF by email, with a certificate page recording your name, email, the time and this device. Signing books your project in.
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
