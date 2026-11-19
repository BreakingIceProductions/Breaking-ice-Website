/** Plain constants shared by the Studio schema and the server. No imports, so the server never loads the Studio. */

/**
 * The pipeline, left to right: sales, then production. The stored values are
 * the original ones (projects in the dataset keep working); only the titles
 * changed, and `call` and `proposal` were added.
 */
export const PIPELINE_STAGES = [
  { title: 'New lead', value: 'lead', group: 'sales', hint: 'Reply and send a call link' },
  { title: 'Call booked', value: 'call', group: 'sales', hint: 'Discovery call on the calendar' },
  { title: 'Proposal to write', value: 'proposal', group: 'sales', hint: 'Call done, quote to write' },
  { title: 'Proposal out', value: 'quoted', group: 'sales', hint: 'Out with them' },
  { title: 'Onboarding', value: 'booked', group: 'production', hint: 'Contract, deposit, welcome, kickoff' },
  { title: 'Pre-production', value: 'preproduction', group: 'production', hint: 'Brief, script, shoot locked' },
  { title: 'Filming', value: 'shoot', group: 'production', hint: 'On set' },
  { title: 'Editing', value: 'roughcut', group: 'production', hint: 'First cut' },
  { title: 'Revisions', value: 'finalcut', group: 'production', hint: 'Notes in, changes out' },
  { title: 'Final delivery', value: 'delivered', group: 'production', hint: 'Finals and final invoice' },
  { title: 'Closed', value: 'paid', group: 'production', hint: 'Paid and wrapped' },
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]['value']
export type PipelineGroup = (typeof PIPELINE_STAGES)[number]['group']

/** Stages a client can't see in the portal yet: everything before the job is booked. */
export const PRE_PORTAL_STAGES: PipelineStage[] = ['lead', 'call', 'proposal', 'quoted']

export const PROJECT_TYPES = [
  { title: 'Brand / organizational film', value: 'brand-film' },
  { title: 'Documentary', value: 'documentary' },
  { title: 'Social content', value: 'social' },
  { title: 'Event coverage', value: 'event' },
  { title: 'Retainer', value: 'retainer' },
  { title: 'Photography', value: 'photo' },
  { title: 'Other', value: 'other' },
]

export const REGIONS = [
  { title: 'Alberta', value: 'alberta' },
  { title: 'Northwest Territories', value: 'nwt' },
  { title: 'Elsewhere', value: 'other' },
]

export const SCHEDULE_KINDS = [
  { title: 'Shoot', value: 'shoot' },
  { title: 'Travel', value: 'travel' },
  { title: 'Meeting', value: 'meeting' },
  { title: 'Other', value: 'other' },
]
