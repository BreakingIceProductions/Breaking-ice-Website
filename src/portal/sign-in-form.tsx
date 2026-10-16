'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  headline: string
  intro: string
  checkHeadline: string
  checkMessage: string
  demo: boolean
  initialPending?: string
  next?: string
  notice?: string
}

export function SignInForm({ headline, intro, checkHeadline, checkMessage, demo, initialPending, next, notice }: Props) {
  const [step, setStep] = useState<'email' | 'code'>(initialPending ? 'code' : 'email')
  const [email, setEmail] = useState(initialPending ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const headRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (step === 'code') {
      headRef.current?.focus()
    }
  }, [step])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('That email doesn’t look quite right.')
      emailRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/portal/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, next }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setStep('code')
        setCode('')
      } else
        setError(
          j.error === 'too-many' ? 'That’s a lot of tries. Wait 15 minutes, then ask for a new link.'
          : j.error === 'not-configured' ? 'The client portal isn’t switched on yet. Email josh@breakingiceproductions.com and we’ll send what you need.'
          : 'We couldn’t send the email just now. Try again in a minute.',
        )
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.')
    }
    setBusy(false)
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) {
      setError('The code is 6 digits.')
      codeRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/portal/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: digits, next }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        window.location.assign(j.next || '/portal')
        return
      }
      setError(
        j.error === 'locked' ? 'Too many wrong codes. Ask for a new email below.'
        : j.error === 'expired' ? 'That code has expired. Ask for a new email below.'
        : 'That code doesn’t match. Check the newest email from us and try again.',
      )
      codeRef.current?.focus()
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.')
    }
    setBusy(false)
  }

  async function preview() {
    setBusy(true)
    const r = await fetch('/api/portal/demo', { method: 'POST' }).catch(() => null)
    if (r?.ok) window.location.assign('/portal')
    else {
      setBusy(false)
      setError('The sample project isn’t available right now.')
    }
  }

  if (step === 'code') {
    return (
      <div className="stack signin-step" style={{ gap: 'var(--space-6)' }}>
        <h1 ref={headRef} tabIndex={-1} className="h1">{checkHeadline}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {checkMessage}
          {email && <> We sent it to <strong>{email}</strong>.</>}
        </p>
        <form onSubmit={verify} className="stack" style={{ gap: 'var(--space-4)' }} noValidate>
          <div className="field">
            <label htmlFor="p-code">Or type the 6-digit code from the email</label>
            <input
              ref={codeRef}
              id="p-code"
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'p-err' : 'p-code-hint'}
            />
            <span id="p-code-hint" className="hint">It works on this device for 15 minutes.</span>
          </div>
          {error && <p id="p-err" role="alert" className="err" style={{ margin: 0 }}>{error}</p>}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          </div>
        </form>
        <div className="btn-row">
          <button type="button" className="linklike" onClick={() => send()} disabled={busy}>Send a new email</button>
          <span className="muted" aria-hidden="true">·</span>
          <button
            type="button"
            className="linklike"
            onClick={() => {
              setStep('email')
              setError('')
              setTimeout(() => emailRef.current?.focus(), 0)
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack signin-step" style={{ gap: 'var(--space-6)' }}>
      <h1 className="h1">{headline}</h1>
      <p className="muted body-lg" style={{ margin: 0 }}>{intro}</p>
      {notice && <p className="notice" role="status" style={{ margin: 0 }}>{notice}</p>}
      <form onSubmit={send} className="stack" style={{ gap: 'var(--space-4)' }} noValidate>
        <div className="field">
          <label htmlFor="p-email">Email</label>
          <input
            ref={emailRef}
            id="p-email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'p-err' : 'p-email-hint'}
          />
          <span id="p-email-hint" className="hint">Use the email we have on your project.</span>
        </div>
        {error && <p id="p-err" role="alert" className="err" style={{ margin: 0 }}>{error}</p>}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
        </div>
      </form>
      {demo && (
        <div className="demo-box">
          <strong>Curious what it looks like?</strong>
          <span className="muted small">Open a sample project with made-up content. Nothing is sent anywhere.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={preview} disabled={busy}>See a sample project</button>
        </div>
      )}
    </div>
  )
}
