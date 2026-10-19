'use client'

import { useEffect, useRef, useState } from 'react'

export function AdminSignInForm({ initialPending, notice }: { initialPending?: string; notice?: string }) {
  const [step, setStep] = useState<'email' | 'code'>(initialPending ? 'code' : 'email')
  const [email, setEmail] = useState(initialPending ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (step === 'code') headRef.current?.focus()
  }, [step])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/admin/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setStep('code')
      else
        setError(
          j.error === 'invalid' ? 'That email doesn’t look quite right.'
          : j.error === 'too-many' ? 'Too many tries. Wait 15 minutes and ask again.'
          : j.error === 'not-configured' ? 'Sign-in needs PORTAL_SECRET, SANITY_PORTAL_TOKEN and RESEND_API_KEY set in Vercel.'
          : 'The email couldn’t be sent. Try again in a minute.',
        )
    } catch {
      setError('Couldn’t reach the server. Check your connection.')
    }
    setBusy(false)
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        window.location.assign('/admin')
        return
      }
      setError(
        j.error === 'locked' ? 'Too many wrong codes. Ask for a new email.'
        : j.error === 'expired' ? 'That code has expired. Ask for a new one.'
        : 'That code isn’t right. Check the latest email.',
      )
    } catch {
      setError('Couldn’t reach the server. Check your connection.')
    }
    setBusy(false)
  }

  if (step === 'code')
    return (
      <form onSubmit={verify} className="stack" style={{ gap: 'var(--space-4)' }} noValidate>
        <h1 ref={headRef} tabIndex={-1} className="h2" style={{ outline: 'none' }}>Check your email</h1>
        <p className="muted" style={{ margin: 0 }}>If {email || 'that address'} can open the back office, a link and a 6-digit code are on their way. Tap the link, or type the code here.</p>
        <div className="field">
          <label htmlFor="a-code">Code</label>
          <input id="a-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'signin-err' : undefined} />
        </div>
        {error && <p id="signin-err" role="alert" className="err">{error}</p>}
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={busy || code.replace(/\D/g, '').length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button className="linklike" type="button" onClick={() => { setStep('email'); setCode(''); setError('') }}>Use a different email</button>
        </div>
      </form>
    )

  return (
    <form onSubmit={send} className="stack" style={{ gap: 'var(--space-4)' }} noValidate>
      <h1 className="h2">Back office</h1>
      <p className="muted" style={{ margin: 0 }}>We’ll email you a sign-in link and code.</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="field">
        <label htmlFor="a-email">Email</label>
        <input id="a-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'signin-err' : undefined} />
      </div>
      {error && <p id="signin-err" role="alert" className="err">{error}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
      </div>
    </form>
  )
}
