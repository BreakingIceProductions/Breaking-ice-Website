import 'server-only'
import { SITE_URL } from '@/lib/site'
import { finalsSection, paymentSection, portalSignInSection, quoteSection, signSection, versionSection, type EmailSection } from '@/portal/email'
import { groupDeliverables, isLatest, versionLabel } from '@/portal/library'
import { paymentsForProject } from '@/portal/payments'
import { listRequests } from '@/portal/sign-store'
import type { Deliverable, PortalPayment } from '@/portal/types'
import { blockTokens, inlineTokens, tokenFor, type BlockOption } from './email-blocks-shared'
import type { OfficeProject } from './types'

/**
 * The portal blocks a project can offer the composer, each with its branded section, built only from
 * what's stored: the project, its quote, its sign requests and its payment records. Nothing is typed in
 * and nothing is worked out. A block is offered only when its data exists.
 *
 * Buttons go to plain portal addresses. The client signs in there if they need to (a sign-in code by
 * email), so no address or code is ever put in a link.
 */

type Block = { option: BlockOption; section: EmailSection }

const portal = (path = '') => `${SITE_URL}/portal${path}`
const dateLabel = (d?: string) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : undefined
const longDate = (d?: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { dateStyle: 'long', timeZone: 'UTC' }) : undefined)
const cad = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** Payment record ids and invoice keys go into tokens, so only plain characters are allowed. */
const safeId = (s: string) => (/^[\w.-]{1,80}$/.test(s) ? s : '')

const STATUS: Record<Deliverable['status'], string> = { 'in-progress': 'In progress', 'awaiting-feedback': 'With the client', 'changes-requested': 'Changes asked for', approved: 'Approved' }

export async function projectBlocks(p: OfficeProject): Promise<Block[]> {
  const blocks: Block[] = []
  const projectPage = p.slug ? portal(`/${p.slug}`) : portal()
  const shown = !p.hiddenFromClient

  // Sign in: always there.
  blocks.push({
    option: { token: tokenFor('portal'), kind: 'portal', label: 'Portal sign-in', detail: 'A “Sign in to your portal” button' },
    section: portalSignInSection({ projectTitle: shown ? p.title : undefined, portalUrl: portal() }),
  })

  // New version ready: the latest version of each deliverable the client can see.
  if (shown) {
    for (const d of p.deliverables) {
      if (!d.title || d.status === 'in-progress' || !isLatest(d, p.deliverables) || !safeId(d._key)) continue
      blocks.push({
        option: { token: tokenFor('version', d._key), kind: 'version', label: `${d.title} · ${versionLabel(d)}`, detail: STATUS[d.status] },
        section: versionSection({
          title: d.title,
          version: d.version || 1,
          length: d.vimeoLength ?? d.length,
          due: dateLabel(d.feedbackDue),
          thumbUrl: d.thumbUrl ?? d.vimeoThumb,
          portalUrl: portal(`?open=${encodeURIComponent(d._key)}`),
          shareUrl: d.host === 'r2' ? undefined : d.shareUrl,
        }),
      })
    }
  }

  // Quote ready: only once it's been shared in the portal, and not after it's signed.
  const q = p.quote
  if (q && (q.sharedAt || q.lastSentAt) && !q.signature) {
    const from = Boolean(q.options?.length)
    const total = from ? Math.min(...q.options!.map((o) => o.total)) : p.quoteAmount
    const validUntil = longDate(q.validUntil)
    blocks.push({
      option: { token: tokenFor('quote'), kind: 'quote', label: 'Quote ready', detail: [total ? `${from ? 'From ' : ''}${cad(total)}` : '', validUntil ? `valid until ${validUntil}` : ''].filter(Boolean).join(', ') || undefined },
      section: quoteSection({ projectTitle: p.title, total, from, noGst: Boolean(p.client.noGst), validUntil, portalUrl: p.slug ? portal(`/quotes/${p.slug}`) : portal('/quotes') }),
    })
  }

  // Documents to sign: the client's documents still out in the portal (releases and crew papers have their own private links, so they're left out).
  if (p.client._id) {
    const open = (await listRequests({ clientIds: [p.client._id] }).catch(() => [])).filter((r) => r.audience === 'client' && (r.status === 'out' || r.status === 'viewed'))
    if (open.length) {
      const titles = open.map((r) => r.snapshot.title)
      blocks.push({
        option: { token: tokenFor('sign'), kind: 'sign', label: 'Documents to sign', detail: titles.join(', ') },
        section: signSection({ titles, portalUrl: open.length === 1 ? portal(`/documents/${encodeURIComponent(open[0]._id)}`) : portal() }),
      })
    }
  }

  // Final files ready: once it's delivered or a final is out.
  if (shown) {
    const finals = groupDeliverables(p.deliverables).video.map((g) => g.latest).filter((d) => d.final)
    if (p.status === 'delivered' || finals.length) {
      blocks.push({
        option: { token: tokenFor('finals'), kind: 'finals', label: 'Final files ready', detail: finals.map((d) => d.title).join(', ') || undefined },
        section: finalsSection({ projectTitle: p.title, films: finals.map((d) => `${d.title} · Final`), thumbUrl: finals[0]?.thumbUrl ?? finals[0]?.vimeoThumb, portalUrl: projectPage }),
      })
    }
  }

  // Payments: portal payment records first, then Zoho Books invoices that aren't already one of those.
  if (shown) {
    const billing = p.slug ? portal(`/${p.slug}#billing`) : portal()
    const pays: PortalPayment[] = p._id.startsWith('sample-') ? [] : await paymentsForProject(p._id).catch(() => [])
    for (const pay of pays) {
      if (pay.status === 'canceled' || !safeId(pay._id)) continue
      const status = pay.status
      blocks.push({
        option: { token: tokenFor('payment', pay._id), kind: 'payment', label: `${status === 'due' ? 'Payment due' : status === 'processing' ? 'Payment started' : 'Payment received'}: ${pay.label}`, detail: cad(pay.total) },
        section: paymentSection({ label: pay.label, projectTitle: p.title, status, total: pay.total, portalUrl: billing, payInPortal: true }),
      })
    }
    const linked = new Set(pays.map((x) => x.zohoInvoiceId).filter(Boolean))
    for (const inv of p.office.invoices ?? []) {
      const st = inv.status ?? ''
      if (linked.has(inv.id) || !safeId(inv._key) || ['draft', 'void', 'deleted'].includes(st)) continue
      const paid = st === 'paid'
      const label = `${inv.kind[0].toUpperCase()}${inv.kind.slice(1)} invoice${inv.number ? ` ${inv.number}` : ''}`
      // Zoho's own balance is the only amount shown for an open invoice; a paid one shows none.
      const total = paid ? undefined : inv.outstanding
      blocks.push({
        option: { token: tokenFor('payment', `inv-${inv._key}`), kind: 'payment', label: `${paid ? 'Payment received' : 'Payment due'}: ${label}`, detail: total ? `${cad(total)} outstanding` : undefined },
        section: paymentSection({ label, projectTitle: p.title, status: paid ? 'paid' : 'due', total, portalUrl: billing, payInPortal: Boolean(p.client.portalPayments) }),
      })
    }
  }

  return blocks
}

/** The composer's list for a project: just the labels. */
export async function blockOptions(p: OfficeProject): Promise<BlockOption[]> {
  return (await projectBlocks(p).catch((e) => {
    console.error('[admin] portal blocks failed', e)
    return []
  })).map((b) => b.option)
}

/**
 * Swaps every token in an email body for its section, for the preview or the send.
 * A token that isn't on its own line, or that this project can't fill (a version since replaced,
 * a quote that's been signed), is an error: it's never sent as raw text.
 */
export async function resolveBlocks(p: OfficeProject | null, body: string): Promise<{ sections?: Record<string, EmailSection>; error?: string }> {
  const tokens = blockTokens(body)
  if (!tokens.length) return {}
  if (!p) return { error: 'Portal blocks need a project. Remove the [[block:…]] lines, or write this from a lead or project page.' }
  const inline = inlineTokens(body)
  if (inline.length) return { error: `Put ${inline.join(', ')} on a line of its own.` }
  const blocks = await projectBlocks(p)
  const byToken = new Map(blocks.map((b) => [b.option.token, b.section]))
  const missing = tokens.filter((t) => !byToken.has(t))
  if (missing.length) return { error: `${missing.join(', ')} ${missing.length === 1 ? 'isn’t' : 'aren’t'} in this project’s portal any more (or never was). Remove ${missing.length === 1 ? 'it' : 'them'}, or add the block again from the list.` }
  return { sections: Object.fromEntries(tokens.map((t) => [t, byToken.get(t)!])) }
}
