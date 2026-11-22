import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import '../../../css/admin-pages.css'
import { requireAdmin } from '@/admin/auth'
import { listProjects } from '@/admin/data'
import { openPayments, portalsOverview, type PortalCard, type Waiting } from '@/admin/portals'
import { signCounts } from '@/admin/sign-rows'
import { listRequests } from '@/portal/sign-store'

export const metadata = { title: 'Client portals' }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Items({ list, empty }: { list: Waiting[]; empty: string }) {
  if (!list.length) return <p className="muted small cp-none">{empty}</p>
  return (
    <ul className="cp-list">
      {list.map((w) => (
        <li key={w.key}>
          {w.href ? (
            w.external ? (
              <a className="text-link" href={w.href} target="_blank" rel="noopener noreferrer">{w.text}<span className="sr-only"> (opens in a new tab)</span></a>
            ) : (
              <Link className="text-link" href={w.href}>{w.text}</Link>
            )
          ) : (
            <span>{w.text}</span>
          )}
          {w.when && <span className={`small ${w.urgent ? 'a-urgent' : 'muted'}`}> · {w.when}</span>}
        </li>
      ))}
    </ul>
  )
}

type Side = 'us' | 'them'

/** Set-up gaps ("No Drive folder yet", "Nothing shared for review yet") read as one quiet line, not as tasks. */
const SETUP: Record<string, string> = { 'no-drive': 'Drive folder', 'nothing-shared': 'something shared for review' }

function Card({ c, side }: { c: PortalCard; side: Side }) {
  const seen = c.lastClient
    ? `Last client activity ${c.lastClient.when}: ${c.lastClient.text}`
    : c.opened
      ? 'Client has opened a version (no date recorded)'
      : c.quoteOnly
        ? 'Client hasn’t opened the quote yet'
        : 'Client hasn’t opened it yet'
  const setup = c.onYou.filter((w) => SETUP[w.key])
  const onYou = c.onYou.filter((w) => !SETUP[w.key])
  const list = side === 'us' ? onYou : c.onClient
  const other = side === 'us' ? c.onClient.length : onYou.length
  return (
    <li className="p-card cp-card">
      <div className="cp-top">
        <span className="a-client">{c.client}</span>
        <h3 className="cp-title"><Link className="a-strong-link" href={c.href}>{c.title}</Link></h3>
        <p className="cp-tags">
          <span className="a-stage">{c.stage}</span>
          {c.hidden && <span className="cp-tag">Hidden from the client</span>}
        </p>
        <p className="muted small cp-see">
          {c.hidden ? 'They can’t see this project.' : c.noAddress ? 'They can’t open it yet: it has no portal address.' : <>They see “{c.theySee}”. {seen}</>}
        </p>
      </div>
      <div className="cp-one">
        <h4 className="cp-h">{side === 'us' ? 'Waiting on us' : 'Waiting on them'}</h4>
        {list.length ? <Items list={list} empty="" /> : <p className="cp-quiet">{side === 'us' ? 'Nothing for us to do here' : 'Nothing out with them'}</p>}
        {other > 0 && <p className="cp-quiet">Also {plural(other, 'thing')} waiting on {side === 'us' ? 'them' : 'us'}.</p>}
        {side === 'us' && setup.length > 0 && (
          <p className="cp-quiet">
            Not set up yet:{' '}
            {setup.map((w, i) => (
              <span key={w.key}>{i > 0 && ' · '}{w.href ? <Link className="text-link" href={w.href}>{SETUP[w.key]}</Link> : SETUP[w.key]}</span>
            ))}
          </p>
        )}
      </div>
      <p className="cp-foot">
        {c.viewAs && !c.noAddress && (
          <a className="text-link" href={c.viewAs} target="_blank" rel="noopener noreferrer">
            {c.quoteOnly ? 'Open quote page' : 'Open portal'} →<span className="sr-only"> as the client sees it, for {c.title} (opens in a new tab)</span>
          </a>
        )}
        <Link className="text-link-plain muted" href={c.href}>Open project<span className="sr-only">: {c.title}</span></Link>
      </p>
    </li>
  )
}

/** The cards with something on this side first; the rest behind one "show more". */
function CardGrid({ cards, side, small }: { cards: PortalCard[]; side: Side; small?: boolean }) {
  const has = (c: PortalCard) => (side === 'us' ? c.onYou.some((w) => !SETUP[w.key]) : c.onClient.length > 0)
  const matching = cards.filter(has)
  // Nothing on this side and only a card or two: show them as they are rather than behind a click.
  const first = matching.length || cards.length > 2 ? matching : cards
  const rest = cards.filter((c) => !first.includes(c))
  const cls = `cp-grid${small ? ' cp-grid-sm' : ''}`
  return (
    <>
      {first.length ? <ul className={cls}>{first.map((c) => <Card key={c.id} c={c} side={side} />)}</ul> : <p className="cp-quiet">{side === 'us' ? 'Nothing waiting on us here.' : 'Nothing waiting on them here.'}</p>}
      {rest.length > 0 && (
        <details className="ap-more">
          <summary>Show {plural(rest.length, 'more portal')} with nothing waiting on {side === 'us' ? 'us' : 'them'}</summary>
          <div className="cp-more-list"><ul className={cls}>{rest.map((c) => <Card key={c.id} c={c} side={side} />)}</ul></div>
        </details>
      )}
    </>
  )
}

/** Every project's portal from the back-office side: what each is waiting on, from the client and from Josh. */
type Props = { searchParams: Promise<{ waiting?: string | string[] }> }

export default async function Portals({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams
  const asked = Array.isArray(sp.waiting) ? sp.waiting[0] : sp.waiting
  const [projects, payments, signRequests] = await Promise.all([listProjects(), openPayments(), listRequests().catch(() => [])])
  const { live, quotes, done, tiles: t } = portalsOverview(projects, payments)
  const docs = signCounts(signRequests)
  // Which side to show: the one asked for, or "us" when anything is waiting on us, else "them".
  const anyOnUs = [...live, ...quotes].some((c) => c.onYou.some((w) => !SETUP[w.key]))
  const side: Side = asked === 'us' || asked === 'them' ? asked : anyOnUs ? 'us' : 'them'

  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack ap-gap-3">
          <h1 className="a-h1">Client portals</h1>
          <p className="muted m0">Every project’s portal from your side: what it’s waiting on, from them and from you.</p>
        </div>
      </header>

      <section aria-label="At a glance" className="a-kpis ap-kpis-5">
        <div className="a-kpi">
          <span className="a-kpi-label">Live portals</span>
          <span className="a-kpi-num">{t.portals}</span>
          <span className="a-kpi-note">{plural(t.active, 'active project')}{t.hidden ? `, ${t.hidden} hidden from the client` : ''}</span>
        </div>
        <Link className="a-kpi td-tile" href="/admin/portals?waiting=them#cp-live">
          <span className="a-kpi-label">Waiting on them</span>
          <span className="a-kpi-num">{t.onClient}</span>
          <span className="a-kpi-note">{t.onClient ? `${plural(t.onClient, 'thing')} out, on ${plural(t.onClientProjects, 'project')}` : 'Nothing out with them'}</span>
        </Link>
        <Link className="a-kpi td-tile" href="/admin/portals?waiting=us#cp-live">
          <span className="a-kpi-label">Waiting on us</span>
          <span className={`a-kpi-num ${t.onYou ? 'a-accent' : ''}`}>{t.onYou}</span>
          <span className="a-kpi-note">{t.onYou ? `${plural(t.onYou, 'thing')} to do, on ${plural(t.onYouProjects, 'project')}` : 'You’re clear'}</span>
        </Link>
        <div className="a-kpi">
          <span className="a-kpi-label">Not opened yet</span>
          <span className="a-kpi-num">{t.notOpened}</span>
          <span className="a-kpi-note">{t.notOpened ? `${plural(t.notOpened, 'portal')} with no client activity recorded` : 'Every live portal has client activity'}</span>
        </div>
        <Link className="a-kpi td-tile" href="/admin/library?tab=out&show=out">
          <span className="a-kpi-label">Out for signature</span>
          <span className="a-kpi-num">{docs.out.length}</span>
          <span className="a-kpi-note">{plural(docs.signed.length, 'document')} signed in the last 14 days</span>
        </Link>
      </section>

      <section aria-labelledby="cp-live" className="stack ap-gap-4 a-pending-scope">
        <div className="cp-side-row">
          <h2 id="cp-live" className="a-h2">Live portals</h2>
          <nav className="a-switch" aria-label="Show what’s waiting">
            <PendingLink href="/admin/portals?waiting=us" scroll={false} aria-current={side === 'us' ? 'page' : undefined}>Waiting on us</PendingLink>
            <PendingLink href="/admin/portals?waiting=them" scroll={false} aria-current={side === 'them' ? 'page' : undefined}>Waiting on them</PendingLink>
          </nav>
        </div>
        <div className="stack ap-gap-4 a-pending-body">
        {live.length ? (
          <CardGrid cards={live} side={side} />
        ) : (
          <div className="p-card">
            <p className="a-empty"><strong>No live portals yet.</strong></p>
            <p className="muted small a-empty">A project gets its portal when it reaches Onboarding. Move one there on the <Link className="text-link" href="/admin/pipeline">Pipeline</Link> and it shows up here.</p>
          </div>
        )}
        </div>
      </section>

      {quotes.length > 0 && (
        <section aria-labelledby="cp-quotes" className="stack ap-gap-4">
          <div className="a-card-head">
            <h2 id="cp-quotes" className="a-h2">Quotes out</h2>
            <span className="muted small">No portal yet. They only see the quote page.</span>
          </div>
          <CardGrid cards={quotes} side={side} small />
        </section>
      )}

      <details className="p-card a-bucket">
        <summary className="a-card-head"><h2 className="a-h2">Paid and archived ({done.length})</h2></summary>
        {done.length ? (
          <ul className="cp-done">
            {done.map((d) => (
              <li key={d.id}>
                <Link className="a-strong-link" href={d.href}>{d.title}</Link>
                <span className="muted small">{d.client} · {d.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small a-empty">Nothing paid or archived yet.</p>
        )}
      </details>
    </div>
  )
}
