import Link from 'next/link'
import '../../../../css/admin-pages.css'
import '../../../../css/admin-simple-a.css'
import '../../../../css/admin-simple-b.css'
import '../../../../css/admin-simple-c.css'
import '../../../../css/admin-emails.css'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/admin/auth'
import { Breadcrumb } from '@/admin/ui/breadcrumb'
import { quoteStatus } from '@/admin/board-data'
import { getProject } from '@/admin/data'
import { googleOAuthReady } from '@/admin/config'
import { blockTokens } from '@/admin/email-blocks-shared'
import { composerSetup, getEmailTemplates } from '@/admin/email-templates'
import { mailState } from '@/admin/gmail'
import { getPortalSettings } from '@/portal/data'
import { r2Ready } from '@/portal/r2'
import { daysSince, today, TZ, ymd, fmtDate } from '@/admin/dates'
import { budgetTitle, fmtTime, isContactLog, isSalesStage, LOST_REASONS, typeTitle } from '@/admin/lead'
import { getPeople } from '@/admin/people'
import { tagsFor } from '@/admin/people-shared'
import { emailTrack } from '@/admin/email-templates-shared'
import { EmailComposer } from '@/admin/ui/email'
import { ClientThread } from '@/admin/ui/emails'
import { HelpTip } from '@/admin/ui/help-tip'
import { LeadActions, LeadActivity, LeadArchive, LeadFields, LeadSteps, type LeadLogEntry } from '@/admin/ui/lead'
import { Chip } from '@/admin/ui/viz'
import { DaysChip } from '@/admin/ui/viz-c'

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

/**
 * One lead, and the place to talk to them: where they are and what's next, one row of actions (Reply, Log a call,
 * the quote, Start onboarding, Mark lost), their emails as a thread with a reply box, then their details and every
 * contact so far. Booked projects have the project page.
 */
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
  // Their emails, from Gmail, as on the Emails page. Owner only, like that page.
  const threadOn = !admin.viewOnly && Boolean(p.client._id)
  const [mail, templates, settings] = threadOn
    ? await Promise.all([mailState(), getEmailTemplates().catch(() => ({ templates: [] })), getPortalSettings().catch(() => null)])
    : [null, { templates: [] }, null]

  const log = [...(p.office.log ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  // One communications timeline: the log, plus each email sent from the composer with its open status.
  // The composer also logs "Emailed: <subject>"; that line is dropped when its sent record is shown instead.
  const sent = p.office.emails ?? []
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 5 * 60_000
  const shownAsEmail = (l: (typeof log)[number]) => l.kind === 'email' && sent.some((e) => near(e.at, l.at) && l.text === `Emailed: ${e.subject}`.slice(0, 240))
  const when = (iso: string) => `${day(ymd(new Date(iso)))} at ${clock(iso)}`
  const entries: LeadLogEntry[] = [
    ...log.filter((l) => !shownAsEmail(l)).map((l) => ({ at: l.at, key: l._key, date: day(ymd(new Date(l.at))), time: l.day ? undefined : clock(l.at), text: l.text })),
    ...sent.map((e) => ({ at: e.at, key: `e-${e._key}`, date: day(ymd(new Date(e.at))), time: clock(e.at), text: e.subject, email: { to: e.to.join(', '), body: e.body || undefined, track: emailTrack(e, when) } })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const lastContact = log.find((l) => isContactLog(l.kind))
  const moved = daysSince(p.office.stageChangedAt)
  const quote = quoteStatus(p)

  const next = {
    lead: { title: 'Reply and send a call link', detail: email ? `Write to ${email} with a time to talk.` : 'Add their email, then write with a time to talk.' },
    call: { title: 'Have the call', detail: lead.callDate ? `${day(lead.callDate)}${lead.callTime ? ` at ${fmtTime(lead.callTime)}` : ''}` : 'No call time set yet. Add it under The project.' },
    proposal: { title: 'Write the quote', detail: quote ?? 'Call done. Price it up while it’s fresh.' },
    quoted: { title: 'Follow up on the quote', detail: quote ?? 'No quote has gone out through the portal yet.' },
  }[p.pipelineStage as 'lead' | 'call' | 'proposal' | 'quoted']
  // The full line for hover and screen readers; the chip shows the date only.
  const lastContactText = lastContact ? `Last contact: ${lastContact.text}, ${day(ymd(new Date(lastContact.at)))}` : log[0] ? `No contact logged yet. Latest activity: ${log[0].text}, ${day(ymd(new Date(log[0].at)))}` : 'No contact logged yet'
  const reason = LOST_REASONS.find((r) => r.value === lead.lostReason)?.title
  // The quote step: build one, send the one that's drafted, or open the one that's out.
  const quoteAction = p.quote?.sharedAt
    ? { label: 'Open the quote', href: `${projectPage}?tab=documents` }
    : p.quote
      ? { label: 'Send quote', href: `${projectPage}?tab=documents`, primary: true }
      : { label: 'Build quote', href: '/admin/proposals/new', primary: p.pipelineStage === 'proposal' }

  return (
    <div className="a-page">
      <Breadcrumb trail={[{ label: 'Leads & Quotes', href: '/admin/leads' }]} />

      <header className="a-head">
        <div className="stack ap-gap-2 ap-minw0">
          <h1 className="a-h1">{title}</h1>
          <ul className="sc-chips" aria-label="About this lead">
            <li className="sa-chip">{company}</li>
            {typeTitle(p.projectType) && <li className="sa-chip">{typeTitle(p.projectType)}</li>}
            {budgetTitle(lead.budget) && <li className="sa-chip"><span className="sr-only">Budget </span>{budgetTitle(lead.budget)}</li>}
          </ul>
        </div>
        <div className="btn-row">
          <Link className="text-link small" href={projectPage}>Open project page</Link>
        </div>
      </header>

      {!p.archived && (
        <LeadActions projectId={p._id} projectTitle={p.title} canReply={threadOn} quote={quoteAction}>
          {/* Site emails from a template (with open tracking); ?email=1 opens it, as from a board card. */}
          {compose && <EmailComposer key={sp.email === '1' ? 'open' : 'closed'} projectId={p._id} {...compose} startOpen={sp.email === '1'} label={threadOn ? 'Email from a template' : `Write to ${callThem}`} />}
          <LeadArchive projectId={p._id} name={title} label="Mark lost" />
        </LeadActions>
      )}

      {p.archived && (
        <div className="sc-chips" role="status">
          <Chip tone="muted" label={`Archived${reason ? `: ${reason}` : ''}`}>Archived{reason ? ` · ${reason}` : ''}</Chip>
          <HelpTip label="About bringing a lead back">Bring them back from Won and lost on <Link className="text-link" href="/admin/leads">Leads &amp; Quotes</Link>.</HelpTip>
        </div>
      )}

      <section className="p-card ld-stage" aria-label="Where they are">
        <LeadSteps projectId={p._id} projectTitle={p.title} stage={p.pipelineStage} quoteSent={Boolean(p.quote?.sharedAt)} />
      </section>

      <section className="bd-nextup ld-nextup" aria-label="Next up">
        <div className="stack ap-tight ap-minw0">
          <span className="eyebrow">Next up</span>
          <strong className="ld-next-title">{next.title}</strong>
          {/* Before the call the detail only repeats the button ("Write to them"), so it's left to the button. */}
          <span className="small">{next.detail}</span>
          <span className="sc-chips">
            <DaysChip days={moved} />
            <span className="sa-chip sc-icon-chip" title={lastContactText}>
              <span aria-hidden="true">{lastContact ? '✆' : '○'}</span>
              <span className="sr-only">Last contact: </span>
              {lastContact ? day(ymd(new Date(lastContact.at))) : 'No contact logged'}
            </span>
          </span>
        </div>
        {/* A quote made outside the builder is uploaded on the project page's Documents tab. */}
        {p.pipelineStage === 'proposal' && !p.quote && <Link className="btn btn-secondary btn-sm" href={`${projectPage}?tab=documents`}>Upload and send a quote</Link>}
      </section>

      {threadOn && mail && (
        <section id="ld-thread" className="ld-thread stack ap-gap-2" aria-labelledby="ld-h-thread">
          <div className="a-card-head">
            <h2 id="ld-h-thread" className="a-h2">Emails with {company}</h2>
            <Link className="text-link small" href={`/admin/emails?client=${encodeURIComponent(p.client._id)}`}>Open in Emails</Link>
          </div>
          <ClientThread
            clientId={p.client._id}
            state={mail}
            templates={templates.templates.filter((t) => !blockTokens(t.body).length).map((t) => ({ key: t._key, name: t.name, subject: t.subject, body: t.body }))}
            signOff={settings?.signOff ?? ''}
            bigUploads={r2Ready() || mail === 'sample'}
            canConnect={googleOAuthReady()}
          />
        </section>
      )}

      {/* Details and Activity at equal weight, side by side; one column on a phone, or while Details is being edited. */}
      <div className="ld-pair">
        <LeadFields
          projectId={p._id}
          projectType={p.projectType}
          lead={lead}
          contact={{ name, email, company, onClient: Boolean(listed), tags: tagsFor(people, email), studioHref: p.client._id ? `/studio/portal/structure/client;${encodeURIComponent(p.client._id)}` : undefined }}
        />
        <LeadActivity simple projectId={p._id} today={today()} entries={entries} tracked={sent.length > 0} />
      </div>
    </div>
  )
}
