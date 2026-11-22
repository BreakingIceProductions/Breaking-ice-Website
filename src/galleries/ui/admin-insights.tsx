import type { FavouriteList, GallerySet, Visit } from '../types'
import { CopyButton } from './admin-copy'
import type { AdminPhoto } from './admin-grid'
import { fmtDate } from '@/admin/dates'

/**
 * What clients and guests did with the gallery: their favourites (with file names ready to paste
 * into Lightroom) and their visits and downloads. Rendered on the server; only the copy buttons run in the browser.
 */

const STRIP = 12
const KIND: Record<string, string> = { client: 'Client', guest: 'Guest', admin: 'You' }
const when = (iso: string) => fmtDate(iso, 'time')
const stem = (name: string) => name.replace(/\.[^.]+$/, '')

export function Favourites({ favs, photos }: { favs: FavouriteList[]; photos: AdminPhoto[] }) {
  const byKey = new Map(photos.map((p) => [p.key, p]))
  return (
    <section className="p-card ga-panel" aria-labelledby="ga-fav-h">
      <h2 id="ga-fav-h" className="a-h2">Favourites</h2>
      {favs.length ? (
        <ul className="ga-people">
          {favs.map((f, i) => {
            const list = f.keys.map((k) => byKey.get(k)).filter((p): p is AdminPhoto => Boolean(p))
            const names = list.map((p) => p.name)
            return (
              <li key={`${f.viewerEmail ?? f.viewerName}-${i}`} className="ga-person">
                <div className="ga-person-head">
                  <div>
                    <strong>{f.viewerName}</strong> <span className="muted small">· {KIND[f.kind] ?? f.kind}</span>
                    {f.viewerEmail && <div className="muted small ga-mono">{f.viewerEmail}</div>}
                  </div>
                  <span className="small">♥ {list.length} {list.length === 1 ? 'photo' : 'photos'}</span>
                </div>
                {list.length > 0 && (
                  <>
                    <ul className="ga-strip" aria-label={`${f.viewerName}’s favourites`}>
                      {list.slice(0, STRIP).map((p) => (
                        <li key={p.key} title={p.name}>{p.thumb ? <img src={p.thumb} alt={p.name} loading="lazy" decoding="async" /> : <span className="ga-thumb-missing">{p.name}</span>}</li>
                      ))}
                      {list.length > STRIP && <li className="ga-strip-more muted small">+{list.length - STRIP}</li>}
                    </ul>
                    <div className="btn-row">
                      <CopyButton text={names.join('\n')} label="Copy file names" />
                      <CopyButton text={names.map(stem).join(', ')} label="Copy Lightroom search" />
                    </div>
                  </>
                )}
                {list.length < f.keys.length && <p className="muted small m0">{f.keys.length - list.length} of their picks have since been removed from the gallery.</p>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted small a-empty">♡ None yet</p>
      )}
    </section>
  )
}

export function Activity({ visits, photos, sets }: { visits: Visit[]; photos: AdminPhoto[]; sets: GallerySet[] }) {
  const byKey = new Map(photos.map((p) => [p.key, p]))
  const setTitle = new Map(sets.map((s) => [s._key, s.title]))
  const label = (d: Visit['downloads'][number]) => {
    const size = d.size === 'web' ? 'web-size' : 'full-size'
    if (d.what === 'zip') return `zip: ${d.ref === 'all' ? 'all' : d.ref === 'favourites' ? 'favourites' : setTitle.get(d.ref) ?? d.label ?? 'a set'} (${size})`
    return `${byKey.get(d.ref)?.name ?? d.label ?? 'a removed photo'} (${size})`
  }
  return (
    <section className="p-card ga-panel" aria-labelledby="ga-act-h">
      <h2 id="ga-act-h" className="a-h2">Activity</h2>
      {visits.length ? (
        <ul className="ga-people">
          {visits.map((v, i) => (
            <li key={`${v.viewerEmail ?? v.viewerName}-${i}`} className="ga-person">
              <div className="ga-person-head">
                <div>
                  <strong>{v.viewerName}</strong> <span className="muted small">· {KIND[v.kind] ?? v.kind}</span>
                  {v.viewerEmail && <div className="muted small ga-mono">{v.viewerEmail}</div>}
                </div>
                <span className="small">{v.views} {v.views === 1 ? 'visit' : 'visits'} · {v.downloads.length} {v.downloads.length === 1 ? 'download' : 'downloads'}</span>
              </div>
              <p className="muted small m0">First {when(v.firstAt)} · last {when(v.lastAt)}</p>
              {v.downloads.length > 0 && (
                <ul className="ga-dl-list small">
                  {v.downloads.slice(0, 5).map((d, j) => (
                    <li key={`${d.at}-${j}`}>
                      <span className="muted">{when(d.at)}</span> · {label(d)}
                    </li>
                  ))}
                  {v.downloads.length > 5 && <li className="muted">and {v.downloads.length - 5} earlier</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small a-empty">Not opened yet</p>
      )}
    </section>
  )
}
