import 'server-only'
import type { OfficeProject } from './types'
import type { RequestRow, SendProject, SendTemplate } from './ui/sign-requests'
import { KIND, sendable, type DocTemplate, type SignRequest } from '@/portal/sign-docs'
import { signerUrl } from '@/portal/sign-service'

/** Light shapes for the back office's client components: what each list and form needs, no more. */

/** `known`: project ids that exist, so a link never leads nowhere. */
export const requestRow = (r: SignRequest, known?: Set<string>): RequestRow => {
  return {
    id: r._id,
    title: r.snapshot.title,
    signer: r.signature?.name && r.signature.name !== r.recipient.name ? `${r.signature.name} (sent to ${r.recipient.name})` : r.recipient.name,
    email: r.recipient.email,
    audience: r.audience,
    project: r.projectTitle,
    projectHref: r.projectId && (!known || known.has(r.projectId)) ? `/admin/projects/${encodeURIComponent(r.projectId)}?tab=documents` : undefined,
    status: r.status,
    createdAt: r.createdAt,
    emailedAt: r.emailedAt,
    viewedAt: r.viewedAt,
    signedAt: r.signedAt,
    voidedAt: r.voidedAt,
    link: signerUrl(r),
    viewHref: `/sign/${r.token}?owner=1`,
    pdfHref: r.signature ? `/api/admin/library/pdf?request=${encodeURIComponent(r._id)}` : undefined,
  }
}

export const sendTemplates = (ts: DocTemplate[]): SendTemplate[] =>
  ts.filter(sendable).map((t) => ({ id: t._id, title: t.title, audience: t.audience, body: t.body, fields: t.fields, projectOptional: Boolean(KIND[t.kind].projectOptional) }))

export const sendProjects = (ps: OfficeProject[]): SendProject[] =>
  ps
    .filter((p) => !p.archived)
    .map((p) => ({
      id: p._id,
      title: p.title,
      org: p.client.organizationName,
      hasClient: Boolean(p.client._id),
      contacts: (p.client.contacts ?? []).filter((c) => c.email).map((c) => ({ key: c._key, name: c.name, email: c.email })),
    }))

/** Out and signed, for the Today and Client portals counts. */
export function signCounts(rs: SignRequest[], now = Date.now()) {
  const since = new Date(now - 14 * 86_400_000).toISOString()
  const out = rs.filter((r) => r.status === 'out' || r.status === 'viewed')
  const signed = rs.filter((r) => r.status === 'signed' && (r.signedAt ?? '') >= since)
  return { out, signed }
}
