import Link from 'next/link'
import { IconFor } from './file-icon'
import { fmtSize } from './resumable'
import type { DriveFile } from './types'
import type { ItemStatus, ItemType, MonthKey, Network, PostMetrics, PublerPiece, RetainerItem } from '@/retainer/types'

/* Server-rendered pieces of the client's retainer page. No approvals anywhere: retainer work has none. */

const TZ = 'America/Edmonton'

export const NETWORK_LABEL: Record<Network, string> = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X',
  threads: 'Threads', pinterest: 'Pinterest', google: 'Google Business', bluesky: 'Bluesky', mastodon: 'Mastodon', other: 'Other',
}
const NETWORK_SHORT: Record<Network, string> = {
  instagram: 'IG', facebook: 'FB', linkedin: 'in', tiktok: 'TT', youtube: 'YT', twitter: 'X',
  threads: '@', pinterest: 'P', google: 'G', bluesky: 'BS', mastodon: 'M', other: '•',
}
export const ITEM_STATUS: Record<ItemStatus, string> = { planned: 'Planned', 'in-progress': 'In progress', scheduled: 'Scheduled', delivered: 'Delivered' }
const ITEM_TYPE: Record<ItemType, string> = { social: 'Social post', video: 'Video', photo: 'Photos', design: 'Design', other: 'Other' }

export const METRICS: { key: keyof PostMetrics; label: string }[] = [
  { key: 'reach', label: 'Reach' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'videoViews', label: 'Video views' },
]

/* ── Dates, always in Edmonton time ─────────────────────── */

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
export const fmtDayLong = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })
/** YYYY-MM-DD of an instant, in Edmonton. */
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
/** A plain YYYY-MM-DD date (no time zone involved). */
export const fmtPlainDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1, 12)).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

export const excerpt = (text: string, n = 140) => {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, '')}…`
}
const num = (n: number) => n.toLocaleString('en-CA')
export const fileHref = (clientId: string, fileId: string) => `/api/portal/retainer/${encodeURIComponent(clientId)}/file/${encodeURIComponent(fileId)}`

/* ── Progress ───────────────────────────────────────────── */

export function Progress({ done, perMonth, carried, carriedFrom, current, label }: { done: number; perMonth: number; carried: number; carriedFrom: string; current: boolean; label: string }) {
  const total = perMonth + carried
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : done > 0 ? 100 : 0
  const when = current ? 'this month' : `in ${label}`
  const text = `${done} of ${total} deliverable${total === 1 ? '' : 's'} done ${when}`
  return (
    <div className="rt-progress">
      <p className="rt-progress-num">
        <strong>{done}</strong> <span className="muted">of {total}</span>
      </p>
      <p className="rt-progress-text">
        deliverable{total === 1 ? '' : 's'} done {when}
        {carried > 0 && <span className="muted"> · {perMonth} + {carried} carried from {carriedFrom}</span>}
      </p>
      <div className="rt-bar" role="progressbar" aria-label="Deliverables done" aria-valuemin={0} aria-valuemax={Math.max(total, 1)} aria-valuenow={Math.min(done, Math.max(total, 1))} aria-valuetext={text}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {done > total && total > 0 && <p className="muted small" style={{ margin: 0 }}>That’s {done - total} more than the plan includes.</p>}
    </div>
  )
}

/* ── Month switcher ─────────────────────────────────────── */

export function MonthSwitcher({ base, months, month, label }: { base: string; months: { key: MonthKey; label: string }[]; month: MonthKey; label: (m: MonthKey) => string }) {
  const i = months.findIndex((m) => m.key === month)
  const prev = i > 0 ? months[i - 1] : undefined
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : undefined
  if (months.length < 2) return null
  return (
    <nav className="rt-months" aria-label="Choose a month">
      <div className="rt-months-step">
        {prev ? (
          <Link className="chip" href={`${base}?m=${prev.key}`} scroll={false}><span aria-hidden="true">←</span> {prev.label}</Link>
        ) : <span className="chip rt-chip-off" aria-hidden="true">←</span>}
        <span className="rt-months-now" aria-current="true">{label(month)}</span>
        {next ? (
          <Link className="chip" href={`${base}?m=${next.key}`} scroll={false}>{next.label} <span aria-hidden="true">→</span></Link>
        ) : <span className="chip rt-chip-off" aria-hidden="true">→</span>}
      </div>
      {months.length > 2 && (
        <form method="get" action={base} className="rt-months-pick">
          <label htmlFor="rt-month" className="sr-only">Month</label>
          <select id="rt-month" name="m" defaultValue={month} className="rt-select">
            {[...months].reverse().map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">Show</button>
        </form>
      )}
    </nav>
  )
}

/* ── Month contents ─────────────────────────────────────── */

export function ItemList({ items, clientId }: { items: RetainerItem[]; clientId: string }) {
  return (
    <ul className="rt-list">
      {items.map((it) => (
        <li key={it._key} className="rt-row">
          <div className="rt-row-main">
            <span className="rt-kicker">{ITEM_TYPE[it.type] ?? 'Other'}{it.deliveredAt && it.status === 'delivered' ? ` · ${fmtPlainDate(it.deliveredAt)}` : ''}</span>
            <strong className="rt-title">{it.title}</strong>
            {it.note && <span className="muted small">{it.note}</span>}
            {it.status === 'delivered' && (it.files?.length ?? 0) > 0 && (
              <ul className="rt-item-files">
                {it.files!.map((f) => (
                  <li key={f.id}>
                    <a className="text-link small" href={fileHref(clientId, f.id)} download>
                      {f.name}<span className="sr-only">, download</span>
                    </a>
                    {f.size ? <span className="muted small"> · {fmtSize(f.size)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className={`pill rt-pill rt-pill-${it.status}`}>{ITEM_STATUS[it.status] ?? it.status}</span>
        </li>
      ))}
    </ul>
  )
}

function Networks({ piece }: { piece: PublerPiece }) {
  return (
    <ul className="rt-nets" aria-label="Posted to">
      {piece.networks.map((n) => {
        const name = NETWORK_LABEL[n.network] ?? 'Other'
        const inner = (
          <>
            <span className={`rt-net-ico rt-net-${n.network}`} aria-hidden="true">{NETWORK_SHORT[n.network] ?? '•'}</span>
            {name}
            {n.accountName && <span className="muted"> · {n.accountName}</span>}
          </>
        )
        return (
          <li key={n.postId}>
            {piece.state === 'published' && n.link ? (
              <a className="rt-net" href={n.link} target="_blank" rel="noopener noreferrer">
                {inner} <span aria-hidden="true">↗</span><span className="sr-only"> (see the live post, opens in a new tab)</span>
              </a>
            ) : (
              <span className="rt-net">{inner}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function PieceList({ pieces }: { pieces: PublerPiece[] }) {
  return (
    <ul className="rt-list">
      {pieces.map((p) => (
        <li key={p.id} className="rt-row">
          <div className="rt-row-main">
            <span className="rt-kicker"><time dateTime={p.at}>{fmtWhen(p.at)}</time>{p.postType ? ` · ${p.postType}` : ''}</span>
            <p className="rt-text">{excerpt(p.text) || <span className="muted">No caption</span>}</p>
            <Networks piece={p} />
          </div>
          <span className={`pill rt-pill rt-pill-${p.state}`}>{p.state === 'published' ? 'Published' : 'Scheduled'}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── Posting schedule ───────────────────────────────────── */

export function Schedule({ pieces }: { pieces: PublerPiece[] }) {
  const days = new Map<string, PublerPiece[]>()
  for (const p of [...pieces].sort((a, b) => a.at.localeCompare(b.at))) {
    const k = dayKey(p.at)
    days.set(k, [...(days.get(k) ?? []), p])
  }
  return (
    <ol className="rt-days">
      {[...days.entries()].map(([k, list]) => (
        <li key={k} className="rt-day">
          <h3 className="rt-day-h">{fmtDayLong(list[0].at)}</h3>
          <ul className="rt-day-list">
            {list.map((p) => (
              <li key={p.id}>
                <time dateTime={p.at} className="rt-day-time">{fmtTime(p.at)}</time>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="rt-day-text">{excerpt(p.text, 100) || 'No caption'}</span>
                  <span className="muted small">{p.networks.map((n) => NETWORK_LABEL[n.network] ?? 'Other').join(', ')}</span>
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

/* ── Analytics ──────────────────────────────────────────── */

export function Analytics({ pieces, label }: { pieces: PublerPiece[]; label: string }) {
  const withData = pieces.filter((p) => p.state === 'published' && p.metrics && METRICS.some((m) => typeof p.metrics![m.key] === 'number'))
  if (!withData.length) return <p className="muted" style={{ margin: 0 }}>No numbers yet for {label}. They show up here a day or two after posts go out.</p>
  const shown = METRICS.filter((m) => withData.some((p) => typeof p.metrics![m.key] === 'number'))
  const totals = shown.map((m) => ({ ...m, total: withData.reduce((n, p) => n + (p.metrics![m.key] ?? 0), 0) }))
  const sortKey: keyof PostMetrics = shown.some((m) => m.key === 'engagement') ? 'engagement' : shown[0].key
  const top = [...withData].sort((a, b) => (b.metrics![sortKey] ?? 0) - (a.metrics![sortKey] ?? 0)).slice(0, 10)
  return (
    <div className="stack" style={{ gap: 'var(--space-8)' }}>
      <dl className="rt-totals">
        {totals.map((t) => (
          <div key={t.key}>
            <dt>{t.label}</dt>
            <dd>{num(t.total)}</dd>
          </div>
        ))}
      </dl>
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <h3 className="rt-sub" id="rt-top-h">Top posts</h3>
        <div className="rt-table-wrap" role="region" aria-labelledby="rt-top-h" tabIndex={0}>
          <table className="rt-table">
            <caption className="sr-only">Published posts in {label}, sorted by {sortKey === 'engagement' ? 'engagement' : shown[0].label.toLowerCase()}, highest first</caption>
            <thead>
              <tr>
                <th scope="col">Post</th>
                {shown.map((m) => <th key={m.key} scope="col" className="num">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <span className="rt-table-post">{excerpt(p.text, 70) || 'No caption'}</span>
                    <span className="muted small">{fmtPlainDate(dayKey(p.at))} · {p.networks.map((n) => NETWORK_LABEL[n.network] ?? 'Other').join(', ')}</span>
                  </th>
                  {shown.map((m) => <td key={m.key} className="num">{typeof p.metrics![m.key] === 'number' ? num(p.metrics![m.key]!) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── Files ──────────────────────────────────────────────── */

export function FileRows({ files, clientId }: { files: DriveFile[]; clientId: string }) {
  return (
    <ul className="file-list lib-files rt-files">
      {files.map((f) => (
        <li key={f.id}>
          <IconFor name={f.name} mime={f.mimeType} />
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <span className="fname">{f.name}</span>
            <span className="muted small">{fmtSize(f.size) || ' '}</span>
          </span>
          <a className="text-link small" href={fileHref(clientId, f.id)} download>
            Download<span className="sr-only"> {f.name}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
