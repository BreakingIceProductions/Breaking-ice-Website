import Link from 'next/link'
import { requireAdmin } from '@/admin/auth'
import { listProjects } from '@/admin/data'
import { emailCatalog } from '@/admin/email-catalog'
import { getEmailTemplates, sampleTemplateVars } from '@/admin/email-templates'
import { fillTemplate } from '@/admin/email-templates-shared'
import { requestRow, sendProjects, signCounts } from '@/admin/sign-rows'
import { TemplatePanel, WordingChip } from '@/admin/ui/doc-library'
import { EmailTemplates } from '@/admin/ui/email'
import { RequestTable } from '@/admin/ui/sign-requests'
import { messageEmail } from '@/portal/email'
import { DOC_GROUPS, KIND, type SignRequest } from '@/portal/sign-docs'
import { listRequests, listTemplates, memoryMode } from '@/portal/sign-store'

export const metadata = { title: 'Library' }

const TABS = [
  { key: 'documents', label: 'Documents' },
  { key: 'emails', label: 'Client emails' },
  { key: 'templates', label: 'Email templates' },
  { key: 'out', label: 'Out and signed' },
] as const
type Tab = (typeof TABS)[number]['key']

const FILTERS = [
  { key: 'needs', label: 'Needs you' },
  { key: 'out', label: 'Out for signature' },
  { key: 'signed', label: 'Signed' },
  { key: 'all', label: 'Everything' },
] as const
type Filter = (typeof FILTERS)[number]['key']

/** Out a week or more and not signed: worth a nudge, or withdrawing. */
const STALE_DAYS = 7
const needsYou = (r: SignRequest, now: number) => (r.status === 'out' || r.status === 'viewed') && now - Date.parse(r.createdAt) >= STALE_DAYS * 86_400_000

type Props = { searchParams: Promise<{ tab?: string; doc?: string; show?: string }> }

/** Documents to sign (templates), the emails clients get, and everything sent for signing. */
export default async function Library({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const tab: Tab = TABS.find((t) => t.key === sp.tab)?.key ?? 'documents'

  return (
    <div className="a-page">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <h1 className="a-h1">Library</h1>
          <p className="muted" style={{ margin: 0 }}>Your documents to sign, the emails clients get, your email templates, and everything out for signature.</p>
        </div>
      </header>
      {memoryMode() && <p className="a-sample" role="status" style={{ margin: 0 }}>Sample mode: changes are kept in memory until the dev server restarts. Emails are simulated.</p>}

      <nav className="pj-tabs" aria-label="Library sections">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === 'documents' ? '/admin/library' : `/admin/library?tab=${t.key}`} scroll={false} aria-current={tab === t.key ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>

      {tab === 'documents' && <Documents doc={sp.doc} readOnly={Boolean(admin.viewOnly)} sample={Boolean(admin.sample)} />}
      {tab === 'emails' && <Emails />}
      {tab === 'templates' && <Templates readOnly={Boolean(admin.viewOnly)} sample={Boolean(admin.sample)} />}
      {tab === 'out' && <OutAndSigned show={sp.show} />}
    </div>
  )
}

async function Documents({ doc, readOnly, sample }: { doc?: string; readOnly: boolean; sample: boolean }) {
  const [templates, projects] = await Promise.all([listTemplates(), listProjects()])
  const ordered = DOC_GROUPS.flatMap((g) => templates.filter((t) => KIND[t.kind]?.group === g.key))
  const current = ordered.find((t) => t.kind === doc) ?? ordered[0]
  return (
    <div className="lb-split">
      <nav className="lb-list" aria-label="Documents">
        {DOC_GROUPS.map((g) => (
          <div key={g.key} className="lb-group">
            <h2 className="a-round-label" id={`lb-g-${g.key}`}>{g.label}</h2>
            <ul aria-labelledby={`lb-g-${g.key}`}>
              {ordered
                .filter((t) => KIND[t.kind].group === g.key)
                .map((t) => (
                  <li key={t._id}>
                    <Link href={`/admin/library?doc=${t.kind}`} scroll={false} aria-current={t._id === current?._id ? 'page' : undefined}>
                      <span>{t.title}</span>
                      <WordingChip t={t} />
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      {current ? <TemplatePanel key={current._id} template={current} projects={sendProjects(projects)} readOnly={readOnly} sample={sample} /> : <p className="muted">No documents.</p>}
    </div>
  )
}

async function Emails() {
  const emails = await emailCatalog()
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <p className="muted small" style={{ margin: 0 }}>Every email the portal sends to clients and signers, drawn from the real templates with made-up details. Read only: nothing here sends.</p>
      <ul className="lb-emails">
        {emails.map((e) => (
          <li key={e.key}>
            <details className="p-card lb-email">
              <summary>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <strong>{e.name}</strong>
                  <span className="small">Subject: {e.subject}</span>
                  <span className="muted small">{e.when}</span>
                </span>
              </summary>
              <iframe className="lb-email-frame" title={`Preview of the “${e.name}” email`} srcDoc={e.html} sandbox="" loading="lazy" />
              <details className="lb-email-text">
                <summary className="small">Plain-text version</summary>
                <pre>{e.text}</pre>
              </details>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The Email button's templates, with previews built here so they show straight away (and for view-only sign-ins). */
async function Templates({ readOnly, sample }: { readOnly: boolean; sample: boolean }) {
  const [{ templates, saved }, vars] = await Promise.all([getEmailTemplates(), sampleTemplateVars()])
  const previews = Object.fromEntries(templates.map((t) => [t._key, messageEmail({ subject: fillTemplate(t.subject, vars), body: fillTemplate(t.body, vars) }).html]))
  return <EmailTemplates templates={templates} saved={saved} previews={previews} sampleVars={vars} readOnly={readOnly} sample={sample} />
}

async function OutAndSigned({ show }: { show?: string }) {
  const [all, projects] = await Promise.all([listRequests(), listProjects()])
  const now = Date.now()
  const filter: Filter = FILTERS.find((f) => f.key === show)?.key ?? 'needs'
  const pick: Record<Filter, (r: SignRequest) => boolean> = {
    needs: (r) => needsYou(r, now),
    out: (r) => r.status === 'out' || r.status === 'viewed',
    signed: (r) => r.status === 'signed',
    all: () => true,
  }
  const rows = all.filter(pick[filter])
  const known = new Set(projects.map((p) => p._id))
  const c = signCounts(all, now)
  const counts: Record<Filter, number> = { needs: all.filter(pick.needs).length, out: c.out.length, signed: all.filter(pick.signed).length, all: all.length }
  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <nav className="a-switch" aria-label="Show">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/library?tab=out&show=${f.key}`} scroll={false} aria-current={filter === f.key ? 'page' : undefined}>
            {f.label} <span className="muted">{counts[f.key]}</span>
          </Link>
        ))}
      </nav>
      <section className="p-card" aria-label={FILTERS.find((f) => f.key === filter)!.label}>
        {filter === 'needs' && <p className="muted small" style={{ margin: 0 }}>Out {STALE_DAYS} days or more and still not signed: email them again, or void it.</p>}
        <RequestTable
          rows={rows.map((r) => requestRow(r, known))}
          empty={filter === 'needs' ? 'Nothing needs you: everything out was sent in the last week.' : filter === 'signed' ? 'Nothing signed yet.' : 'Nothing sent for signing yet. Send a document from a project’s Documents tab or from the Library.'}
        />
      </section>
    </div>
  )
}
