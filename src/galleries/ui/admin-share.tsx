'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorText, fmtDay, galleryAction } from './admin-api'

export type Recipient = { name?: string; email: string }

type Props = {
  id: string
  title: string
  status: 'draft' | 'live'
  shareOn: boolean
  shareUrl: string
  hasPassword: boolean
  expiresOn?: string
  recipients: Recipient[]
  ro: boolean
}

const firstName = (r: Recipient[]) => (r.length === 1 && r[0].name ? r[0].name.split(/\s+/)[0] : '')

/** A mailto: address with a prefilled subject and body. Josh reviews it and presses Send in his own mail app. */
export function mailto(to: Recipient[], subject: string, body: string) {
  const q = new URLSearchParams({ subject, body }).toString().replace(/\+/g, '%20')
  return `mailto:${to.map((r) => encodeURIComponent(r.email)).join(',')}?${q}`
}

/** The email that hands the gallery over. Never includes the password: that goes separately. */
export function handoverEmail(p: Pick<Props, 'title' | 'shareUrl' | 'hasPassword' | 'expiresOn' | 'recipients'>) {
  const hi = firstName(p.recipients)
  const lines = [
    `Hi ${hi || 'there'},`,
    '',
    `Your photos from ${p.title} are ready. You can view and download them here:`,
    p.shareUrl,
    '',
    ...(p.hasPassword ? ['The gallery has a password. I’ll send it to you separately.', ''] : []),
    ...(p.expiresOn ? [`The gallery is open until ${fmtDay(p.expiresOn)}, so please download anything you’d like to keep before then.`, ''] : []),
    'Tap the heart on any photo to mark your favourites, and I’ll see your picks on my end.',
    '',
    'Thanks,',
    'Josh',
  ]
  return mailto(p.recipients, `Your photos from ${p.title} are ready`, lines.join('\n'))
}

/** The share link: on/off, copy, password, a fresh address, and the hand-over email. */
export function SharePanel(p: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const working = p.status === 'live' && p.shareOn

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setMsg('')
    const r = await galleryAction(p.id, body)
    setBusy(false)
    if (!r.ok) {
      setMsg(errorText(r))
      return false
    }
    setMsg(done)
    router.refresh()
    return true
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.shareUrl)
      setMsg('Link copied.')
    } catch {
      setMsg('Select the link and copy it.')
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pw.trim().length < 4) return setMsg('Passwords need at least 4 characters.')
    if (await run({ action: 'password', password: pw }, 'Password set. Anyone opening the link now needs it (people already in are asked again).')) setPw('')
  }

  function newLink() {
    if (!window.confirm('Make a new link? The current one stops working straight away, for everyone who has it.')) return
    void run({ action: 'new-link' }, 'New link made. The old one no longer works.')
  }

  return (
    <section className="p-card ga-panel" aria-labelledby="ga-share-h">
      <div className="a-card-head">
        <h2 id="ga-share-h" className="a-h2">Share link</h2>
        <span className={`a-conn-state ${working ? 'on' : 'off'}`}>{working ? 'Working' : p.shareOn ? 'On, but gallery is a draft' : 'Off'}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        For anyone without a portal sign-in. The link only works while the gallery is Live and the link is on. Their client contacts also see Live galleries in their portal.
      </p>
      <label className="a-check">
        <input type="checkbox" checked={p.shareOn} disabled={p.ro || busy} onChange={(e) => run({ action: 'update', shareOn: e.target.checked }, e.target.checked ? 'Share link switched on.' : 'Share link switched off.')} />
        <span>Share link on</span>
      </label>
      <label className="small muted" htmlFor="ga-share-url">Link</label>
      <div className="ga-copy-row">
        <input id="ga-share-url" className="input" readOnly value={p.shareUrl} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-primary btn-sm" onClick={copy}>Copy</button>
      </div>

      <div className="ga-sub">
        <h3 className="ga-h3">Password</h3>
        <p className="muted small" style={{ margin: 0 }}>{p.hasPassword ? 'Set. People with the link are asked for it.' : 'None. Anyone with the link can open it.'}</p>
        {!p.ro && (
          <form className="ga-copy-row" onSubmit={savePassword}>
            <label className="sr-only" htmlFor="ga-pw">{p.hasPassword ? 'New password' : 'Password'}</label>
            <input id="ga-pw" className="input" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={p.hasPassword ? 'New password' : 'At least 4 characters'} minLength={4} maxLength={200} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? 'Hide' : 'Show'}</button>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !pw}>{p.hasPassword ? 'Change' : 'Set'}</button>
          </form>
        )}
        {!p.ro && p.hasPassword && (
          <div>
            <button type="button" className="linklike" disabled={busy} onClick={() => run({ action: 'password', password: null }, 'Password removed.')}>Remove the password</button>
          </div>
        )}
      </div>

      <div className="ga-sub">
        <h3 className="ga-h3">Email the client</h3>
        {p.recipients.length ? (
          <p className="muted small" style={{ margin: 0 }}>Opens a draft in your mail app to {p.recipients.map((r) => r.name || r.email).join(', ')}. Check it, then press Send.</p>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>No client contacts on file, so the draft opens without a recipient.</p>
        )}
        {p.hasPassword && <p className="muted small" style={{ margin: 0 }}>The email says a password is needed but doesn’t include it. Send that separately.</p>}
        <div className="btn-row">
          {working ? (
            <a className="btn btn-secondary btn-sm" href={handoverEmail(p)}>Draft the email</a>
          ) : (
            <span className="muted small">Make the gallery live and switch the link on first.</span>
          )}
          {!p.ro && (
            <button type="button" className="linklike" disabled={busy} onClick={newLink}>Make a new link</button>
          )}
        </div>
      </div>
      {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
  )
}
