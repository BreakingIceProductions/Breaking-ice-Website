import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { quoteStatus } from '@/admin/board-data'
import { getProject } from '@/admin/data'
import { daysSince, fmtDay, today, TZ, ymd } from '@/admin/dates'
import { budgetTitle, fmtTime, isContactLog, isSalesStage, LOST_REASONS, typeTitle } from '@/admin/lead'
import { LeadActivity, LeadArchive, LeadFields, LeadSteps, type LeadLogEntry } from '@/admin/ui/lead'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const p = await getProject(id)
  return { title: p ? (p.office.lead?.name ?? p.client.contacts?.[0]?.name ?? p.title) : 'Lead' }
}

const day = (d?: string) => fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })

/** One lead: where they are, what's next, their details and every contact so far. Booked projects have the project page. */
export default async function LeadPage({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const p = await getProject(id)
  if (!p) notFound()
  if (!isSalesStage(p.pipelineStage)) redirect(`/admin/projects/${encodeURIComponent(p._id)}`)

  const lead = p.office.lead ?? {}
  const contacts = p.client.contacts ?? []
  // The person on the lead, when they're one of the client's contacts; with no name on the lead, the client's first contact.
  const listed = lead.email ? contacts.find((c) => c.email?.toLowerCase() === lead.email!.toLowerCase()) : lead.name ? undefined : contacts[0]
  const name = listed?.name ?? lead.name
  const email = listed?.email ?? lead.email
  const company = p.client.organizationName
  const title = name || p.title
  const projectPage = `/admin/projects/${encodeURIComponent(p._id)}`

  const log = [...(p.office.log ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const entries: LeadLogEntry[] = log.map((l) => ({ key: l._key, date: day(ymd(new Date(l.at))), time: l.day ? undefined : clock(l.at), text: l.text }))
  const lastContact = log.find((l) => isContactLog(l.kind))
  const moved = daysSince(p.office.stageChangedAt)
  const quote = quoteStatus(p)

  const next = {
    lead: { title: 'Reply and send a call link', detail: email ? `Write to ${email} with a time to talk.` : 'Add their email, then write with a time to talk.' },
    call: { title: 'Have the call', detail: lead.callDate ? `${day(lead.callDate)}${lead.callTime ? ` at ${fmtTime(lead.callTime)}` : ''}` : 'No call time set yet. Add it under The project.' },
    proposal: { title: 'Write the quote', detail: quote ?? 'Call done. Price it up while it’s fresh.' },
    quoted: { title: 'Follow up on the quote', detail: quote ?? 'No quote has gone out through the portal yet.' },
  }[p.pipelineStage as 'lead' | 'call' | 'proposal' | 'quoted']
  const reason = LOST_REASONS.find((r) => r.value === lead.lostReason)?.title

  return (
    <div className="a-page">
      <Link className="text-link-plain muted small ld-back" href="/admin/pipeline">← Pipeline</Link>

      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
          <h1 className="a-h1">{title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {[company, typeTitle(p.projectType), budgetTitle(lead.budget)].filter(Boolean).join(' · ')}
            {name && <span className="ld-project"> · {p.title}</span>}
          </p>
        </div>
        <div className="btn-row">
          <Link className="text-link small" href={projectPage}>Quote, files and the rest</Link>
          {!p.archived && <LeadArchive projectId={p._id} name={title} />}
        </div>
      </header>

      {p.archived && (
        <p className="a-sample" role="status" style={{ margin: 0 }}>Archived{reason ? ` · ${reason}` : ''}. Bring them back from the Archive bar on the Pipeline.</p>
      )}

      <section className="p-card ld-stage" aria-label="Where they are">
        <LeadSteps projectId={p._id} projectTitle={p.title} stage={p.pipelineStage} quoteSent={Boolean(p.quote?.sharedAt)} />
        <p className="muted small" style={{ margin: 0 }}>Click any stage to move them there. Signed makes the project.</p>
      </section>

      <section className="bd-nextup ld-nextup" aria-label="Next up">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="eyebrow">Next up</span>
          <strong className="ld-next-title">{next.title}</strong>
          <span className="small">{next.detail}</span>
          {moved != null && <span className="small muted">Moved here {moved === 0 ? 'today' : `${moved} day${moved === 1 ? '' : 's'} ago`}</span>}
        </div>
        {p.pipelineStage === 'proposal' && (
          <div className="btn-row">
            <Link className="btn btn-primary btn-sm" href="/admin/proposals/new">Open the quote builder</Link>
            <Link className="btn btn-secondary btn-sm" href={`${projectPage}?tab=documents`}>Upload and send the quote</Link>
          </div>
        )}
        {p.pipelineStage === 'quoted' && <Link className="btn btn-secondary btn-sm" href={`${projectPage}?tab=documents`}>Open the quote</Link>}
      </section>

      <div className="stack" style={{ gap: 4 }}>
        <p className="small" style={{ margin: 0 }}>
          <strong>Last contact:</strong>{' '}
          {lastContact ? `${lastContact.text}, ${day(ymd(new Date(lastContact.at)))}` : log[0] ? `none logged yet. Latest activity: ${log[0].text}, ${day(ymd(new Date(log[0].at)))}` : 'none logged yet.'}
        </p>
        <p className="muted small" style={{ margin: 0 }}>Call links and email tracking arrive when Google Calendar and Gmail are connected.</p>
      </div>

      <div className="a-split">
        <div className="a-col stack">
          <LeadFields
            projectId={p._id}
            projectType={p.projectType}
            lead={lead}
            contact={{ name, email, company, onClient: Boolean(listed), studioHref: p.client._id ? `/studio/portal/structure/client;${encodeURIComponent(p.client._id)}` : undefined }}
          />
        </div>
        <aside className="stack a-col a-aside ld-aside" aria-label="Activity">
          <LeadActivity projectId={p._id} today={today()} entries={entries} />
        </aside>
      </div>
    </div>
  )
}
