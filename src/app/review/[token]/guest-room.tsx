'use client'

import { useState } from 'react'
import { ReviewRoom } from '@/portal/review-room'
import type { DeliverableStatus } from '@/portal/types'

type Room = { deliverableKey: string; title: string; versionLabel: string; fps: number; duration?: number; status: DeliverableStatus; note?: string }

const newId = () => {
  const a = new Uint8Array(18)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Asks a guest for their name once, keeps it (and a random id) in cookies for this link only, then opens the room. */
export function GuestRoom({ token, initialName, initialId, room }: { token: string; initialName: string; initialId: string; room: Room }) {
  const [name, setName] = useState(initialName)
  const [id] = useState(() => initialId || newId())
  const [typed, setTyped] = useState('')
  const [watching, setWatching] = useState(false)

  const save = (value: string) => {
    const path = `/review/${encodeURIComponent(token)}`
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    const age = 180 * 86_400
    document.cookie = `bi_rv_name=${encodeURIComponent(value)}; Path=${path}; Max-Age=${age}; SameSite=Lax${secure}`
    document.cookie = `bi_rv_id=${id}; Path=${path}; Max-Age=${age}; SameSite=Lax${secure}`
    setName(value)
  }

  if (!name && !watching)
    return (
      <form
        className="rv-gate"
        onSubmit={(e) => {
          e.preventDefault()
          const v = typed.replace(/[<>]/g, '').trim().slice(0, 60)
          if (v) save(v)
        }}
      >
        <h2 className="rr-h" style={{ fontSize: 20 }}>Who’s watching?</h2>
        <p className="small muted" style={{ margin: 0 }}>Your name goes next to your comments so the team knows who said what. No account needed.</p>
        <label htmlFor="rv-name" className="small">Your name</label>
        <input id="rv-name" className="input" autoComplete="name" maxLength={60} value={typed} onChange={(e) => setTyped(e.target.value)} required />
        <div className="rr-decide-row">
          <button type="submit" className="btn btn-primary btn-sm" disabled={!typed.trim()}>Continue</button>
          <button type="button" className="linklike small" onClick={() => setWatching(true)}>Just watch</button>
        </div>
      </form>
    )

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <p className="small muted" style={{ margin: 0 }}>
        {name ? <>Commenting as <strong>{name}</strong>. </> : <>Watching only. </>}
        <button type="button" className="linklike small" onClick={() => { setTyped(name); setName(''); setWatching(false) }}>{name ? 'Change name' : 'Add your name to comment'}</button>
      </p>
      <ReviewRoom via="share" token={token} guest={name ? { name, id } : undefined} {...room} />
    </div>
  )
}
