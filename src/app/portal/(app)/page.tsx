import { Suspense } from 'react'
import { requireAccess } from '@/portal/current'
import { getPortalSettings } from '@/portal/data'
import { fill } from '@/portal/email'
import { PortalLibrary } from '@/portal/portal-library'
import { EmptyMark } from '@/portal/ui'

export const metadata = { title: 'Your projects' }

export default async function Dashboard() {
  const { session, clients, projects, name } = await requireAccess()
  const ps = await getPortalSettings()
  const org = clients.map((c) => c.organizationName).join(' · ')
  const me = clients.flatMap((c) => c.contacts).find((c) => c.email.toLowerCase() === session.email)

  if (!clients.length) {
    return (
      <div className="wrap p-empty-page">
        <EmptyMark />
        <h1 className="h2">There’s nothing here for this email</h1>
        <p className="muted">You’re signed in as {session.email}, but it isn’t on a project with us any more. If that seems wrong, reply to any of our emails and we’ll sort it out.</p>
        <form action="/api/portal/sign-out" method="post"><button className="btn btn-secondary" type="submit">Sign in with a different email</button></form>
      </div>
    )
  }

  return (
    <div className="wrap p-dash p-lib">
      <section className="p-hello">
        <span className="eyebrow">{org}</span>
        <h1 className="h2">{fill(ps.dashboardGreeting, { name: name ?? 'there' })}</h1>
      </section>
      <Suspense>
        <PortalLibrary
          projects={projects}
          clients={clients.map((c) => ({ _id: c._id, organizationName: c.organizationName }))}
          demo={Boolean(session.demo)}
          uploaderName={me?.name ?? ''}
        />
      </Suspense>
    </div>
  )
}
