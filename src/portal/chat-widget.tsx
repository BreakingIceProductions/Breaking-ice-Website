'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { ChatMessage } from './types'

type Tab = 'josh' | 'assistant'
const TABS: { id: Tab; label: string }[] = [
  { id: 'josh', label: 'Josh' },
  { id: 'assistant', label: 'Assistant' },
]
const READ_KEY = 'bi-chat-read'
const MAX = 2000

const readMarks = (): Record<Tab, string> => {
  try {
    return { josh: '', assistant: '', ...JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') }
  } catch {
    return { josh: '', assistant: '' }
  }
}
const saveMarks = (m: Record<Tab, string>) => {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(m))
  } catch {
    /* private window: unread badges just reset */
  }
}
const timeOf = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString('en-CA', today ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * The portal's chat: a button bottom-right, and a panel with a "Josh" tab (goes to Josh in Slack)
 * and an "Assistant" tab (the AI). Polls every 5 s while open, every minute while closed (for the badge).
 */
export function ChatWidget({ preview = false, producer = 'Josh' }: { preview?: boolean; producer?: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('josh')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [marks, setMarks] = useState<Record<Tab, string>>({ josh: '', assistant: '' })
  const [drafts, setDrafts] = useState<Record<Tab, string>>({ josh: '', assistant: '' })
  const [sending, setSending] = useState<Tab | null>(null)
  const [error, setError] = useState('')
  const [announce, setAnnounce] = useState('')
  const pathname = usePathname()
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const atBottom = useRef(true)
  const lastSeenKey = useRef('')
  const id = useId()

  useEffect(() => {
    setMarks(readMarks())
    // ?chat=open (from the "Josh replied" email) opens the panel.
    if (new URLSearchParams(window.location.search).get('chat') === 'open') setOpen(true)
  }, [])

  const load = useCallback(async () => {
    const r = await fetch('/api/portal/chat', { cache: 'no-store' }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; messages?: ChatMessage[] } | null
    if (!j?.ok || !j.messages) return
    setMessages((cur) => {
      // Keep messages still on their way (optimistic) until the server has them.
      const pending = cur.filter((m) => m._key.startsWith('tmp-'))
      return [...j.messages!, ...pending]
    })
  }, [])

  // Polling: 5 s open, 60 s closed, paused while the tab is hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let live = true
    const tick = async () => {
      if (document.visibilityState === 'visible') await load()
      if (live) timer = setTimeout(tick, open ? 5000 : 60_000)
    }
    tick()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      live = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [open, load])

  const inTab = useMemo(() => messages.filter((m) => m.tab === tab), [messages, tab])
  const unread = (t: Tab) => messages.filter((m) => m.tab === t && m.from !== 'client' && m.at > (marks[t] || '')).length
  const totalUnread = unread('josh') + unread('assistant')

  // Mark what's on screen as read, and announce a new incoming message.
  useEffect(() => {
    const newest = inTab[inTab.length - 1]
    if (!newest) return
    if (open && newest.at > (marks[tab] || '')) {
      const next = { ...marks, [tab]: newest.at }
      setMarks(next)
      saveMarks(next)
    }
    if (newest._key !== lastSeenKey.current) {
      if (lastSeenKey.current && newest.from !== 'client') setAnnounce(`${newest.from === 'josh' ? newest.who : 'Assistant'}: ${newest.text.slice(0, 200)}`)
      lastSeenKey.current = newest._key
    }
  }, [inTab, open, tab, marks])

  // Follow new messages, unless the reader has scrolled up.
  useEffect(() => {
    const el = list.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [inTab.length, open, tab])

  useEffect(() => {
    if (!open) return
    atBottom.current = true
    const t = setTimeout(() => input.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    setTimeout(() => button.current?.focus(), 0)
  }

  async function send() {
    const text = drafts[tab].trim().slice(0, MAX)
    if (!text || sending || preview) return
    const t = tab
    const tmp: ChatMessage = { _key: `tmp-${Date.now()}`, at: new Date().toISOString(), from: 'client', who: 'You', text, tab: t }
    setMessages((cur) => [...cur, tmp])
    setDrafts((d) => ({ ...d, [t]: '' }))
    setSending(t)
    setError('')
    atBottom.current = true
    const r = await fetch('/api/portal/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: t, text, page: pathname }) }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; added?: ChatMessage[]; error?: string } | null
    setSending(null)
    if (j?.ok && j.added) {
      setMessages((cur) => [...cur.filter((m) => m._key !== tmp._key), ...j.added!])
    } else {
      setMessages((cur) => cur.filter((m) => m._key !== tmp._key))
      setDrafts((d) => ({ ...d, [t]: text }))
      setError(j?.error === 'slow-down' ? 'That’s a lot of messages at once. Give it a minute.' : 'Your message didn’t go through. Try again.')
    }
    input.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="pc-launch"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={totalUnread ? `Chat, ${totalUnread} new` : 'Chat'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        <span>Chat</span>
        {totalUnread > 0 && !open && <span className="pc-badge" aria-hidden="true">{totalUnread}</span>}
      </button>

      <section id={`${id}-panel`} className="pc-panel" hidden={!open} aria-label="Chat with Breaking Ice" role="dialog" aria-modal="false">
        <header className="pc-head">
          <div className="pc-tabs" role="tablist" aria-label="Who to talk to">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${id}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${id}-list`}
                className="pc-tab"
                onClick={() => {
                  setTab(t.id)
                  atBottom.current = true
                  setError('')
                  setTimeout(() => input.current?.focus(), 0)
                }}
              >
                {t.label}
                {unread(t.id) > 0 && tab !== t.id && <span className="pc-tab-badge"><span className="sr-only">, </span>{unread(t.id)}<span className="sr-only"> new</span></span>}
              </button>
            ))}
          </div>
          <button type="button" className="pc-close" onClick={close} aria-label="Close chat">×</button>
        </header>

        <div
          id={`${id}-list`}
          ref={list}
          className="pc-list"
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab}`}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {inTab.length === 0 && (
            <p className="pc-empty">
              {tab === 'josh'
                ? `Write to ${producer} here. He gets it straight away and answers here, usually the same day.`
                : 'Ask about your projects, versions, dates or payments. The assistant is an AI: for anything it can’t answer, switch to the Josh tab.'}
            </p>
          )}
          {inTab.map((m) => (
            <div key={m._key} className={`pc-msg pc-${m.from === 'client' ? 'me' : m.from}`}>
              {m.handoff && <span className="pc-handoff">{producer} hasn’t replied yet, so the assistant answered:</span>}
              {m.from !== 'client' && <span className="pc-who">{m.from === 'assistant' ? 'Breaking Ice assistant (AI)' : m.who}</span>}
              <p className="pc-bubble">{m.text}</p>
              <span className="pc-time">{m._key.startsWith('tmp-') ? 'Sending…' : timeOf(m.at)}</span>
            </div>
          ))}
          {sending === 'assistant' && tab === 'assistant' && <p className="pc-typing">The assistant is writing…</p>}
        </div>
        <p className="sr-only" aria-live="polite">{announce}</p>

        <form
          className="pc-compose"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          {preview && <p className="pc-note">Preview: messages aren’t sent.</p>}
          {error && <p className="pc-note pc-err" role="alert">{error}</p>}
          <label htmlFor={`${id}-text`} className="sr-only">{tab === 'josh' ? `Message to ${producer}` : 'Message to the assistant'}</label>
          <div className="pc-compose-row">
            <textarea
              id={`${id}-text`}
              ref={input}
              className="input pc-input"
              rows={2}
              maxLength={MAX}
              value={drafts[tab]}
              disabled={preview}
              placeholder={tab === 'josh' ? `Message ${producer}…` : 'Ask the assistant…'}
              onChange={(e) => setDrafts((d) => ({ ...d, [tab]: e.target.value }))}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a new line.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={preview || !drafts[tab].trim() || Boolean(sending)}>Send</button>
          </div>
        </form>
      </section>
    </>
  )
}
