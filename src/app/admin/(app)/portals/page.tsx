import Link from 'next/link'
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

function Card({ c }: { c: PortalCard }) {
  const seen = c.lastClient
    ? `Last client activity ${c.lastClient.when}: ${c.lastClient.text}`
    : c.opened
      ? 'Client has opened a version (no date recorded)'
      : c.quoteOnly
        ? 'Client hasn’t opened the quote yet'
        : 'Client hasn’t opened it yet'
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
      <div className="cp-cols">
        <div>
          <h4 className="cp-h">Waiting on the client</h4>
          <Items list={c.onClient} empty="Nothing out with them" />
        </div>
        <div>
          <h4 className="cp-h">Waiting on you</h4>
          <Items list={c.onYou} empty="You’re clear" />
        </div>
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

/** Every project's portal from the back-office side: what each is waiting on, from the client and from Josh. */
export default async function Portals() {
  await requireAdmin()
  const [projects, payments, signRequests] = await Promise.all([listProjects(), openPayments(), listRequests().catch(() => [])])
  const { live, quotes, done, tiles: t } = portalsOverview(projects, payments)
  const docs = signCounts(signRequests)

  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <h1 className="a-h1">Client portals</h1>
          <p className="muted" style={{ margin: 0 }}>Every project’s portal from your side: what it’s waiting on, from them and from you.</p>
        </div>
      </header>

      <section aria-label="At a glance" className="a-kpis">
        <div className="a-kpi">
          <span className="a-kpi-label">Live portals</span>
          <span className="a-kpi-num">{t.portals}</span>
          <span className="a-kpi-note">{plural(t.active, 'active project')}{t.hidden ? `, ${t.hidden} hidden from the client` : ''}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Waiting on clients</span>
          <span className="a-kpi-num">{t.onClient}</span>
          <span className="a-kpi-note">{t.onClient ? `${plural(t.onClient, 'thing')} out, on ${plural(t.onClientProjects, 'project')}` : 'Nothing out with them'}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Waiting on you</span>
          <span className={`a-kpi-num ${t.onYou ? 'a-accent' : ''}`}>{t.onYou}</span>
          <span className="a-kpi-note">{t.onYou ? `${plural(t.onYou, 'thing')} to do, on ${plural(t.onYouProjects, 'project')}` : 'You’re clear'}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">Not opened yet</span>
          <span className="a-kpi-num">{t.notOpened}</span>
          <span className="a-kpi-note">{t.notOpened ? `${plural(t.notOpened, 'portal')} with no client activity recorded` : 'Every live portal has client activity'}</span>
        </div>
        <Link className="a-kpi" href="/admin/library?tab=out&show=out">
          <span className="a-kpi-label">Out for signature</span>
          <span className="a-kpi-num">{docs.out.length}</span>
          <span className="a-kpi-note">{plural(docs.signed.length, 'document')} signed in the last 14 days</span>
        </Link>
      </section>

      <section aria-labelledby="cp-live" className="stack" style={{ gap: 'var(--space-4)' }}>
        <h2 id="cp-live" className="a-h2">Live portals</h2>
        {live.length ? (
          <ul className="cp-grid">{live.map((c) => <Card key={c.id} c={c} />)}</ul>
        ) : (
          <div className="p-card">
            <p className="a-empty"><strong>No live portals yet.</strong></p>
            <p className="muted small a-empty">A project gets its portal when it reaches Onboarding. Move one there on the <Link className="text-link" href="/admin/pipeline">Pipeline</Link> and it shows up here.</p>
          </div>
        )}
      </section>

      {quotes.length > 0 && (
        <section aria-labelledby="cp-quotes" className="stack" style={{ gap: 'var(--space-4)' }}>
          <div className="a-card-head">
            <h2 id="cp-quotes" className="a-h2">Quotes out</h2>
            <span className="muted small">No portal yet. They only see the quote page.</span>
          </div>
          <ul className="cp-grid cp-grid-sm">{quotes.map((c) => <Card key={c.id} c={c} />)}</ul>
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
