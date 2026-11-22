import Link from 'next/link'
import { PendingLink } from '@/admin/ui/pending-link'
import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-b.css'
import '../../../css/admin-simple-d.css'
import { Initials } from '@/admin/ui/viz'
import { MiniIcon, NumTile, StateDot } from '@/admin/ui/viz-d'
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

/** Set-up gaps ("No Drive folder yet", "Nothing shared for review yet") read as grey dots, not as tasks. */
const SETUP: Record<string, string> = { 'no-drive': 'Drive folder', 'nothing-shared': 'Shared for review' }
/** "No portal address yet": shown once, as a chip by the client's status, not again in the list. */
const NO_SLUG = 'no-slug'
const isTask = (w: Waiting) => !SETUP[w.key] && w.key !== NO_SLUG

function Card({ c, side }: { c: PortalCard; side: Side }) {
  const seen = c.lastClient
    ? `Last client activity ${c.lastClient.when}: ${c.lastClient.text}`
    : c.opened
      ? 'Client has opened a version (no date recorded)'
      : c.quoteOnly
        ? 'Client hasn’t opened the quote yet'
        : 'Client hasn’t opened it yet'
  const setup = c.onYou.filter((w) => SETUP[w.key])
  const noSlug = c.onYou.find((w) => w.key === NO_SLUG)
  const onYou = c.onYou.filter(isTask)
  // The count includes the missing address: it's still a thing for us to do, shown as its own chip.
  const usCount = onYou.length + (noSlug ? 1 : 0)
  const list = side === 'us' ? onYou : c.onClient
  const seenShort = c.lastClient ? `Seen ${c.lastClient.when}` : c.opened ? 'Opened' : 'Not opened'
  return (
    <li className="sa-card sd-pcard">
      <div className="sd-pc-head">
        <Initials name={c.client} />
        <div className="sd-pc-name">
          <span className="a-client">{c.client}</span>
          <h3 className="sd-pc-title"><Link className="a-strong-link" href={c.href}>{c.title}</Link></h3>
        </div>
      </div>
      <p className="sd-pc-dots">
        <span className="sa-chip" title={c.hidden ? undefined : `They see “${c.theySee}”`}>{c.stage}{!c.hidden && <span className="sr-only">. They see “{c.theySee}”</span>}</span>
        <StateDot tone={usCount ? 'accent' : 'off'} label={`${usCount} waiting on us`}>Us {usCount}</StateDot>
        <StateDot tone={c.onClient.length ? 'on' : 'off'} label={`${c.onClient.length} waiting on them`}>Them {c.onClient.length}</StateDot>
        {c.hidden ? (
          <span className="sd-seen" title="They can’t see this project."><MiniIcon kind="eye-off" />Hidden<span className="sr-only">: they can’t see this project</span></span>
        ) : noSlug ? (
          <a className="sd-seen sd-seen-warn" href={noSlug.href} target="_blank" rel="noopener noreferrer" title={noSlug.text}><MiniIcon kind="eye-off" />No portal address<span className="sr-only">. {noSlug.text} (opens the editor in a new tab)</span></a>
        ) : (
          <span className={`sd-seen${c.lastClient || c.opened ? '' : ' sd-seen-quiet'}`} title={seen}><MiniIcon kind={c.lastClient || c.opened ? 'eye' : 'eye-off'} />{seenShort}<span className="sr-only">. {seen}</span></span>
        )}
      </p>
      {list.length ? (
        <div className="sd-pc-list">
          <h4 className="sr-only">{side === 'us' ? 'Waiting on us' : 'Waiting on them'}</h4>
          <Items list={list} empty="" />
        </div>
      ) : (
        !noSlug && <p className="sd-pc-clear"><MiniIcon kind="check" />{side === 'us' ? 'Nothing for us' : 'Nothing out with them'}</p>
      )}
      {side === 'us' && setup.length > 0 && (
        <p className="sd-pc-setup">
          <span className="sr-only">Not set up yet: </span>
          {setup.map((w) =>
            w.href ? (
              <Link key={w.key} className="sd-setup-dot" href={w.href} title={w.text}><span aria-hidden="true" />{SETUP[w.key]}</Link>
            ) : (
              <span key={w.key} className="sd-setup-dot" title={w.text}><span aria-hidden="true" />{SETUP[w.key]}</span>
            ),
          )}
        </p>
      )}
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
  const cls = `cp-grid sd-pgrid${small ? ' cp-grid-sm' : ''}`
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
        <h1 className="a-h1 sa-h1">Client portals</h1>
      </header>

      <section aria-label="At a glance" className="sd-glance">
        <NumTile n={t.portals} label="live" title={`${plural(t.portals, 'live portal')}: ${plural(t.active, 'active project')}${t.hidden ? `, ${t.hidden} hidden from the client` : ''}`} />
        <NumTile n={t.onYou} label="on us" accent={t.onYou > 0} href="/admin/portals?waiting=us#cp-live" title={t.onYou ? `Waiting on us: ${plural(t.onYou, 'thing')} to do, on ${plural(t.onYouProjects, 'project')}` : 'Waiting on us: you’re clear'} />
        <NumTile n={t.onClient} label="on them" href="/admin/portals?waiting=them#cp-live" title={t.onClient ? `Waiting on them: ${plural(t.onClient, 'thing')} out, on ${plural(t.onClientProjects, 'project')}` : 'Waiting on them: nothing out with them'} />
        <NumTile n={t.notOpened} label="not opened" title={t.notOpened ? `Not opened yet: ${plural(t.notOpened, 'portal')} with no client activity recorded` : 'Every live portal has client activity'} />
        <NumTile n={docs.out.length} label="to sign" href="/admin/library?tab=out&show=out" title={`Out for signature: ${docs.out.length}. ${plural(docs.signed.length, 'document')} signed in the last 14 days`} />
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
          <h2 id="cp-quotes" className="a-h2" title="No portal yet. They only see the quote page.">Quotes out</h2>
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
