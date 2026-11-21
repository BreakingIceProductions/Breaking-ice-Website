'use client'

import { ArrowLink } from './brand'
import { PREFILL_KEY } from './prefill-contact-link'

import Link from 'next/link'
import { track } from '@vercel/analytics'
import { useEffect, useRef, useState } from 'react'

type Opt = { value: string; label: string }

export function ContactForm({
  services,
  offers = [],
  labels = { offer: 'Which offer interests you?', offerHelp: '', story: 'What is your story?' },
  budget,
  timeline,
  heard,
  privacyLine,
  successHeadline,
  successMessage,
  nextSteps,
  bookingLink,
  email,
  submitLabel = 'Send',
  errorHeadline = 'A couple of things need a look:',
  deliveryErrorHeadline,
  deliveryErrorMessage = 'Your text is still here.',
}: {
  services: Opt[]
  /** The three offers; the form adds "Not sure yet" as the default. */
  offers?: Opt[]
  /** Field labels (Sanity contactPage, with fallbacks in src/lib/offers.ts COPY.contact). */
  labels?: { offer: string; offerHelp: string; story: string; storyPlaceholder?: string }
  budget: string[]
  timeline: string[]
  heard: string[]
  privacyLine: string
  successHeadline: string
  successMessage: string
  nextSteps: { title: string; text: string }[]
  bookingLink?: string
  email: string
  submitLabel?: string
  errorHeadline?: string
  /** CMS override; when empty the specific reason is shown instead. */
  deliveryErrorHeadline?: string
  deliveryErrorMessage?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  // Prefill from the URL after load, so the form itself is in the server HTML.
  // ?type=<service-slug> comes from service pages (kept as the enquiry's "Needs" and a story prefill); name, email and organization from the client portal
  // (through sessionStorage, so they never sit in the URL).
  const [type, setType] = useState('')
  // ?offer=<offer-slug> comes from the offer pages' "Start a conversation".
  const [offer, setOffer] = useState('not-sure')
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const form = formRef.current
    const fill = (field: string, value: string | null) => {
      const el = form?.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement | null
      if (el && value && !el.value.trim()) el.value = value.slice(0, 500)
    }
    let handoff: Record<string, string> = {}
    try {
      handoff = JSON.parse(sessionStorage.getItem(PREFILL_KEY) ?? '{}')
      sessionStorage.removeItem(PREFILL_KEY)
    } catch {}
    fill('name', handoff.name ?? null)
    fill('email', handoff.email ?? null)
    fill('organization', handoff.organization ?? null)
    const o = q.get('offer')
    if (o && offers.some((x) => x.value === o)) setOffer(o)
    const t = q.get('type')
    if (t) {
      setType(t)
      const service = services.find((x) => x.value === t)
      if (service) fill('story', `We’re looking for help with ${service.label}: `)
    }
    // Only on first load, so it never overwrites what the visitor has typed.
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errs.email = 'Please check your email address.'
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
    // "Needs": the service a service page sent (?type=), else the offer chosen here, so the email, Slack and the
    // Google Sheet's existing "type" column always get a sensible value.
    const offerLabel = offers.find((x) => x.value === offer)?.label || 'Not sure yet'
    const serviceLabel = services.find((x) => x.value === type)?.label || ''
    const typeLabel = serviceLabel || offerLabel
    const payload = {
      name: f.get('name'), email: f.get('email'), organization: f.get('organization'),
      type: typeLabel, offer: offerLabel, story: f.get('story'), budget: f.get('budget'), timeline: f.get('timeline'),
      heard: f.get('heard'), website: f.get('website'), startedAt: startedAt.current,
      page: window.location.pathname + window.location.search,
    }
    // If sending fails, the visitor can still email with everything they typed.
    const bodyText = `${payload.story}\n\n${payload.name}${payload.organization ? `, ${payload.organization}` : ''}`
    setMailto(`mailto:${email}?subject=${encodeURIComponent(`Enquiry${typeLabel ? `: ${typeLabel}` : ''}`)}&body=${encodeURIComponent(String(bodyText))}`)
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        track('Contact form sent', { type: typeLabel || 'unspecified', offer: String(payload.offer), heard: String(payload.heard || 'unspecified') })
        setState('sent')
        setTimeout(() => doneRef.current?.focus(), 0)
        return
      }
      const data = await res.json().catch(() => ({}))
      setFailNote(
        data.error === 'not-configured'
          ? 'This form isn’t switched on yet, so your message wasn’t sent.'
          : data.error === 'invalid' || data.error === 'bad-request'
            ? 'Something in the form didn’t come through right, so your message wasn’t sent. Check your email address and try again.'
          : data.error === 'too-many'
            ? 'That’s a lot of messages in a short time, so we paused this one.'
            : 'We had a problem, and your message did not send.',
      )
    } catch {
      setFailNote('We could not connect, so your message did not send.')
    }
    track('Contact form failed')
    setState('failed')
    setTimeout(() => alertRef.current?.focus(), 0)
  }

  if (state === 'sent') {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="success">
        <span className="eyebrow">Message sent</span>
        <h2 className="h2">{successHeadline}</h2>
        <p className="muted" style={{ margin: 0 }}>{successMessage.replace('[first name]', name || 'there')}</p>
        <ol className="steps-list" style={{ width: '100%' }}>
          {nextSteps.map((s, i) => <li key={i}><span><strong>{s.title}</strong> {s.text}</span></li>)}
        </ol>
        {bookingLink && (
          <div className="book-card" style={{ width: '100%' }}>
            <strong>Want to talk now?</strong>
            <a className="btn btn-primary" href={bookingLink} target="_blank" rel="noopener noreferrer">Book a 20-minute call ↗</a>
          </div>
        )}
        <div className="btn-row">
          <Link className="btn btn-secondary" href="/stories">See the stories</Link>
          <ArrowLink href="/">Back to home</ArrowLink>
        </div>
      </div>
    )
  }

  const err = (k: string) => errors[k] && <span id={`e-${k}`} className="err">{errors[k]}</span>
  const inv = (k: string) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `e-${k}` } : {})

  return (
    <form ref={formRef} className="stack" style={{ gap: 'var(--space-6)' }} onSubmit={onSubmit} noValidate aria-label="Contact form">
      {state === 'invalid' && (
        <div ref={alertRef} tabIndex={-1} role="alert" className="alert">
          <strong>{errorHeadline}</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#c-${k}`}>{v}</a></li>)}
          </ul>
        </div>
      )}
      {state === 'failed' && (
        <div ref={alertRef} tabIndex={-1} role="alert" className="alert">
          <strong>{deliveryErrorHeadline || failNote}</strong>
          <span>
            {deliveryErrorHeadline ? `${failNote} ` : ''}
            {deliveryErrorMessage} <a href={mailto}>Email it to {email} instead</a> (it opens with your message filled in), or try again.
          </span>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-secondary">Try again</button>
          </div>
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
          <input className="input" id="c-name" name="name" autoComplete="name" aria-required="true" maxLength={120} {...inv('name')} />
          {err('name')}
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input className="input" id="c-email" name="email" type="email" autoComplete="email" aria-required="true" maxLength={200} {...inv('email')} />
          {err('email')}
        </div>
        <div className="field full">
          <label htmlFor="c-org">Organization <span className="hint">(optional)</span></label>
          <input className="input" id="c-org" name="organization" autoComplete="organization" />
        </div>
        {/* One no-pressure question. It replaces the old "What do you need?" list of services. */}
        <div className="field full">
          <label htmlFor="c-offer">{labels.offer} <span className="hint">(optional)</span></label>
          <select className="input" id="c-offer" name="offer" value={offer} onChange={(e) => setOffer(e.target.value)} aria-describedby="c-offer-help">
            {offers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="not-sure">Not sure yet</option>
          </select>
          <span id="c-offer-help" className="hint">{labels.offerHelp}</span>
        </div>
        <div className="field full">
          <label htmlFor="c-story">{labels.story}</label>
          <textarea className="input" id="c-story" name="story" aria-required="true" maxLength={5000} placeholder={labels.storyPlaceholder} {...inv('story')} />
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
        <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : submitLabel}</button>
        <span className="caption">Or email <a className="text-link" href={`mailto:${email}`}>{email}</a></span>
      </div>
      <p className="caption" style={{ margin: 0 }}>
        {privacyLine} <Link className="text-link" href="/privacy">Privacy</Link>
      </p>
    </form>
  )
}
