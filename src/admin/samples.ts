import { addDays, today } from './dates'
import type { OfficeProject } from './types'

/**
 * Local development only (no Sanity token): sample projects so the screens have
 * something to show. Never used in production. Dates move with today.
 */
export function sampleOfficeProjects(): OfficeProject[] {
  const t = today()
  const d = (n: number) => addDays(t, n)
  const at = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
  const client = (id: string, name: string) => ({ _id: id, organizationName: name, contacts: [{ _key: 'c1', name: '[Client contact]', email: 'client@example.com' }] })
  const base = { deliverables: [], schedule: [], milestones: {}, activity: [], crew: [] }

  return [
    {
      ...base,
      _id: 'sample-closure',
      title: 'Closure video series',
      slug: 'closure-video-series',
      status: 'in-review',
      stage: 4,
      pipelineStage: 'finalcut',
      projectType: 'brand-film',
      region: 'nwt',
      client: client('sample-imperial', 'Imperial'),
      milestones: { roughCutDue: d(-24), round1Due: d(-17), finalCutDue: d(-3), round2Due: d(0), deliveryDue: d(5) },
      schedule: [{ _key: 's1', kind: 'shoot', title: 'Shoot · Norman Wells', start: d(-41), end: d(-37), location: 'Norman Wells, NT' }],
      crew: [{ _key: 'k1', name: 'Josh Ferguson', role: 'Director, editor' }],
      deliverables: [
        { _key: 'd1', title: 'Rigging', version: 2, status: 'approved' },
        { _key: 'd2', title: 'Soil & water sampling', version: 2, status: 'changes-requested', notifiedAt: at(-3) },
        { _key: 'd3', title: 'Turbine removal', version: 2, status: 'awaiting-feedback', notifiedAt: at(-3) },
        { _key: 'd4', title: 'Air gapping', version: 2, status: 'approved' },
      ],
      activity: [
        { _key: 'a1', at: at(-1), text: 'Comments on Soil & water sampling v2', kind: 'comment' },
        { _key: 'a2', at: at(-17), text: 'Round 1 notes received', kind: 'comment' },
      ],
      office: {
        _id: 'bo-state-sample-closure',
        stageChangedAt: at(-3),
        invoices: [{ _key: 'i1', kind: 'deposit', id: 'sample-inv', number: 'INV-0001', amount: 0, status: 'paid', outstanding: 0, createdAt: at(-60) }],
        log: [{ _key: 'l1', at: at(-3), text: 'Moved to Final cut', kind: 'stage' }],
        notes: [{ _key: 'n1', at: at(-2), text: 'Client wants the turbine short under 2 minutes.' }],
      },
    },
    {
      ...base,
      _id: 'sample-northwright',
      title: 'October retainer content',
      slug: 'north-wright-october',
      status: 'delivered',
      pipelineStage: 'delivered',
      projectType: 'retainer',
      region: 'nwt',
      retainer: { allowance: '[Monthly allowance]' },
      client: client('sample-nwa', 'North-Wright Airways'),
      milestones: { deliveryDue: d(-3) },
      office: { _id: 'bo-state-sample-northwright', stageChangedAt: at(-3) },
    },
    {
      ...base,
      _id: 'sample-caribou',
      title: 'Redstone caribou survey',
      slug: 'redstone-caribou',
      status: 'in-production',
      pipelineStage: 'shoot',
      projectType: 'documentary',
      region: 'nwt',
      client: client('sample-gnwt', 'GNWT'),
      milestones: { roughCutDue: d(3), round1Due: d(10), deliveryDue: d(30) },
      office: { _id: 'bo-state-sample-caribou', stageChangedAt: at(-12) },
    },
    {
      ...base,
      _id: 'sample-mgmt',
      title: 'Management plans explainer',
      slug: 'management-plans',
      status: 'in-review',
      pipelineStage: 'roughcut',
      projectType: 'brand-film',
      region: 'nwt',
      client: client('sample-imperial', 'Imperial'),
      milestones: { round1Due: d(2), deliveryDue: d(21) },
      deliverables: [{ _key: 'm1', title: 'Explainer', version: 1, status: 'awaiting-feedback', notifiedAt: at(-6) }],
      office: { _id: 'bo-state-sample-mgmt', stageChangedAt: at(-6) },
    },
    {
      ...base,
      _id: 'sample-canoe',
      title: '[Project name]',
      pipelineStage: 'quoted',
      projectType: 'social',
      region: 'nwt',
      client: client('sample-canoe', 'Canoe North Adventures'),
      office: { _id: 'bo-state-sample-canoe', stageChangedAt: at(-9) },
    },
    {
      ...base,
      _id: 'sample-nwa-nov',
      title: 'November content',
      pipelineStage: 'preproduction',
      projectType: 'retainer',
      region: 'nwt',
      client: client('sample-nwa', 'North-Wright Airways'),
      schedule: [
        { _key: 'x1', kind: 'travel', title: 'Edmonton → Norman Wells', start: d(4) },
        { _key: 'x2', kind: 'shoot', title: 'Shoot', start: d(5) },
        { _key: 'x3', kind: 'travel', title: 'Norman Wells → Edmonton', start: d(6) },
      ],
      office: { _id: 'bo-state-sample-nwa-nov', stageChangedAt: at(-5) },
    },
    {
      ...base,
      _id: 'sample-alberta',
      title: 'Brand film',
      pipelineStage: 'lead',
      projectType: 'brand-film',
      region: 'alberta',
      client: client('sample-ab', '[Alberta client]'),
      schedule: [{ _key: 'y1', kind: 'meeting', title: 'Kickoff call', start: d(1), time: '10:00' }],
      office: { _id: 'bo-state-sample-alberta', stageChangedAt: at(-1) },
    },
  ] as OfficeProject[]
}
