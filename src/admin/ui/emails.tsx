'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { fillTemplate } from '../email-templates-shared'
import { baseSubject, fmtBytes, initialsOf, MAIL_LIMITS, replySubject, type Conversation, type ConversationRow, type MailMessage, type MailPerson, type MailState } from '../mail-shared'

/**
 * /admin/emails: client conversations from Josh's Gmail. The list (left) has one row per client company; the
 * open conversation (right) has every message with that client's people, oldest at the top, and a composer
 * that replies through Gmail. On a phone one pane shows at a time. Nothing sends until Send is pressed.
 */

type Template = { key: string; name: string; subject: string; body: string }
type Props = { state: MailState; initialClient?: string; templates: Template[]; signOff: string; bigUploads: boolean; canConnect: boolean }
type Reply<T> = { ok: boolean; status: number; data: T & { ok?: boolean; state?: MailState; message?: string } }

async function call<T>(url: string, init?: RequestInit): Promise<Reply<T>> {
  try {
    const r = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined })
    return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Reply<T>['data'] }
  } catch {
    return { ok: false, status: 0, data: { message: 'No connection. Try again.' } as Reply<T>['data'] }
  }
}
const post = <T,>(body: unknown) => call<T>('/api/admin/emails', { method: 'POST', body: JSON.stringify(body) })

const DAY = 86_400_000
function chipDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  if (now.getTime() - d.getTime() < 6 * DAY) return d.toLocaleDateString('en-CA', { weekday: 'short' })
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) })
}
const fullDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) })} · ${d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`
}

/* ── Drafts kept in this browser ── */
type Draft = { to: string[]; subject: string; body: string }
const draftKey = (clientId: string) => `bi-mail-draft:${clientId}`
function readDraft(clientId: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(clientId)) ?? 'null') as Draft | null
    return d && Array.isArray(d.to) && typeof d.body === 'string' && d.body.trim() ? d : null
  } catch {
    return null
  }
}
function writeDraft(clientId: string, d: Draft | null) {
  try {
    if (d && d.body.trim()) localStorage.setItem(draftKey(clientId), JSON.stringify(d))
    else localStorage.removeItem(draftKey(clientId))
  } catch {
    /* private window: no draft, still works */
  }
}

/** Who a reply goes to: whoever wrote last, or (if that was Josh) whoever he wrote to. */
function defaults(c: Conversation) {
  const last = c.messages.at(-1)
  const people = new Set(c.people.map((p) => p.email))
  let to: string[] = []
  if (last && !last.mine) to = [last.from.email]
  else if (last) to = [...last.to, ...last.cc].map((a) => a.email).filter((e) => people.has(e))
  if (!to.length && c.people[0]) to = [c.people[0].email]
  return { to: [...new Set(to)].slice(0, MAIL_LIMITS.to), subject: last ? replySubject(last.subject) : '' }
}

function readBase64(f: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

const STATE_TEXT: Partial<Record<MailState, { title: string; body: string; button?: string }>> = {
  'not-set-up': { title: 'Google isn’t set up yet', body: 'Add the Google sign-in settings (see Settings → Google), then connect it to see client email here.' },
  'not-connected': { title: 'Connect Google to see client email', body: 'Sign in with josh@breakingiceproductions.com once. Mail stays in Gmail; this page reads it and sends replies from there.', button: 'Connect Google' },
  'needs-scope': { title: 'Reconnect Google to include email', body: 'Google is connected for the calendar only. Connect it again and allow Gmail so client email shows here.', button: 'Reconnect Google' },
  'signed-out': { title: 'Google signed this site out', body: 'Connect Google again to see client email.', button: 'Reconnect Google' },
}

export function EmailsApp({ state: initialState, initialClient, templates, signOff, bigUploads, canConnect }: Props) {
  const [state, setState] = useState<MailState>(initialState)
  const [rows, setRows] = useState<ConversationRow[] | null>(null)
  const [rowsError, setRowsError] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(initialClient ?? null)
  const [conv, setConv] = useState<Conversation | null>(null)
  const [convError, setConvError] = useState('')
  const [loading, setLoading] = useState(false)
  const sample = state === 'sample'
  const live = state === 'ready' || sample
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

  const loadRows = useCallback(async (fresh = false) => {
    setRowsError('')
    const r = await call<{ rows?: ConversationRow[] }>(`/api/admin/emails${fresh ? '?fresh=1' : ''}`)
    if (r.data.state && r.data.state !== 'ready' && r.data.state !== 'sample') return setState(r.data.state)
    if (!r.ok || !r.data.rows) return setRowsError(r.data.message || 'The emails didn’t load.')
    setRows(r.data.rows)
  }, [])

  useEffect(() => {
    if (live) void loadRows()
  }, [live, loadRows])

  // The open conversation follows the address bar (so Back on a phone returns to the list).
  useEffect(() => {
    const on = () => {
      const id = new URL(location.href).searchParams.get('client')
      if (!id) pushed.current = false
      setOpenId(id)
    }
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  // Opening from the list adds a history step, so the phone's Back (or the back button here) returns to the list.
  const pushed = useRef(false)
  const open = (id: string | null) => {
    const u = new URL(location.href)
    if (id) u.searchParams.set('client', id)
    else u.searchParams.delete('client')
    if (id && !openId) {
      history.pushState(null, '', u)
      pushed.current = true
    } else history.replaceState(null, '', u)
    setOpenId(id)
  }
  const back = () => {
    const was = openId
    if (pushed.current) {
      pushed.current = false
      history.back()
      setOpenId(null)
    } else open(null)
    requestAnimationFrame(() => (was ? rowRefs.current.get(was)?.focus() : undefined))
  }

  const loadConv = useCallback(
    async (id: string, fresh = false) => {
      setLoading(true)
      setConvError('')
      const r = await call<{ conversation?: Conversation }>(`/api/admin/emails?client=${encodeURIComponent(id)}${fresh ? '&fresh=1' : ''}`)
      setLoading(false)
      if (r.data.state && r.data.state !== 'ready' && r.data.state !== 'sample') return setState(r.data.state)
      if (!r.ok || !r.data.conversation) return setConvError(r.data.message || 'This conversation didn’t load.')
      const c = r.data.conversation
      // Sample sends live only in this tab: keep them when the conversation reloads.
      setConv((prev) => (sample && prev?.clientId === id ? { ...c, messages: [...c.messages, ...prev.messages.filter((m) => !c.messages.some((x) => x.id === m.id))] } : c))
      const unread = c.messages.filter((m) => m.unread).length
      if (unread) {
        setRows((rs) => rs?.map((x) => (x.clientId === id ? { ...x, unread: 0 } : x)) ?? rs)
        window.dispatchEvent(new CustomEvent('a-emails-read', { detail: -unread }))
        void post({ action: 'read', clientId: id })
      }
    },
    [sample],
  )

  useEffect(() => {
    if (!live || !openId) {
      setConv(null)
      return
    }
    if (conv?.clientId !== openId) {
      setConv(null)
      void loadConv(openId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, live, loadConv])

  const onSent = (m: MailMessage) => {
    setConv((c) => (c ? { ...c, messages: [...c.messages, m] } : c))
    setRows((rs) => {
      if (!rs || !conv) return rs
      const row = rs.find((x) => x.clientId === conv.clientId)
      const next: ConversationRow = { ...(row ?? { clientId: conv.clientId, clientName: conv.clientName, people: conv.people, unread: 0 }), last: { at: m.at, snippet: m.body.main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 160), fromName: 'You', mine: true } }
      return [next, ...rs.filter((x) => x.clientId !== conv.clientId)]
    })
  }

  const q = query.trim().toLowerCase()
  const match = (r: ConversationRow) => !q || r.clientName.toLowerCase().includes(q) || r.people.some((p) => p.name.toLowerCase().includes(q) || p.email.includes(q))
  const withMail = (rows ?? []).filter((r) => r.last && match(r))
  const noMail = q ? (rows ?? []).filter((r) => !r.last && match(r)) : []

  if (!live) {
    const t = STATE_TEXT[state] ?? STATE_TEXT['not-connected']!
    return (
      <div className="a-page ml">
        <header className="a-head"><h1 className="a-h1 sa-h1">Emails</h1></header>
        <section className="sa-card ml-connect" aria-labelledby="ml-connect-h">
          <h2 id="ml-connect-h" className="a-h2 a-h2-lg">{t.title}</h2>
          <p className="m0">{t.body}</p>
          {t.button && canConnect ? <a className="btn sa-copper" href="/api/admin/google/connect">{t.button}</a> : <Link className="btn btn-secondary" href="/admin/settings">Open Settings</Link>}
        </section>
      </div>
    )
  }

  return (
    <div className="a-page ml">
      <header className="a-head ml-head">
        <h1 className="a-h1 sa-h1">Emails</h1>
        <button type="button" className="btn btn-secondary" onClick={() => { void loadRows(true); if (openId) void loadConv(openId, true) }}>Refresh</button>
      </header>
      <div className={`ml-panes${openId ? ' is-open' : ''}`}>
        <section className="ml-list-pane" aria-label="Client conversations">
          <label className="ml-search">
            <span className="sr-only">Search clients and people</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients or people" />
          </label>
          {rowsError ? (
            <p className="ml-error" role="alert">{rowsError} <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadRows(true)}>Try again</button></p>
          ) : !rows ? (
            <ul className="ml-list" aria-busy="true">{[0, 1, 2, 3].map((i) => <li key={i} className="ml-skel" />)}</ul>
          ) : (
            <>
              {withMail.length ? (
                <ul className="ml-list">
                  {withMail.map((r) => (
                    <li key={r.clientId}>
                      <button
                        type="button"
                        ref={(el) => { if (el) rowRefs.current.set(r.clientId, el); else rowRefs.current.delete(r.clientId) }}
                        className={`ml-row${openId === r.clientId ? ' is-on' : ''}${r.unread ? ' is-unread' : ''}`}
                        aria-current={openId === r.clientId ? 'true' : undefined}
                        onClick={() => open(r.clientId)}
                      >
                        <span className="ml-av" aria-hidden="true">{initialsOf(r.clientName)}</span>
                        <span className="ml-row-main">
                          <span className="ml-row-top">
                            <strong className="ml-row-name">{r.clientName}</strong>
                            <span className="ml-row-date">{chipDate(r.last!.at)}</span>
                          </span>
                          <span className="ml-row-snip">{r.last!.mine ? 'You: ' : `${r.last!.fromName.replace(/^\[|\]$/g, '')}: `}{r.last!.snippet}</span>
                          <span className="ml-row-meta">
                            {r.unread > 0 && <span className="ml-dot"><span className="sr-only">{r.unread} unread</span></span>}
                            <span className={`ml-wait${r.last!.mine ? '' : ' is-you'}`}>{r.last!.mine ? 'Waiting on them' : 'Waiting on you'}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : noMail.length ? null : (
                <p className="sa-empty ml-none">{q ? 'No clients or people match' : 'No client email yet'}</p>
              )}
              {noMail.length > 0 && (
                <>
                  <h2 className="ml-sub">No emails yet</h2>
                  <ul className="ml-list">
                    {noMail.map((r) => (
                      <li key={r.clientId}>
                        <button type="button" ref={(el) => { if (el) rowRefs.current.set(r.clientId, el) }} className={`ml-row${openId === r.clientId ? ' is-on' : ''}`} onClick={() => open(r.clientId)}>
                          <span className="ml-av" aria-hidden="true">{initialsOf(r.clientName)}</span>
                          <span className="ml-row-main"><strong className="ml-row-name">{r.clientName}</strong><span className="ml-row-snip">{r.people.map((p) => p.name).join(', ')}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
        <section className="ml-conv-pane" aria-label="Conversation">
          {!openId ? (
            <p className="ml-pick">Pick a client to read and reply</p>
          ) : convError ? (
            <div className="ml-conv-pad">
              <button type="button" className="btn btn-secondary ml-back" onClick={back}>← All conversations</button>
              <p className="ml-error" role="alert">{convError} <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadConv(openId, true)}>Try again</button></p>
            </div>
          ) : !conv || (loading && conv.clientId !== openId) ? (
            <div className="ml-conv-pad" aria-busy="true">
              <button type="button" className="btn btn-secondary ml-back" onClick={back}>← All conversations</button>
              <div className="ml-skel ml-skel-lg" />
            </div>
          ) : (
            <Thread key={conv.clientId} conv={conv} sample={sample} onBack={back} onSent={onSent} templates={templates} signOff={signOff} bigUploads={bigUploads} />
          )}
        </section>
      </div>
    </div>
  )
}

/* ── One conversation ── */

function Thread({ conv, sample, onBack, onSent, templates, signOff, bigUploads }: { conv: Conversation; sample: boolean; onBack: () => void; onSent: (m: MailMessage) => void; templates: Template[]; signOff: string; bigUploads: boolean }) {
  const scroller = useRef<HTMLOListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const count = conv.messages.length
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    // On a phone the list isn't its own scroller: bring the newest message into view instead
    // (a moment later, after the router has settled the page's own scroll for the new address).
    if (el.scrollHeight <= el.clientHeight + 2 && window.matchMedia('(max-width: 899px)').matches) {
      const t = setTimeout(() => {
        const last = el.lastElementChild
        // Below the phone's top bar.
        if (last) window.scrollTo({ top: Math.max(0, last.getBoundingClientRect().top + window.scrollY - 76), behavior: 'instant' })
      }, 80)
      return () => clearTimeout(t)
    }
  }, [count])
  useEffect(() => {
    if (window.matchMedia('(max-width: 899px)').matches) heading.current?.focus({ preventScroll: true })
  }, [])
  const subjects = conv.messages.map((m) => baseSubject(m.subject))
  return (
    <div className="ml-thread">
      <header className="ml-thread-head">
        <button type="button" className="btn btn-secondary ml-back" onClick={onBack}>← All conversations</button>
        <div className="ml-thread-title">
          <span className="ml-av ml-av-lg" aria-hidden="true">{initialsOf(conv.clientName)}</span>
          <div className="ml-thread-names">
            <h2 ref={heading} tabIndex={-1} className="ml-h2"><Link href={`/admin/clients/${encodeURIComponent(conv.clientId)}`}>{conv.clientName}</Link></h2>
            <p className="ml-people">{conv.people.map((p) => p.name).join(', ') || 'No contacts with an email'}</p>
          </div>
        </div>
        {conv.projects.length > 0 && (
          <ul className="ml-projects" aria-label="Open projects">
            {conv.projects.map((p) => <li key={p.id}><Link className="sa-chip ml-chip-link" href={p.href}>{p.title}</Link></li>)}
          </ul>
        )}
      </header>
      {count ? (
        <ol ref={scroller} className="ml-msgs" aria-label={`${count} messages, oldest first`} tabIndex={0}>
          {conv.more && <li className="ml-more">Older messages are in Gmail</li>}
          {conv.messages.map((m, i) => (
            <Message key={m.id} m={m} showSubject={i === 0 || subjects[i] !== subjects[i - 1]} />
          ))}
        </ol>
      ) : (
        <p className="ml-pick ml-msgs">No emails with {conv.clientName} yet. Write the first one below.</p>
      )}
      {conv.people.length ? (
        <Composer conv={conv} sample={sample} onSent={onSent} templates={templates} signOff={signOff} bigUploads={bigUploads} />
      ) : (
        <p className="sa-empty">Add a contact with an email on the client to write to them.</p>
      )}
    </div>
  )
}

function Message({ m, showSubject }: { m: MailMessage; showSubject: boolean }) {
  const names = (list: { name: string; email: string }[]) => list.map((a) => a.name || a.email).join(', ')
  return (
    <li className={`ml-msg${m.mine ? ' is-mine' : ''}`}>
      <span className="ml-av" aria-hidden="true">{initialsOf(m.mine ? 'Josh Ferguson' : m.from.name || m.from.email)}</span>
      <article className="ml-card" aria-label={`${m.mine ? 'You' : m.from.name}, ${fullDate(m.at)}`}>
        <header className="ml-card-head">
          <strong>{m.mine ? 'You' : m.from.name || m.from.email}</strong>
          <time dateTime={m.at}>{fullDate(m.at)}</time>
          {m.unread && <span className="ml-new">New</span>}
        </header>
        <p className="ml-to">to {names(m.to) || 'you'}{m.cc.length ? ` · cc ${names(m.cc)}` : ''}</p>
        {showSubject && <p className="ml-subj">{m.subject}</p>}
        {m.body.kind === 'html' ? <div className="ml-body ml-html" dangerouslySetInnerHTML={{ __html: m.body.main }} /> : <div className="ml-body ml-text">{m.body.main}</div>}
        {m.body.quoted && (
          <details className="ml-quoted">
            <summary><span aria-hidden="true">…</span><span className="sr-only">Show the earlier messages quoted in this email</span></summary>
            {m.body.kind === 'html' ? <div className="ml-html" dangerouslySetInnerHTML={{ __html: m.body.quoted }} /> : <div className="ml-text">{m.body.quoted}</div>}
          </details>
        )}
        {m.files.length > 0 && (
          <ul className="ml-files" aria-label="Attachments">
            {m.files.map((f) => (
              <li key={f.id}>
                <a className="ml-file" href={`/api/admin/emails/attachment?${new URLSearchParams({ m: m.id, a: f.id, n: f.name, t: f.type })}`} download={f.name}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>
                  <span className="ml-file-name">{f.name}</span>
                  <span className="ml-file-size">{fmtBytes(f.size)}</span>
                  <span className="sr-only"> (download)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
    </li>
  )
}

/* ── Composer ── */

function Composer({ conv, sample, onSent, templates, signOff, bigUploads }: { conv: Conversation; sample: boolean; onSent: (m: MailMessage) => void; templates: Template[]; signOff: string; bigUploads: boolean }) {
  const id = useId()
  const start = useMemo(() => defaults(conv), [conv.clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  const saved = useMemo(() => readDraft(conv.clientId), [conv.clientId])
  const [to, setTo] = useState<string[]>(saved?.to.length ? saved.to : start.to)
  const [subject, setSubject] = useState(saved?.subject || start.subject)
  const [body, setBody] = useState(saved?.body ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState<'' | 'Uploading…' | 'Sending…'>('')
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(saved ? { text: 'Draft restored' } : null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => writeDraft(conv.clientId, { to, subject, body }), [conv.clientId, to, subject, body])

  const latest = conv.messages.at(-1)
  const threaded = Boolean(latest && baseSubject(subject) === baseSubject(latest.subject))
  const total = files.reduce((n, f) => n + f.size, 0)
  const tooBig = total > MAIL_LIMITS.files
  const people = conv.people
  const nameOf = (e: string) => people.find((p) => p.email === e)?.name ?? e
  const addable = people.filter((p) => !to.includes(p.email))

  const addOther = () => {
    const e = other.trim().toLowerCase()
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e)) return setStatus({ text: 'That address doesn’t look right.', error: true })
    if (!to.includes(e)) setTo([...to, e].slice(0, MAIL_LIMITS.to))
    setOther('')
    setStatus(null)
  }
  const applyTemplate = (key: string) => {
    const t = templates.find((x) => x.key === key)
    if (!t) return
    const first = people.find((p) => p.email === to[0])
    const name = first?.name.replace(/^\[|\]$/g, '') ?? ''
    const vars = { firstName: name.split(/\s+/)[0] || 'there', name, company: conv.clientName, signOff }
    const text = fillTemplate(t.body, vars)
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${text}` : text))
    if (!latest && !subject.trim()) setSubject(fillTemplate(t.subject, vars))
  }
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...files, ...Array.from(list)].slice(0, MAIL_LIMITS.fileCount)
    setFiles(next)
    if (fileInput.current) fileInput.current.value = ''
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!to.length) return setStatus({ text: 'Add someone to send it to.', error: true })
    if (!subject.trim()) return setStatus({ text: 'Add a subject.', error: true })
    if (!body.trim()) return setStatus({ text: 'Write a message first.', error: true })
    if (tooBig) return setStatus({ text: 'Attachments are over 20 MB in all. Share big files with a link instead.', error: true })
    setStatus(null)
    let out: { name: string; type: string; size: number; data?: string; key?: string }[] = []
    try {
      if (total <= MAIL_LIMITS.inline) {
        out = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, size: f.size, data: await readBase64(f) })))
      } else {
        if (!bigUploads) return setStatus({ text: 'Files over 3 MB in all need the R2 bucket set up. Send smaller files or a link.', error: true })
        setBusy('Uploading…')
        for (const f of files) {
          const r = await post<{ key?: string; url?: string; sample?: boolean }>({ action: 'upload', name: f.name })
          if (!r.ok || !r.data.key) throw new Error(r.data.message || `“${f.name}” didn’t upload.`)
          if (!r.data.sample) {
            const put = await fetch(r.data.url!, { method: 'PUT', body: f }).catch(() => null)
            if (!put?.ok) throw new Error(`“${f.name}” didn’t upload. Check your connection and try again.`)
          }
          out.push({ name: f.name, type: f.type, size: f.size, key: r.data.key })
        }
      }
    } catch (err) {
      setBusy('')
      return setStatus({ text: err instanceof Error ? err.message : 'The attachments didn’t upload.', error: true })
    }
    setBusy('Sending…')
    const r = await post<{ message?: MailMessage; sample?: boolean }>({
      action: 'send',
      clientId: conv.clientId,
      to,
      subject: subject.trim(),
      body,
      ...(threaded && latest && { threadId: latest.threadId, ...(latest.messageId && { inReplyTo: latest.messageId }), ...(latest.references || latest.messageId ? { references: [latest.references, latest.messageId].filter(Boolean).join(' ').slice(-3900) } : {}) }),
      files: out,
    })
    setBusy('')
    if (!r.ok || !r.data.message) return setStatus({ text: r.data.message || (r.status === 401 ? 'You’ve been signed out. Sign in again to send.' : 'That didn’t send. What you wrote is still here.'), error: true })
    onSent(r.data.message)
    setBody('')
    setFiles([])
    setSubject(replySubject(r.data.message.subject))
    writeDraft(conv.clientId, null)
    setStatus({ text: r.data.sample ? 'Sample data: not saved, nothing was sent.' : 'Sent from your Gmail.' })
  }

  return (
    <form className="ml-compose" onSubmit={send} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="sr-only">Write to {conv.clientName}</h3>
      <div className="ml-field ml-to-field" role="group" aria-labelledby={`${id}-to`}>
        <span className="ml-label" id={`${id}-to`}>To</span>
        <ul className="ml-recips">
          {to.map((e) => (
            <li key={e} className="ml-recip">
              <span title={e}>{nameOf(e)}</span>
              <button type="button" aria-label={`Remove ${nameOf(e)}`} onClick={() => setTo(to.filter((x) => x !== e))}>×</button>
            </li>
          ))}
          {addable.length > 0 && to.length < MAIL_LIMITS.to && (
            <li>
              <select className="ml-add" value="" aria-label={`Add someone from ${conv.clientName}`} onChange={(ev) => ev.target.value && setTo([...to, ev.target.value])}>
                <option value="">+ Add</option>
                {addable.map((p) => <option key={p.email} value={p.email}>{p.name}{p.role ? ` (${p.role})` : ''}</option>)}
              </select>
            </li>
          )}
          <li className="ml-other">
            <input type="email" value={other} onChange={(ev) => setOther(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addOther() } }} placeholder="Other address" aria-label="Add another address" />
            {other.trim() && <button type="button" className="btn btn-secondary btn-sm" onClick={addOther}>Add</button>}
          </li>
        </ul>
      </div>
      <label className="ml-field">
        <span className="ml-label">Subject</span>
        <input type="text" value={subject} maxLength={MAIL_LIMITS.subject} onChange={(ev) => setSubject(ev.target.value)} />
      </label>
      {latest && <p className="ml-hint">{threaded ? 'Replies in the latest thread' : 'A new subject starts a new thread'}</p>}
      <label className="sr-only" htmlFor={`${id}-body`}>Message</label>
      <textarea id={`${id}-body`} className="ml-text-in" rows={3} value={body} maxLength={MAIL_LIMITS.body} onChange={(ev) => setBody(ev.target.value)} placeholder={`Write to ${nameOf(to[0] ?? '').replace(/^\[|\]$/g, '') || conv.clientName}…`} />
      {files.length > 0 && (
        <ul className="ml-files ml-out-files" aria-label="Attached">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="ml-file">
              <span className="ml-file-name">{f.name}</span>
              <span className="ml-file-size">{fmtBytes(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, n) => n !== i))}>×</button>
            </li>
          ))}
          <li className={`ml-total${tooBig ? ' is-bad' : ''}`}>{fmtBytes(total)} of 20 MB</li>
        </ul>
      )}
      <div className="ml-actions">
        <label className="btn btn-secondary ml-attach">
          <input ref={fileInput} type="file" multiple className="sr-only" onChange={(ev) => addFiles(ev.target.files)} disabled={Boolean(busy)} />
          Attach
        </label>
        {templates.length > 0 && (
          <select className="ml-tpl" value="" aria-label="Insert a template" onChange={(ev) => applyTemplate(ev.target.value)}>
            <option value="">Template…</option>
            {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        )}
        <p className={`ml-status${status?.error ? ' is-error' : ''}`} role={status?.error ? 'alert' : 'status'}>{busy || status?.text}</p>
        <button type="submit" className="btn sa-copper ml-send" disabled={Boolean(busy)} aria-busy={Boolean(busy) || undefined}>{busy ? busy : 'Send'}</button>
      </div>
    </form>
  )
}
