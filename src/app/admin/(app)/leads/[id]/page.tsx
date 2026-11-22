import Link from 'next/link'
import '../../../../css/admin-pages.css'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { quoteStatus } from '@/admin/board-data'
import { getProject } from '@/admin/data'
import { composerSetup } from '@/admin/email-templates'
import { daysSince, today, TZ, ymd, fmtDate } from '@/admin/dates'
import { budgetTitle, fmtTime, isContactLog, isSalesStage, LOST_REASONS, typeTitle } from '@/admin/lead'
import { getPeople } from '@/admin/people'
import { tagsFor } from '@/admin/people-shared'
import { EmailComposer, SentEmails } from '@/admin/ui/email'
import { LeadActivity, LeadArchive, LeadFields, LeadSteps, type LeadLogEntry } from '@/admin/ui/lead'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string | string[] }> }

export async function generateMetadata({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const p = await getProject(id)
  return { title: p ? p.title : 'Lead' }
}

const day = (d?: string) => fmtDate(d, 'weekday')
/**
 * What to call them on a button: a first name when there's a plain one, otherwise nothing (the
 * button then says "them"). Skips titles ("Dr."), placeholders in brackets ("[Client name]"), quotes and an
 * email address typed into the name field.
 */
function firstName(name?: string) {
  // A bracketed name is a placeholder ("[Client contact]"), not a name.
  if (/^\s*[[({<]/.test(name ?? '')) return null
  const clean = (name ?? '').replace(/[[\](){}"“”<>]/g, ' ').trim()
  if (!clean || clean.includes('@')) return null
  const words = clean.split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|mx|miss|prof|sir|rev)\.?$/i.test(w))
  const first = words[0]?.replace(/[.,;:]+$/, '')
  return first && /^\p{L}[\p{L}'’-]*$/u.test(first) ? first : null
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })

/** One lead: where they are, what's next, their details and every contact so far. Booked projects have the project page. */
export default async function LeadPage({ params, searchParams }: Props) {
  const admin = await requireAdmin()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const [p, people] = await Promise.all([getProject(id), getPeople()])
  if (!p) notFound()
  if (!isSalesStage(p.pipelineStage)) redirect(`/admin/projects/${encodeURIComponent(p._id)}`)

  const lead = p.office.lead ?? {}
  const contacts = p.client.contacts ?? []
  // The person on the lead, when they're one of the client's contacts; with no name on the lead, the client's first contact.
  const listed = lead.email ? contacts.find((c) => c.email?.toLowerCase() === lead.email!.toLowerCase()) : lead.name ? undefined : contacts[0]
  const name = listed?.name ?? lead.name
  const email = listed?.email ?? lead.email
  const company = p.client.organizationName
  const title = p.title
  const callThem = firstName(name) ?? 'them'
  const projectPage = `/admin/projects/${encodeURIComponent(p._id)}`
  const compose = admin.viewOnly ? null : await composerSetup(p, { name, email })
  const writeInNextUp = p.pipelineStage === 'lead' || p.pipelineStage === 'call'

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
      <Breadcrumb trail={[{ label: 'Pipeline', href: '/admin/pipeline' }]} />

      <header className="a-head">
        <div className="stack ap-gap-2 ap-minw0">
          <h1 className="a-h1">{title}</h1>
          <p className="muted m0">{[company, typeTitle(p.projectType), budgetTitle(lead.budget)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="btn-row">
          <Link className="text-link small" href={projectPage}>Open project page</Link>
          {/* Before the quote the composer lives in Next up instead, so there's one way to write to them. */}
          {compose && !writeInNextUp && <EmailComposer key={sp.email === '1' ? 'open' : 'closed'} projectId={p._id} {...compose} startOpen={sp.email === '1'} />}
          {!p.archived && <LeadArchive projectId={p._id} name={title} />}
        </div>
      </header>

      {p.archived && (
        <p className="ap-note" role="status">Archived{reason ? ` · ${reason}` : ''}. Bring them back from the Archive bar on the Pipeline.</p>
      )}

      <section className="p-card ld-stage" aria-label="Where they are">
        <LeadSteps projectId={p._id} projectTitle={p.title} stage={p.pipelineStage} quoteSent={Boolean(p.quote?.sharedAt)} />
        <p className="muted small m0">Pick a stage to move them there. Signed makes the project.</p>
      </section>

      <section className="bd-nextup ld-nextup" aria-label="Next up">
        <div className="stack ap-tight ap-minw0">
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
        {p.pipelineStage === 'quoted' && <Link className="btn btn-primary btn-sm" href={`${projectPage}?tab=documents`}>Open the quote</Link>}
        {writeInNextUp && compose && (
          // The page's one primary; ?email=1 still opens it.
          <span className="ld-compose">
            <EmailComposer primary key={sp.email === '1' ? 'open' : 'closed'} projectId={p._id} {...compose} startOpen={sp.email === '1'} label={p.pipelineStage === 'lead' ? `Write to ${callThem}` : 'Email about the call'} />
          </span>
        )}
      </section>

      <div className="stack">
        <p className="small m0">
          <strong>Last contact:</strong>{' '}
          {lastContact ? `${lastContact.text}, ${day(ymd(new Date(lastContact.at)))}` : log[0] ? `none logged yet. Latest activity: ${log[0].text}, ${day(ymd(new Date(log[0].at)))}` : 'none logged yet.'}
        </p>
      </div>

      <div className="a-split">
        <div className="a-col stack">
          <LeadFields
            projectId={p._id}
            projectType={p.projectType}
            lead={lead}
            contact={{ name, email, company, onClient: Boolean(listed), tags: tagsFor(people, email), studioHref: p.client._id ? `/studio/portal/structure/client;${encodeURIComponent(p.client._id)}` : undefined }}
          />
        </div>
        <aside className="stack a-col a-aside ld-aside" aria-label="Activity">
          <LeadActivity projectId={p._id} today={today()} entries={entries} />
          <SentEmails emails={p.office.emails ?? []} />
        </aside>
      </div>
    </div>
  )
}
