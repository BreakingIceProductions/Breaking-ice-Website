import type { PortalPayment } from '@/portal/types'
import type { OfficeProject, OfficeState } from './types'

/**
 * Local development only (no Sanity token): the history the Money page reads, so its
 * figures and charts have something to show. Never used in production. Dates move with today.
 *
 * `withSampleMoney` adds stage history, quote totals and invoices to the sample projects in
 * samples.ts; `sampleMoneyExtras` adds a few finished and lost ones; `sampleOfficePayments`
 * stands in for the portal payment records.
 */

const at = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

/** Stage moves as [stage, days from today] pairs, oldest first. */
const history = (...moves: [string, number][]): OfficeState['stageHistory'] =>
  moves.map(([to, n], i) => ({ _key: `h${i}`, at: at(n), to, ...(i > 0 && { from: moves[i - 1][0] }) }))

type Extra = Partial<Omit<OfficeProject, 'office'>> & { office?: Partial<OfficeState> }

const EXTRA: Record<string, () => Extra> = {
  'sample-closure': () => ({
    quoteAmount: 48000,
    depositAmount: 24000,
    office: {
      lead: { source: 'repeat' },
      stageHistory: history(['lead', -95], ['quoted', -75], ['booked', -62], ['finalcut', -3]),
      invoices: [{ _key: 'i1', kind: 'deposit', id: 'sample-inv', number: 'INV-0001', amount: 24000, status: 'paid', outstanding: 0, createdAt: at(-60), syncedAt: at(-58) }],
    },
  }),
  'sample-northwright': () => ({
    office: {
      lead: { source: 'repeat' },
      stageHistory: history(['lead', -40], ['booked', -35], ['delivered', -3]),
      invoices: [{ _key: 'i1', kind: 'retainer', id: 'sample-inv-3', number: 'INV-0003', amount: 4500, status: 'sent', outstanding: 4725, createdAt: at(-3) }],
    },
  }),
  'sample-caribou': () => ({
    quoteAmount: 32000,
    depositAmount: 16000,
    office: { lead: { source: 'referral' }, stageHistory: history(['lead', -70], ['call', -66], ['proposal', -60], ['quoted', -52], ['booked', -30], ['shoot', -12]) },
  }),
  'sample-mgmt': () => ({
    quoteAmount: 26000,
    depositAmount: 13000,
    office: { lead: { source: 'repeat' }, stageHistory: history(['lead', -120], ['quoted', -100], ['booked', -90], ['roughcut', -6]) },
  }),
  'sample-canoe': () => ({ quoteAmount: 8500, office: { stageHistory: history(['lead', -20], ['call', -16], ['proposal', -12], ['quoted', -9]) } }),
  'sample-nwa-nov': () => ({ office: { lead: { source: 'repeat' }, stageHistory: history(['lead', -8], ['booked', -6], ['preproduction', -5]) } }),
  'sample-alberta': () => ({ office: { stageHistory: history(['lead', -1]) } }),
  'sample-call': () => ({ office: { stageHistory: history(['lead', -6], ['call', -2]) } }),
  'sample-proposal': () => ({ office: { stageHistory: history(['lead', -15], ['call', -11], ['proposal', -6]) } }),
  'sample-onboarding': () => ({
    office: {
      lead: { source: 'google' },
      stageHistory: history(['lead', -30], ['call', -25], ['proposal', -20], ['quoted', -14], ['booked', -4]),
      invoices: [{ _key: 'i1', kind: 'deposit', id: 'sample-inv-2', number: 'INV-0002', amount: 6000, status: 'sent', outstanding: 6300, createdAt: at(-4) }],
    },
  }),
}

/** A sample project with its money history added. Lead details already on the sample are kept. */
export function withSampleMoney(p: OfficeProject): OfficeProject {
  const { office, ...rest } = EXTRA[p._id]?.() ?? {}
  return { ...p, ...rest, office: { ...p.office, ...office, lead: { ...office?.lead, ...p.office.lead } } }
}

/** Finished and lost work, so last year, the funnel and the outcomes aren't empty. */
export function sampleMoneyExtras(): OfficeProject[] {
  const client = (id: string, name: string) => ({ _id: id, organizationName: name, contacts: [{ _key: 'c1', name: '[Client contact]', email: `${id.replace(/^sample-/, '')}@example.com` }] })
  const base = { deliverables: [], schedule: [], milestones: {}, activity: [], crew: [], region: 'alberta' }
  const office = (id: string, lastMove: number, more: Partial<OfficeState>): OfficeState => ({ _id: `bo-state-${id}`, stageChangedAt: at(lastMove), ...more })
  return [
    {
      ...base,
      _id: 'sample-tourism',
      title: 'Tourism season film',
      slug: 'tourism-season-film',
      status: 'delivered',
      pipelineStage: 'paid',
      projectType: 'brand-film',
      quoteAmount: 22000,
      depositAmount: 11000,
      client: client('sample-tourism-co', '[Tourism client]'),
      office: office('sample-tourism', -120, { lead: { source: 'google' }, stageHistory: history(['lead', -240], ['call', -235], ['proposal', -230], ['quoted', -222], ['booked', -210], ['delivered', -130], ['paid', -120]) }),
    },
    {
      ...base,
      _id: 'sample-conference',
      title: 'Conference recap',
      slug: 'conference-recap',
      status: 'delivered',
      pipelineStage: 'paid',
      archived: true,
      projectType: 'event',
      region: 'nwt',
      quoteAmount: 9000,
      depositAmount: 4500,
      client: client('sample-gnwt', 'GNWT'),
      office: office('sample-conference', -340, {
        lead: { source: 'referral' },
        stageHistory: history(['lead', -400], ['quoted', -392], ['booked', -385], ['delivered', -345], ['paid', -340]),
        invoices: [
          { _key: 'i1', kind: 'deposit', id: 'sample-inv-4', number: 'INV-0004', amount: 4500, status: 'paid', outstanding: 0, createdAt: at(-385), syncedAt: at(-383) },
          { _key: 'i2', kind: 'final', id: 'sample-inv-5', number: 'INV-0005', amount: 4500, status: 'paid', outstanding: 0, createdAt: at(-345), syncedAt: at(-338) },
        ],
      }),
    },
    {
      ...base,
      _id: 'sample-recruit',
      title: 'Recruitment video',
      pipelineStage: 'quoted',
      archived: true,
      declinedAt: at(-50),
      projectType: 'brand-film',
      quoteAmount: 15000,
      client: client('sample-recruit-co', '[Energy client]'),
      office: office('sample-recruit', -64, { lead: { source: 'linkedin', lostReason: 'lost' }, stageHistory: history(['lead', -80], ['call', -76], ['proposal', -70], ['quoted', -64]) }),
    },
    {
      ...base,
      _id: 'sample-teaser',
      title: 'Product launch teaser',
      pipelineStage: 'call',
      archived: true,
      declinedAt: at(-33),
      projectType: 'social',
      client: client('sample-teaser-co', '[Retail client]'),
      office: office('sample-teaser', -41, { lead: { source: 'social', lostReason: 'no-show' }, stageHistory: history(['lead', -45], ['call', -41]) }),
    },
    {
      ...base,
      _id: 'sample-wedding',
      title: 'Wedding film',
      pipelineStage: 'lead',
      archived: true,
      declinedAt: at(-150),
      projectType: 'other',
      client: client('sample-wedding-co', '[Private client]'),
      office: office('sample-wedding', -152, { lead: { source: 'google', lostReason: 'not-a-fit' }, stageHistory: history(['lead', -152]) }),
    },
    {
      ...base,
      _id: 'sample-photos',
      title: 'Staff photos',
      pipelineStage: 'lead',
      archived: true,
      projectType: 'photo',
      client: client('sample-photos-co', '[Clinic client]'),
      office: office('sample-photos', -200, { lead: { source: 'other', lostReason: 'archive' }, stageHistory: history(['lead', -200]) }),
    },
  ] as OfficeProject[]
}

/** Portal payment records for the sample projects: deposits and balances, and how each was paid. */
export function sampleOfficePayments(): PortalPayment[] {
  const pay = (id: string, projectId: string, clientId: string, projectTitle: string, kind: PortalPayment['kind'], amount: number, asked: number, rest: Partial<PortalPayment>): PortalPayment => ({
    _id: id,
    projectId,
    clientId,
    projectTitle,
    kind,
    label: kind === 'deposit' ? 'Deposit' : kind === 'balance' ? 'Balance' : 'Milestone payment',
    amount,
    gst: amount * 0.05,
    total: amount * 1.05,
    status: 'paid',
    createdAt: at(asked),
    ...rest,
  })
  return [
    pay('sample-pay-caribou', 'sample-caribou', 'sample-gnwt', 'Redstone caribou survey', 'deposit', 16000, -14, { paidAt: at(-12), method: 'etransfer' }),
    pay('sample-pay-mgmt', 'sample-mgmt', 'sample-imperial', 'Management plans explainer', 'deposit', 13000, -90, { paidAt: at(-88), method: 'eft' }),
    pay('sample-pay-mgmt-2', 'sample-mgmt', 'sample-imperial', 'Management plans explainer', 'other', 6500, -2, { status: 'processing', method: 'etransfer' }),
    pay('sample-pay-tourism', 'sample-tourism', 'sample-tourism-co', 'Tourism season film', 'deposit', 11000, -210, { paidAt: at(-208), method: 'card', cardFee: 330, cardFeeGst: 16.5 }),
    pay('sample-pay-tourism-2', 'sample-tourism', 'sample-tourism-co', 'Tourism season film', 'balance', 11000, -130, { paidAt: at(-125), method: 'etransfer' }),
  ]
}

/** Goals shown in sample mode. Saving the form changes nothing here. */
export const SAMPLE_GOALS = { signedYear: 180000, collectedYear: 150000, leadsMonth: 6, winRate: 60 }
