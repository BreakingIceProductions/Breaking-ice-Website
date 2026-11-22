'use client'

import { useEffect, useRef, useState } from 'react'

export function AdminSignInForm({ initialPending, notice }: { initialPending?: string; notice?: string }) {
  const [step, setStep] = useState<'email' | 'code'>(initialPending ? 'code' : 'email')
  const [email, setEmail] = useState(initialPending ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Whether the error is about what was typed (so the field is marked invalid), not the server or the network.
  const [fieldError, setFieldError] = useState(false)
  const headRef = useRef<HTMLHeadingElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const moved = useRef(false)

  // On a step change, focus moves with it: the "Check your email" heading, or back to the email field.
  useEffect(() => {
    if (!moved.current) { moved.current = true; return }
    if (step === 'code') headRef.current?.focus()
    else emailRef.current?.focus()
  }, [step])

  // A field error puts the cursor back in the field to fix it.
  useEffect(() => {
    if (!fieldError) return
    ;(step === 'code' ? codeRef : emailRef).current?.focus()
  }, [fieldError, error, step])

  const fail = (text: string, onField: boolean) => { setError(text); setFieldError(onField) }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    fail('', false)
    setBusy(true)
    try {
      const r = await fetch('/api/admin/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setStep('code')
      else
        fail(
          j.error === 'invalid' ? 'That email doesn’t look quite right.'
          : j.error === 'too-many' ? 'Too many tries. Wait 15 minutes and ask again.'
          : j.error === 'not-configured' ? 'Sign-in isn’t set up on this site yet.'
          : 'The email couldn’t be sent. Try again in a minute.',
          j.error === 'invalid',
        )
    } catch {
      fail('Couldn’t reach the server. Check your connection.', false)
    }
    setBusy(false)
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    fail('', false)
    setBusy(true)
    try {
      const r = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        window.location.assign('/admin')
        return
      }
      fail(
        j.error === 'locked' ? 'Too many wrong codes. Ask for a new email.'
        : j.error === 'expired' ? 'That code has expired. Ask for a new one.'
        : 'That code isn’t right. Check the latest email.',
        j.error !== 'locked',
      )
    } catch {
      fail('Couldn’t reach the server. Check your connection.', false)
    }
    setBusy(false)
  }

  if (step === 'code')
    return (
      <form onSubmit={verify} className="stack gap-4" noValidate>
        <h1 ref={headRef} tabIndex={-1} className="h2 no-outline">Check your email</h1>
        <p className="muted m0">If {email || 'that address'} can open the back office, a link and a 6-digit code are on their way. Tap the link, or type the code here.</p>
        <div className="field">
          <label htmlFor="a-code">Code</label>
          <input ref={codeRef} id="a-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={fieldError || undefined} aria-describedby={error ? 'signin-err' : undefined} />
        </div>
        {error && <p id="signin-err" role="alert" className="err">{error}</p>}
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={busy || code.replace(/\D/g, '').length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button className="linklike" type="button" onClick={() => { setStep('email'); setCode(''); fail('', false) }}>Use a different email</button>
        </div>
      </form>
    )

  return (
    <form onSubmit={send} className="stack gap-4" noValidate>
      <h1 className="h2">Back office</h1>
      <p className="muted m0">We’ll email you a sign-in link and code.</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="field">
        <label htmlFor="a-email">Email</label>
        <input ref={emailRef} id="a-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={fieldError || undefined} aria-describedby={error ? 'signin-err' : undefined} />
      </div>
      {error && <p id="signin-err" role="alert" className="err">{error}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
      </div>
    </form>
  )
}
