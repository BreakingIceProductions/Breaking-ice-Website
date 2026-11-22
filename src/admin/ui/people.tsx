'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { applyAction, cleanTag, FIELD_MAX, mergePeople, normEmail, PeopleError, sameTag, STARTER_TAGS, type BasePerson, type PeopleAction, type PeopleStore, type Person, type PersonField } from '../people-shared'

const FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'client', label: 'Clients' },
  { key: 'lead', label: 'Open leads' },
  { key: 'past', label: 'Past' },
  { key: 'contact', label: 'Contacts only' },
] as const
type Show = (typeof FILTERS)[number]['key']
const SORTS = [
  { key: 'name', label: 'A to Z' },
  { key: 'company', label: 'Company' },
  { key: 'recent', label: 'Newest' },
] as const

type Note = { text: string; bad?: boolean; /** Shows an Undo button beside the message (in the panel, where the page's own notices can't be reached). */ undo?: () => void }
type Send = (action: PeopleAction) => Promise<{ key?: string } | null>

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
const people_ = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/**
 * Everyone in one table: client contacts, the people on leads, and contacts-only people, one row per email.
 * Search, counted tabs, a tag filter kept in the address bar, and a side panel to tag and edit.
 */
export function PeopleTable({ base, store: saved, canEdit, initial }: { base: BasePerson[]; store: PeopleStore; canEdit: boolean; initial: { show?: string; tags: string[]; person?: string } }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>(FILTERS.some((f) => f.key === initial.show) ? (initial.show as Show) : 'all')
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('name')
  const [picked, setPicked] = useState<string[]>(initial.tags)
  const [openId, setOpenId] = useState<string | null>(initial.person ?? null)
  const [managing, setManaging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)

  // What's on screen: the saved list, with each change shown as soon as the server accepts it.
  const [store, setStore] = useState(saved)
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setStore(saved)
  }
  // The search box can send you here for one person while the page is already open.
  const [asked, setAsked] = useState(initial.person)
  if (asked !== initial.person) {
    setAsked(initial.person)
    if (initial.person) setOpenId(initial.person)
  }

  const people = useMemo(() => mergePeople(base, store), [base, store])
  const tagsOn = picked.flatMap((t) => store.tags.filter((x) => sameTag(x, t)))
  const tagKey = tagsOn.join('\n')

  // The tab and the tags live in the address, so a filtered view can be bookmarked.
  useEffect(() => {
    const u = new URL(window.location.href)
    u.searchParams.delete('person')
    u.searchParams.delete('tag')
    for (const t of tagKey ? tagKey.split('\n') : []) u.searchParams.append('tag', t)
    if (show === 'all') u.searchParams.delete('show')
    else u.searchParams.set('show', show)
    if (u.href !== window.location.href) window.history.replaceState(null, '', u)
  }, [show, tagKey])

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const wanted = tagKey ? tagKey.split('\n') : []
    const list = people.filter(
      (p) =>
        (show === 'all' || p.kind === show) &&
        wanted.every((t) => p.tags.includes(t)) &&
        words.every((w) => `${p.name} ${p.role ?? ''} ${p.email ?? ''} ${p.phone ?? ''} ${p.company ?? ''} ${p.also.join(' ')} ${p.tags.join(' ')}`.toLowerCase().includes(w)),
    )
    const by = { name: (p: Person) => p.name.toLowerCase(), company: (p: Person) => `${p.company ? p.company.toLowerCase() : '￿'} ${p.name.toLowerCase()}` }
    return sort === 'recent' ? [...list].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '')) : [...list].sort((a, b) => by[sort](a).localeCompare(by[sort](b)))
  }, [people, q, show, sort, tagKey])

  const tagCount = (t: string) => people.filter((p) => p.tags.includes(t)).length
  const person = openId && openId !== 'new' ? people.find((p) => p.id === openId) : undefined
  const panelOpen = openId === 'new' || Boolean(person)

  const send: Send = async (action) => {
    const make = { key: () => `new${Date.now().toString(36)}`, emailKey: (e: string) => `t-${e}`, now: () => new Date().toISOString() }
    let local: { key?: string }
    try {
      local = applyAction(store, action, make)
    } catch (e) {
      setNote({ text: e instanceof PeopleError ? e.message : 'That didn’t work.', bad: true })
      return null
    }
    setBusy(true)
    const r = await fetch('/api/admin/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) {
      setNote({ text: j.error === 'signed-out' ? 'You’ve been signed out. Reload the page.' : j.message || 'That didn’t save. Reload the page and try again.', bad: true })
      return null
    }
    const key: string | undefined = j.key ?? local.key
    setStore((s) => {
      try {
        return applyAction(s, action, { ...make, key: () => key ?? make.key() }).store
      } catch {
        return s
      }
    })
    if (action.action === 'renameTag' && action.from && action.to) setPicked((ts) => ts.map((t) => (sameTag(t, action.from!) ? cleanTag(action.to) : t)))
    setNote({ text: j.sample ? 'Sample data: nothing was saved.' : 'Saved.' })
    if (!j.sample) router.refresh()
    return { key }
  }

  const open = (id: string, text?: string) => {
    setNote(text ? { text } : null)
    setOpenId(id)
  }
  const toggleTag = (t: string) => setPicked(tagsOn.includes(t) ? tagsOn.filter((x) => x !== t) : [...tagsOn, t])

  return (
    <div className="stack gap-4">
      <div className="row-wrap">
        <input className="input pp-search" type="search" placeholder="Search name, email, company or tag" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="a-switch" role="group" aria-label="Show">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? people.length : people.filter((p) => p.kind === f.key).length
            return <button key={f.key} type="button" aria-pressed={show === f.key} onClick={() => setShow(f.key)}>{f.label} <span className="pp-n">{n}</span></button>
          })}
        </div>
        {canEdit && <button type="button" className="btn btn-primary btn-sm pp-add" onClick={() => open('new')}>Add person</button>}
      </div>

      <div className="pp-tagfilter" role="group" aria-labelledby="pp-tagfilter-h">
        <span id="pp-tagfilter-h" className="pp-tagfilter-h">Filter by tag</span>
        {store.tags.map((t) => (
          <button key={t} type="button" className="pp-pick" aria-pressed={tagsOn.includes(t)} onClick={() => toggleTag(t)}>
            {t} <span className="pp-n">{tagCount(t)}</span>
          </button>
        ))}
        {!store.tags.length && <span className="muted small">No tags yet. {canEdit ? 'Open a person to add the first one.' : ''}</span>}
        {tagsOn.length > 0 && <button type="button" className="linklike small" onClick={() => setPicked([])}>Clear<span className="sr-only"> the tag filter</span></button>}
        {canEdit && store.tags.length > 0 && <button type="button" className="linklike small pp-manage" onClick={() => { setNote(null); setManaging(true) }}>Manage tags</button>}
      </div>

      <div className="row-wrap pp-bar">
        <span className="muted small" role="status">
          {people_(rows.length)}
          {tagsOn.length > 0 && ` tagged ${tagsOn.join(' and ')}`}
          {!panelOpen && !managing && note && <span className={note.bad ? 'pp-bad' : undefined}> · {note.text}</span>}
        </span>
        <div className="row-wrap small gap-2">
          <span className="muted">Sort</span>
          {SORTS.map((s) => <button key={s.key} type="button" className={`pp-sort${sort === s.key ? ' on' : ''}`} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>)}
        </div>
      </div>

      <div className="p-card pp-card">
        <div className="a-table-scroll" tabIndex={0} role="region" aria-label="People">
          <table className="a-table pp-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Company</th>
                <th scope="col">Reach them</th>
                <th scope="col">Status</th>
                <th scope="col">Tags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="pp-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) open(p.id) }}>
                  <td>
                    <button type="button" className="pp-name" aria-haspopup="dialog" onClick={() => open(p.id)}>{p.name}</button>
                    {p.role && <span className="pp-sub">{p.role}</span>}
                  </td>
                  <td>
                    {p.clientId ? <Link className="a-strong-link" href={`/admin/clients/${p.clientId}`}>{p.company}</Link> : p.company || <span className="muted" aria-label="No company">—</span>}
                    {p.also.length > 0 && <span className="pp-sub">Also {p.also.join(', ')}</span>}
                  </td>
                  <td>
                    {p.email && <a className="text-link pp-reach" href={`mailto:${p.email}`}>{p.email}</a>}
                    {p.phone && <a className="text-link-plain pp-reach" href={telHref(p.phone)}>{p.phone}</a>}
                    {!p.email && !p.phone && <span className="muted">No email or phone</span>}
                  </td>
                  <td><span className={`pp-status k-${p.kind}`}>{p.status}</span></td>
                  <td>
                    {p.tags.length ? (
                      <ul className="pp-tags" aria-label={`Tags on ${p.name}`}>
                        {p.tags.map((t) => <li key={t} className="pp-tag">{t}</li>)}
                      </ul>
                    ) : (
                      <span className="muted" aria-label="No tags">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">Nobody matches.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Panel open={panelOpen} className="pp-panel" labelledBy="pp-panel-h" onClose={() => setOpenId(null)}>
        {panelOpen && (
          <PanelBody
            key={openId}
            person={person}
            people={people}
            allTags={store.tags}
            canEdit={canEdit}
            busy={busy}
            note={note}
            setNote={setNote}
            send={send}
            onOpen={open}
            onDone={(text) => { setOpenId(null); setNote(text ? { text } : null) }}
          />
        )}
      </Panel>

      <Panel open={managing} className="a-dialog" labelledBy="pp-manage-h" onClose={() => setManaging(false)}>
        {managing && <ManageTags tags={store.tags} count={tagCount} busy={busy} note={note} send={send} onDone={() => setManaging(false)} />}
      </Panel>
    </div>
  )
}

/** A modal dialog: the browser traps focus, closes on Escape and hands focus back to what opened it. */
function Panel({ open, className, labelledBy, onClose, children }: { open: boolean; className: string; labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-first]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={className} aria-labelledby={labelledBy} onClose={(e) => { if (e.target === e.currentTarget && !e.currentTarget.open) onClose() }} onCancel={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); onClose() }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {children}
    </dialog>
  )
}

const FIELD_LABELS: Record<PersonField, string> = { name: 'Name', email: 'Email', company: 'Company', phone: 'Phone', role: 'Role', note: 'Note' }

function PanelBody({ person, people, allTags, canEdit, busy, note, setNote, send, onOpen, onDone }: {
  person?: Person
  people: Person[]
  allTags: string[]
  canEdit: boolean
  busy: boolean
  note: Note | null
  setNote: (n: Note | null) => void
  send: Send
  onOpen: (id: string, text?: string) => void
  onDone: (text?: string) => void
}) {
  const isNew = !person
  const only = isNew || person.source === 'only'
  // A client contact or a lead is found by email, so without one there's nowhere to keep tags or a note.
  const reachable = only || Boolean(person.email)
  const editable = canEdit && reachable
  const [f, setF] = useState<Record<PersonField, string>>({ name: person?.name ?? '', email: person?.email ?? '', company: person?.company ?? '', phone: person?.phone ?? '', role: person?.role ?? '', note: person?.note ?? '' })
  const [newTags, setNewTags] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  const id = useId()
  const fields: PersonField[] = only ? ['name', 'email', 'company', 'phone', 'role', 'note'] : ['phone', 'role', 'note']
  const target = person?.key ? { key: person.key } : { email: person?.email }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const email = normEmail(f.email)
    const taken = only && email ? people.find((p) => p.email === email && p.id !== person?.id) : undefined
    if (isNew) {
      if (taken) return onOpen(taken.id, `${taken.name} is already in the list with that email, so here they are.`)
      const r = await send({ action: 'savePerson', fields: Object.fromEntries(fields.filter((k) => f[k].trim()).map((k) => [k, f[k]])), tags: newTags })
      if (r) onDone(`Added ${f.name.trim()}.`)
      return
    }
    if (taken) return setNote({ text: `${taken.name} already has that email.`, bad: true })
    const changed = Object.fromEntries(fields.filter((k) => f[k].trim() !== (person[k] ?? '')).map((k) => [k, f[k]]))
    if (!Object.keys(changed).length) return setNote({ text: 'Nothing has changed.' })
    await send({ action: 'savePerson', ...target, fields: changed })
  }

  const tags = isNew ? newTags : person.tags
  const addTag = (t: string) => (isNew ? setNewTags((ts) => (ts.some((x) => sameTag(x, t)) ? ts : [...ts, allTags.find((x) => sameTag(x, t)) ?? t])) : void send({ action: 'tag', ...target, tag: t }))
  const removeTag = (t: string) => {
    if (isNew) return setNewTags((ts) => ts.filter((x) => x !== t))
    void send({ action: 'untag', ...target, tag: t }).then((r) => {
      if (r) setNote({ text: `Removed the tag “${t}”.`, undo: () => void send({ action: 'tag', ...target, tag: t }) })
    })
  }

  const input = (k: PersonField) => (
    <div className="field" key={k}>
      <label htmlFor={`${id}-${k}`}>{FIELD_LABELS[k]}{k === 'name' ? '' : <span className="muted pp-opt"> (optional)</span>}</label>
      {k === 'note' ? (
        <textarea id={`${id}-${k}`} className="input pp-note" rows={4} maxLength={FIELD_MAX.note} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      ) : (
        <input
          id={`${id}-${k}`}
          className="input"
          type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
          required={k === 'name'}
          maxLength={FIELD_MAX[k]}
          autoComplete="off"
          data-first={isNew && k === 'name' ? '' : undefined}
          value={f[k]}
          onChange={(e) => setF({ ...f, [k]: e.target.value })}
        />
      )}
    </div>
  )
  const fixed = (label: string, value: React.ReactNode) => (
    <div><dt>{label}</dt><dd>{value || <span className="muted">—</span>}</dd></div>
  )

  return (
    <div className="pp-panel-body">
      <div className="pp-panel-head">
        <div className="stack gap-4px min0">
          <span className="eyebrow">{isNew ? 'Contacts only' : person.status}</span>
          <h2 id="pp-panel-h" className="a-h2 a-h2-lg">{isNew ? 'Add person' : person.name}</h2>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" data-first={isNew ? undefined : ''} onClick={() => onDone()}>Close</button>
      </div>

      {isNew && <p className="pp-explain">Added here, they can’t sign in to the portal and get no emails.</p>}

      {!only && (
        <>
          <dl className="pp-fixed">
            {fixed('Name', person.name)}
            {fixed('Email', person.email && <a className="text-link" href={`mailto:${person.email}`}>{person.email}</a>)}
            {fixed('Company', person.clientId ? <Link className="text-link" href={`/admin/clients/${person.clientId}`}>{person.company}</Link> : person.company)}
          </dl>
          <p className="pp-explain">
            {person.source === 'client' ? 'Client contacts are managed with the client, so their name, email and company are changed there. ' : 'This person is on a lead, so their name and email are changed on the lead. '}
            {person.source === 'client' && person.studioHref && (
              <a className="text-link" href={person.studioHref} target="_blank" rel="noopener noreferrer">Edit contact<span aria-hidden="true"> ↗</span><span className="sr-only"> in the editor (opens in a new tab)</span></a>
            )}
            {person.source === 'lead' && person.leadHref && <Link className="text-link" href={person.leadHref}>Open the lead</Link>}
          </p>
          {!reachable && <p className="pp-explain">Tags, phone and notes are kept by email. Add their email first.</p>}
        </>
      )}

      {editable ? (
        <form className="stack pp-form" onSubmit={save}>
          {only && (['name', 'email', 'company'] as const).map(input)}
          <TagEditor tags={tags} all={allTags} busy={busy} onAdd={addTag} onRemove={removeTag} hint={isNew ? undefined : 'Tags save as you go.'} />
          {(['phone', 'role', 'note'] as const).map(input)}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add person' : 'Save details'}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="stack gap-2">
            <span className="pp-label">Tags</span>
            {tags.length ? <ul className="pp-tags" aria-label="Tags">{tags.map((t) => <li key={t} className="pp-tag">{t}</li>)}</ul> : <span className="muted small">No tags.</span>}
          </div>
          <dl className="pp-fixed">
            {only && fixed('Name', person?.name)}
            {only && fixed('Email', person?.email && <a className="text-link" href={`mailto:${person.email}`}>{person.email}</a>)}
            {only && fixed('Company', person?.company)}
            {fixed('Phone', person?.phone && <a className="text-link-plain" href={telHref(person.phone)}>{person.phone}</a>)}
            {fixed('Role', person?.role)}
            {fixed('Note', person?.note && <span className="pp-note-text">{person.note}</span>)}
          </dl>
        </>
      )}

      <p className={`small pp-msg${note?.bad ? ' pp-bad' : ' muted'}`} role="status">{note?.text}{note?.undo && <> <button type="button" className="linklike small" onClick={() => { const u = note.undo; setNote(null); u?.() }}>Undo</button></>}</p>

      {canEdit && person?.source === 'only' && person.key && (
        <div className="pp-remove">
          {removing ? (
            <div className="stack gap-3" role="group" aria-label="Confirm removing this person">
              <p className="m0">Remove {person.name} from the list? Their tags and note go too, and it can’t be undone.</p>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary btn-sm" autoFocus onClick={() => setRemoving(false)}>Keep them</button>
                <button type="button" className="btn btn-primary btn-sm pp-danger-btn" disabled={busy} onClick={async () => { if (await send({ action: 'removePerson', key: person.key })) onDone(`Removed ${person.name}.`) }}>Remove {person.name}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="linklike pp-danger" onClick={() => setRemoving(true)}>Remove this person</button>
          )}
        </div>
      )}
    </div>
  )
}

/** The tags on one person, with a box that finds an existing tag as you type or makes a new one. */
function TagEditor({ tags, all, busy, onAdd, onRemove, hint }: { tags: string[]; all: string[]; busy: boolean; onAdd: (t: string) => void; onRemove: (t: string) => void; hint?: string }) {
  const [q, setQ] = useState('')
  const id = useId()
  const typed = cleanTag(q)
  // With no tags made yet, the starter set is offered. A starter is only saved once it's used.
  const pool = all.length ? all : STARTER_TAGS
  const free = pool.filter((t) => !tags.some((x) => sameTag(x, t)))
  const hits = free.filter((t) => t.toLowerCase().includes(typed.toLowerCase())).slice(0, 12)
  const known = [...tags, ...pool].some((t) => sameTag(t, typed))
  const add = (t: string) => {
    onAdd(t)
    setQ('')
  }
  return (
    <fieldset className="pp-tagedit">
      <legend className="pp-label">Tags</legend>
      <ul className="pp-tags" aria-label="Tags on this person">
        {tags.map((t) => (
          <li key={t} className="pp-tag">
            {t}
            <button type="button" className="pp-tag-x" disabled={busy} aria-label={`Remove the tag ${t}`} onClick={() => onRemove(t)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </li>
        ))}
        {!tags.length && <li className="muted small">No tags yet.</li>}
      </ul>
      <div className="field">
        <label htmlFor={id} className="sr-only">Add a tag</label>
        <input
          id={id}
          className="input"
          value={q}
          maxLength={40}
          autoComplete="off"
          placeholder="Add a tag: type to find one or make a new one"
          aria-describedby={`${id}-hint`}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const match = free.find((t) => sameTag(t, typed)) ?? (typed && !known ? typed : hits.length === 1 ? hits[0] : '')
            if (match) add(match)
          }}
        />
      </div>
      <div className="pp-suggest" role="group" aria-label={all.length ? 'Tags you can add' : 'Starter tags you can add'}>
        {!all.length && !typed && <span className="muted small">Starter tags:</span>}
        {hits.map((t) => <button key={t} type="button" className="pp-pick" disabled={busy} onClick={() => add(t)}><span aria-hidden="true">+ </span><span className="sr-only">Add the tag </span>{t}</button>)}
        {typed && !known && <button type="button" className="pp-pick pp-pick-new" disabled={busy} onClick={() => add(typed)}>Create “{typed}”</button>}
      </div>
      <p id={`${id}-hint`} className="muted small m0">Press Enter to add what you typed. {hint}</p>
    </fieldset>
  )
}

/** Rename or delete a tag for everyone who has it. */
function ManageTags({ tags, count, busy, note, send, onDone }: { tags: string[]; count: (t: string) => number; busy: boolean; note: Note | null; send: Send; onDone: () => void }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <div className="a-dialog-body">
      <div className="pp-panel-head">
        <h2 id="pp-manage-h" className="a-h2 a-h2-lg">Manage tags</h2>
        <button type="button" className="btn btn-secondary btn-sm" data-first="" onClick={onDone}>Done</button>
      </div>
      <ul className="pp-manage-list">
        {tags.map((t) => {
          const n = count(t)
          return (
            <li key={t}>
              {renaming === t ? (
                <form className="row-wrap pp-rename" onSubmit={async (e) => { e.preventDefault(); if (cleanTag(to) === t || (await send({ action: 'renameTag', from: t, to }))) setRenaming(null) }}>
                  <label className="sr-only" htmlFor={`pp-rn-${t}`}>New name for {t}</label>
                  <input id={`pp-rn-${t}`} className="input" autoFocus required maxLength={40} value={to} onChange={(e) => setTo(e.target.value)} />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Save</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : deleting === t ? (
                <div className="stack gap-2" role="group" aria-label={`Confirm deleting ${t}`}>
                  <span>Delete “{t}”? {n ? `It comes off ${people_(n)}.` : 'Nobody has it.'}</span>
                  <div className="btn-row">
                    <button type="button" className="btn btn-secondary btn-sm" autoFocus onClick={() => setDeleting(null)}>Keep it</button>
                    <button type="button" className="btn btn-primary btn-sm pp-danger-btn" disabled={busy} onClick={async () => { if (await send({ action: 'deleteTag', tag: t })) setDeleting(null) }}>Delete “{t}”</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="stack min0"><strong>{t}</strong><span className="muted small">{people_(n)}</span></span>
                  <span className="row-wrap small">
                    <button type="button" className="linklike" onClick={() => { setDeleting(null); setTo(t); setRenaming(t) }}>Rename<span className="sr-only"> {t}</span></button>
                    <button type="button" className="linklike pp-danger" onClick={() => { setRenaming(null); setDeleting(t) }}>Delete<span className="sr-only"> {t}</span></button>
                  </span>
                </>
              )}
            </li>
          )
        })}
        {!tags.length && <li className="muted small">No tags left.</li>}
      </ul>
      <p className={`small pp-msg${note?.bad ? ' pp-bad' : ' muted'}`} role="status">{note?.text}</p>
    </div>
  )
}
