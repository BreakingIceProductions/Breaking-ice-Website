'use client'

import Link from 'next/link'
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
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'invalid'>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const alertRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    setName(String(f.get('name')).split(' ')[0])
    setState('sending')
    // Preview build: nothing is sent yet. Slack, Google Sheet and inbox are wired in the next round.
    setTimeout(() => {
      setState('sent')
      setTimeout(() => doneRef.current?.focus(), 0)
    }, 600)
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
        <p className="caption" style={{ margin: 0 }}>Preview: nothing was actually sent. The form is connected in the next build round.</p>
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
