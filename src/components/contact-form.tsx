'use client'

import Link from 'next/link'
import { track } from '@vercel/analytics'
import { useEffect, useRef, useState } from 'react'

type Opt = { value: string; label: string }

export function ContactForm({
  services,
  budget,
  timeline,
  heard,
  privacyLine,
  successHeadline,
  successMessage,
  nextSteps,
  bookingLink,
  email,
}: {
  services: Opt[]
  budget: string[]
  timeline: string[]
  heard: string[]
  privacyLine: string
  successHeadline: string
  successMessage: string
  nextSteps: { title: string; text: string }[]
  bookingLink?: string
  email: string
}) {
  // Prefill from ?type= after load, so the form itself is in the server HTML.
  const [type, setType] = useState('')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type')
    if (t) setType(t)
  }, [])
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'invalid' | 'failed'>('idle')
  const [mailto, setMailto] = useState('')
  const [failNote, setFailNote] = useState('')
  const startedAt = useRef(0)
  useEffect(() => {
    startedAt.current = Date.now()
  }, [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const alertRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const errs: Record<string, string> = {}
    if (!String(f.get('name') || '').trim()) errs.name = 'Please tell us your name.'
    const em = String(f.get('email') || '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errs.email = 'That email doesn’t look quite right.'
    if (!String(f.get('story') || '').trim()) errs.story = 'A sentence or two is plenty.'
    setErrors(errs)
    if (Object.keys(errs).length) {
      setState('invalid')
      setTimeout(() => alertRef.current?.focus(), 0)
      return
    }
    const first = String(f.get('name')).trim().split(' ')[0]
    setName(first)
    setState('sending')
    const typeLabel = services.find((x) => x.value === type)?.label
      || ({ 'something-else': 'Something else', 'not-sure': 'Not sure yet' } as Record<string, string>)[type]
      || ''
    const payload = {
      name: f.get('name'), email: f.get('email'), organization: f.get('organization'),
      type: typeLabel, story: f.get('story'), budget: f.get('budget'), timeline: f.get('timeline'),
      heard: f.get('heard'), website: f.get('website'), startedAt: startedAt.current,
      page: window.location.pathname + window.location.search,
    }
    // If sending fails, the visitor can still email with everything they typed.
    const bodyText = `${payload.story}\n\n${payload.name}${payload.organization ? `, ${payload.organization}` : ''}`
    setMailto(`mailto:${email}?subject=${encodeURIComponent(`Enquiry${typeLabel ? `: ${typeLabel}` : ''}`)}&body=${encodeURIComponent(String(bodyText))}`)
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        track('Contact form sent', { type: typeLabel || 'unspecified', heard: String(payload.heard || 'unspecified') })
        setState('sent')
        setTimeout(() => doneRef.current?.focus(), 0)
        return
      }
      const data = await res.json().catch(() => ({}))
      setFailNote(
        data.error === 'not-configured'
          ? 'This form isn’t switched on yet, so your message wasn’t sent.'
          : data.error === 'too-many'
            ? 'That’s a lot of messages in a short time, so we paused this one.'
            : 'Something went wrong on our end and your message didn’t send.',
      )
    } catch {
      setFailNote('We couldn’t reach the server, so your message didn’t send.')
    }
    track('Contact form failed')
    setState('failed')
    setTimeout(() => alertRef.current?.focus(), 0)
  }

  if (state === 'sent') {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="success cut-lg">
        <span className="eyebrow">Message sent</span>
        <h2 className="h2">{successHeadline}</h2>
        <p className="muted" style={{ margin: 0 }}>{successMessage.replace('[first name]', name || 'there')}</p>
        <ol className="steps-list" style={{ width: '100%' }}>
          {nextSteps.map((s, i) => <li key={i}><span><strong>{s.title}</strong> {s.text}</span></li>)}
        </ol>
        {bookingLink && (
          <div className="book-card" style={{ width: '100%' }}>
            <strong>Want to skip the back-and-forth?</strong>
            <a className="btn btn-primary" href={bookingLink} target="_blank" rel="noopener noreferrer">Book a 20-minute call ↗</a>
          </div>
        )}
        <div className="btn-row">
          <Link className="btn btn-secondary" href="/stories">See the stories</Link>
          <Link className="link-arrow" href="/">Back to home <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    )
  }

  const err = (k: string) => errors[k] && <span id={`e-${k}`} className="err">{errors[k]}</span>
  const inv = (k: string) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `e-${k}` } : {})

  return (
    <form className="stack" style={{ gap: 28 }} onSubmit={onSubmit} noValidate aria-label="Contact form">
      {state === 'invalid' && (
        <div ref={alertRef} tabIndex={-1} role="alert" className="alert">
          <strong>A couple of things need a look:</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#c-${k}`}>{v}</a></li>)}
          </ul>
        </div>
      )}
      {state === 'failed' && (
        <div ref={alertRef} tabIndex={-1} role="alert" className="alert">
          <strong>{failNote}</strong>
          <span>Nothing you typed is lost. <a href={mailto}>Email it to {email} instead</a> (it opens with your message filled in), or try Send again.</span>
        </div>
      )}
      {/* Spam trap: hidden from people and screen readers. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="form">
        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input className="input" id="c-name" name="name" autoComplete="name" {...inv('name')} />
          {err('name')}
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input className="input" id="c-email" name="email" type="email" autoComplete="email" {...inv('email')} />
          {err('email')}
        </div>
        <div className="field full">
          <label htmlFor="c-org">Organization <span className="hint">(optional)</span></label>
          <input className="input" id="c-org" name="organization" autoComplete="organization" />
        </div>
        <div className="field full">
          <label htmlFor="c-type">What do you need?</label>
          <select className="input" id="c-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Select one</option>
            {services.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            <option value="something-else">Something else</option>
            <option value="not-sure">Not sure yet</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor="c-story">What’s the story?</label>
          <textarea className="input" id="c-story" name="story" {...inv('story')} />
          {err('story')}
        </div>
        <div className="field">
          <label htmlFor="c-budget">Budget range <span className="hint">(optional)</span></label>
          <select className="input" id="c-budget" name="budget" defaultValue="">
            <option value="">Select a range</option>
            {budget.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-time">Timeline <span className="hint">(optional)</span></label>
          <select className="input" id="c-time" name="timeline" defaultValue="">
            <option value="">Select a timeline</option>
            {timeline.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="c-heard">How did you hear about us? <span className="hint">(optional)</span></label>
          <select className="input" id="c-heard" name="heard" defaultValue="">
            <option value="">Select one</option>
            {heard.map((h) => <option key={h}>{h}</option>)}
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
        <span className="caption">Or email <a className="text-link" href={`mailto:${email}`}>{email}</a></span>
      </div>
      <p className="caption" style={{ margin: 0 }}>
        {privacyLine} <Link className="text-link" href="/privacy">Privacy</Link>
      </p>
    </form>
  )
}
