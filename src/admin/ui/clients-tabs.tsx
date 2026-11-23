import { PendingLink } from './pending-link'

/**
 * The "Clients | People" switch in the header of /admin/clients and /admin/contacts, the same pill as Money | Reports.
 * Both pages keep their own route; the sidebar shows them as one "Clients" item.
 */
export function ClientsTabs({ on }: { on: 'clients' | 'people' }) {
  return (
    <nav className="pj-tabs sc-ctabs" aria-label="Clients views">
      <PendingLink href="/admin/clients" aria-current={on === 'clients' ? 'page' : undefined}>Clients</PendingLink>
      <PendingLink href="/admin/contacts" aria-current={on === 'people' ? 'page' : undefined}>People</PendingLink>
    </nav>
  )
}
