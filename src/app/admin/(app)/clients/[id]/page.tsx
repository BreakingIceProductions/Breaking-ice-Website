import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-a.css'
import '../../../../css/admin-simple-b.css'
import '../../../../css/admin-simple-c.css'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClient } from '@/admin/data'
import { cad } from '@/admin/insights'
import { fmtAgo } from '@/admin/dates'
import { activityText } from '@/admin/activity-text'
import { getPeople } from '@/admin/people'
import { tagsFor } from '@/admin/people-shared'
import { stageIndex, stageTitle } from '@/admin/stages'
import type { OfficeProject } from '@/admin/types'
import { TagChips } from '@/admin/ui/tag-chips'
import { PortalChatCard } from '@/admin/ui/portal-chat-card'
import { Segments } from '@/admin/ui/graphics'
import { StageChip, Timeline } from '@/admin/ui/viz-c'
import { PROJECT_TYPES } from '@/sanity/portal/office-constants'
import { recurringUrl, invoiceUrl, zohoConnection } from '@/admin/zoho'
import { portalClient } from '@/portal/data'
import { retainerPaymentsFor } from '@/portal/retainer-billing'

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ added?: string; found?: string }> }

export async function generateMetadata({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  return { title: (await getClient(id))?.organizationName ?? 'Client' }
}

const studioHref = (id: string) => `/studio/portal/structure/client;${encodeURIComponent(id)}`

/** Where each project sits in the relationship: on the go, still a conversation, or done. */
const GROUPS: { title: string; test: (p: OfficeProject) => boolean; empty: string }[] = [
  { title: 'On the go', test: (p) => stageIndex(p.pipelineStage) >= stageIndex('booked') && stageIndex(p.pipelineStage) < stageIndex('delivered'), empty: 'None right now' },
  { title: 'In conversation', test: (p) => stageIndex(p.pipelineStage) < stageIndex('booked'), empty: '' },
  { title: 'Done together', test: (p) => stageIndex(p.pipelineStage) >= stageIndex('delivered'), empty: 'None yet' },
]

export default async function ClientPage({ params, searchParams }: Props) {
  await requireAdmin()
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const [c, people] = await Promise.all([getClient(id), getPeople()])
  if (!c) notFound()
  const delivered = c.projects.filter(GROUPS[2].test).length
  const feed = c.projects
    .flatMap((p) => [
      ...p.activity.map((a) => ({ at: a.at, text: a.text, project: p.title })),
      ...(p.office.log ?? []).map((l) => ({ at: l.at, text: l.text, project: p.title })),
      ...(p.office.notes ?? []).map((n) => ({ at: n.at, text: n.text, project: p.title })),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)
  const outstanding = c.billed - c.paid

  return (
    <div className="a-page cp-page">
      <Breadcrumb trail={[{ label: 'Clients', href: '/admin/clients' }]} />

      <header className="a-head">
        <div className="stack ap-head-text">
          <h1 className="a-h1">{c.organizationName}</h1>
          <div className="row-wrap a-chips">
            <a className="a-chip a-chip-link" href={studioHref(c._id)} target="_blank" rel="noopener noreferrer">Edit client details<span className="sr-only"> in the editor (opens in a new tab)</span> ↗</a>
            {c.driveFolderId && (
              <a className="a-chip a-chip-link" href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} target="_blank" rel="noopener noreferrer">Drive folder<span className="sr-only"> (opens in a new tab)</span> ↗</a>
            )}
            <a className="a-chip a-chip-link" href={`/api/admin/view-as?client=${encodeURIComponent(c._id)}`} target="_blank" rel="noopener noreferrer">View their portal<span className="sr-only"> (opens in a new tab)</span> ↗</a>
          </div>
        </div>
        <Link className="btn sa-copper" href={`/admin/projects/new?client=${encodeURIComponent(c._id)}`}>New project</Link>
      </header>

      {sp.added && <p className="ap-note" role="status">Client added. Nobody was emailed. Start their first project with New project.</p>}
      {sp.found && <p className="ap-note" role="status">This client was already here (same organisation or email), so nothing new was made.</p>}

      <dl className="a-kpis ap-kpis-dl sc-kpis">
        <div className="a-kpi">
          <dt className="a-kpi-label">Projects</dt>
          <dd className="a-kpi-num">{c.projects.length}</dd>
          {c.projects.length > 0 && <dd className="sc-kpi-mark"><Segments total={c.projects.length} done={delivered} label={`${delivered} of ${c.projects.length} delivered`} /><span className="sa-muted small" aria-hidden="true">{delivered} delivered</span></dd>}
        </div>
        <div className="a-kpi" title="Invoiced through Zoho Books"><dt className="a-kpi-label">Invoiced</dt><dd className="a-kpi-num">{cad(c.billed)}</dd></div>
        <div className={`a-kpi${outstanding > 0 ? ' is-hot' : ''}`}><dt className="a-kpi-label">Outstanding</dt><dd className="a-kpi-num">{cad(outstanding)}</dd>{outstanding <= 0 && c.billed > 0 && <dd className="sc-kpi-mark"><span className="sb-chip sb-ok"><span className="sb-dot" aria-hidden="true" />Paid up</span></dd>}</div>
        <div className="a-kpi"><dt className="a-kpi-label">Last activity</dt><dd className="a-kpi-num ap-kpi-num-sm">{c.lastActivity ? fmtAgo(c.lastActivity) : '—'}</dd></div>
      </dl>

      <div className="a-grid-2 ap-grid-top">
        <div className="stack ap-col">
          {GROUPS.map((g) => {
            const list = c.projects.filter(g.test)
            if (!list.length && !g.empty) return null
            return (
              <section key={g.title} className="p-card" aria-label={g.title}>
                <div className="a-card-head">
                  <h2 className="a-h2">{g.title}</h2>
                  <span className="sa-count">{list.length}</span>
                </div>
                {list.length ? (
                  <ul className="a-rows">
                    {list.map((p) => (
                      <li key={p._id}>
                        <Link className="a-row-main" href={`/admin/projects/${p._id}`}>
                          <strong>{p.title}</strong>
                          <span className="muted small">
                            {[PROJECT_TYPES.find((t) => t.value === p.projectType)?.title, p.deliverables.length && `${p.deliverables.length} deliverable${p.deliverables.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || 'Open the project'}
                          </span>
                        </Link>
                        <span className="a-row-side">
                          <StageChip stage={p.pipelineStage} title={stageTitle(p.pipelineStage)} />
                          {p.quoteAmount ? <span className="muted small">{cad(p.quoteAmount)}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sc-empty">{g.empty}</p>
                )}
              </section>
            )
          })}
        </div>

        <aside className="stack ap-col">
          <section className="p-card" aria-labelledby="h-people">
            <h2 id="h-people" className="a-h2">People</h2>
            {c.contacts?.length ? (
              <dl className="key-dates">
                {c.contacts.map((p) => (
                  <div key={p._key}>
                    <dt>{p.email ? <a className="text-link-plain" href={`mailto:${p.email}`}>{p.name}</a> : p.name}<TagChips tags={tagsFor(people, p.email)} label={`Tags on ${p.name}`} /></dt>
                    <dd className="muted">
                      {p.role || p.email}
                      {/* Under the role or email, tap to call on a phone. */}
                      {p.phone && <>{(p.role || p.email) && <br />}Phone: <a className="text-link-plain" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a></>}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted a-empty">No contacts yet. Add them with Edit client details so they can sign in to the portal.</p>
            )}
            {c.billingEmail && <p className="muted small m0">Invoices go to {c.billingEmail}</p>}
          </section>

          <RecurringCard clientId={c._id} />

          <PortalChatCard clientId={c._id} />

          <section className="p-card" aria-labelledby="h-feed">
            <h2 id="h-feed" className="a-h2">Recent activity</h2>
            {feed.length ? (
              <Timeline label="Recent activity, newest first" items={feed.map((f, i) => ({ key: String(i), text: activityText(f.text), sub: f.project, when: fmtAgo(f.at), dateTime: f.at }))} />
            ) : (
              <p className="sc-empty">None yet</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

const PAY_STATUS: Record<string, string> = { due: 'Due', processing: 'Client says it’s sent', paid: 'Paid' }

/**
 * Read-only: the client's Zoho Books recurring invoice profiles (from their boClient record) and the
 * monthly invoices mirrored into the portal from them. Nothing here calls Zoho; it renders nothing
 * for clients without a profile.
 */
async function RecurringCard({ clientId }: { clientId: string }) {
  const [ids, pays, conn] = await Promise.all([
    portalClient.fetch<string[] | null>(`*[_id == $id][0].zohoRecurringIds`, { id: `bo-client-${clientId}` }).catch(() => null),
    retainerPaymentsFor(clientId).catch(() => []),
    zohoConnection().catch(() => null),
  ])
  if (!ids?.length && !pays.length) return null
  const org = conn?.orgId
  return (
    <section className="p-card" aria-labelledby="h-recurring">
      <h2 id="h-recurring" className="a-h2">Recurring invoices</h2>
      {ids?.length ? (
        <p className="muted small m0">
          Zoho Books profile{ids.length === 1 ? '' : 's'}:{' '}
          {ids.map((rid, i) => (
            <span key={rid}>
              {i > 0 && ', '}
              {org ? <a className="text-link-plain" href={recurringUrl(org, rid)} target="_blank" rel="noopener noreferrer">{rid}<span className="sr-only"> (opens Zoho Books)</span></a> : rid}
            </span>
          ))}
        </p>
      ) : null}
      {pays.length ? (
        <ul className="a-rows">
          {pays.map((p) => (
            <li key={p._id}>
              <span className="a-row-main">
                <strong>{p.label}</strong>
                <span className="muted small">
                  {p.zohoInvoiceNumber && p.zohoInvoiceId && org ? <a className="text-link-plain" href={invoiceUrl(org, p.zohoInvoiceId)} target="_blank" rel="noopener noreferrer">{p.zohoInvoiceNumber}</a> : (p.zohoInvoiceNumber ?? 'Invoice')} · {PAY_STATUS[p.status] ?? p.status}
                </span>
              </span>
              <span className="a-row-side"><span className="muted small">{cad(p.total)}</span></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sc-empty">No invoices from it yet. They show here once Zoho Books makes them.</p>
      )}
    </section>
  )
}
