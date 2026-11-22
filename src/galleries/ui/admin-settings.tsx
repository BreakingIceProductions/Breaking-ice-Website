'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { daysLeft, type GalleryDownloads } from '../types'
import { errorText, fmtDay, galleryAction } from './admin-api'
import { mailto, type Recipient } from './admin-share'

/** Saves one change and refreshes the page's server data; returns a status line to show. */
function useSave(id: string) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setMsg('')
    const r = await galleryAction(id, { action: 'update', ...body })
    setBusy(false)
    setMsg(r.ok ? done : errorText(r))
    if (r.ok) router.refresh()
    return r.ok
  }
  return { busy, msg, save }
}

/** When the gallery closes, and a reminder email draft once it's close. */
export function ExpiryPanel({ id, title, expiresOn, shareUrl, canLink, recipients, ro }: { id: string; title: string; expiresOn?: string; shareUrl: string; canLink: boolean; recipients: Recipient[]; ro: boolean }) {
  const { busy, msg, save } = useSave(id)
  const [value, setValue] = useState(expiresOn ?? '')
  const left = daysLeft({ expiresOn })
  const status = left === null ? 'Never closes' : left < 0 ? `Closed ${fmtDay(expiresOn)}` : left === 0 ? 'Closes today' : `Closes in ${left} ${left === 1 ? 'day' : 'days'}`
  const reminder =
    left !== null && left >= 0 && left <= 7 && canLink
      ? mailto(
          recipients,
          `Reminder: your ${title} gallery closes ${fmtDay(expiresOn)}`,
          [
            `Hi ${recipients.length === 1 && recipients[0].name ? recipients[0].name.split(/\s+/)[0] : 'there'},`,
            '',
            `A quick reminder that your photo gallery from ${title} closes on ${fmtDay(expiresOn)}. If there’s anything you’d like to keep, please download it before then:`,
            shareUrl,
            '',
            'Thanks,',
            'Josh',
          ].join('\n'),
        )
      : ''

  return (
    <section className="p-card ga-panel" aria-labelledby="ga-exp-h">
      <div className="a-card-head">
        <h2 id="ga-exp-h" className="a-h2">Closes</h2>
        <span className={`small ${left !== null && left <= 7 ? 'a-urgent' : 'muted'}`}>{status}</span>
      </div>
      <p className="muted small m0">The last day the client can open it. After that the link and the portal show it as closed. Leave empty to keep it open.</p>
      <form
        className="ga-copy-row"
        onSubmit={(e) => {
          e.preventDefault()
          void save({ expiresOn: value }, value ? `Closes after ${fmtDay(value)}.` : 'No closing date.')
        }}
      >
        <label className="sr-only" htmlFor="ga-exp">Last day open</label>
        <input id="ga-exp" className="input" type="date" value={value} onChange={(e) => setValue(e.target.value)} disabled={ro || busy} />
        {!ro && (
          <>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || value === (expiresOn ?? '')}>Save</button>
            {expiresOn && (
              <button
                type="button"
                className="linklike"
                disabled={busy}
                onClick={() => {
                  setValue('')
                  void save({ expiresOn: '' }, 'No closing date.')
                }}
              >
                Clear
              </button>
            )}
          </>
        )}
      </form>
      {reminder && (
        <p className="m0">
          <a className="btn btn-secondary btn-sm" href={reminder}>Draft a reminder</a>
        </p>
      )}
      {msg && <p className="small muted m0" role="status">{msg}</p>}
    </section>
  )
}

const DL: { k: keyof GalleryDownloads; label: string; note: string }[] = [
  { k: 'full', label: 'Full-size', note: 'The original files' },
  { k: 'web', label: 'Web-size', note: 'Copies about 2048 px on the long side' },
  { k: 'all', label: 'Download all', note: 'Zips of the whole gallery or a set' },
]

/** Which downloads the client gets. */
export function DownloadsPanel({ id, downloads, ro }: { id: string; downloads: GalleryDownloads; ro: boolean }) {
  const { busy, msg, save } = useSave(id)
  return (
    <section className="p-card ga-panel" aria-labelledby="ga-dl-h">
      <h2 id="ga-dl-h" className="a-h2">Downloads</h2>
      <ul className="ga-toggles">
        {DL.map((d) => (
          <li key={d.k}>
            <label className="a-check">
              <input type="checkbox" checked={downloads[d.k]} disabled={ro || busy} onChange={(e) => save({ downloads: { [d.k]: e.target.checked } }, `${d.label} ${e.target.checked ? 'on' : 'off'}.`)} />
              <span>
                {d.label} <span className="muted small">· {d.note}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!downloads.full && !downloads.web && <p className="muted small m0">Both sizes are off, so the client can look but not download.</p>}
      {msg && <p className="small muted m0" role="status">{msg}</p>}
    </section>
  )
}

/** A short note shown to the client under the gallery's title. */
export function MessagePanel({ id, message, ro }: { id: string; message?: string; ro: boolean }) {
  const { busy, msg, save } = useSave(id)
  const [value, setValue] = useState(message ?? '')
  return (
    <section className="p-card ga-panel" aria-labelledby="ga-msg-h">
      <h2 id="ga-msg-h" className="a-h2">Message</h2>
      <form
        className="stack gap-3"
       
        onSubmit={(e) => {
          e.preventDefault()
          void save({ message: value }, value.trim() ? 'Message saved.' : 'Message removed.')
        }}
      >
        <label className="muted small" htmlFor="ga-msg">Shown under the title. Keep it short.</label>
        <textarea id="ga-msg" className="input ga-textarea" rows={3} maxLength={1000} value={value} onChange={(e) => setValue(e.target.value)} disabled={ro || busy} placeholder="Thanks for having us out. Here are the highlights." />
        {!ro && (
          <div>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || value === (message ?? '')}>Save message</button>
          </div>
        )}
      </form>
      {msg && <p className="small muted m0" role="status">{msg}</p>}
    </section>
  )
}
