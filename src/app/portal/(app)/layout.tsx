import { requireAccess } from '@/portal/current'
import { PortalFooter, PortalHeader } from '@/portal/ui'

export const dynamic = 'force-dynamic'

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const { session, name, quotes, clients } = await requireAccess()
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <PortalHeader name={name} demo={session.demo} quotes={quotes.length} previewOf={session.preview ? clients[0]?.organizationName ?? 'the client' : undefined} />
      <main id="main" className="p-main">{children}</main>
      <PortalFooter />
    </>
  )
}
