/** Plain constants shared by the Studio schema and the server. No imports, so the server never loads the Studio. */

export const PIPELINE_STAGES = [
  { title: 'Lead', value: 'lead' },
  { title: 'Quoted', value: 'quoted' },
  { title: 'Booked', value: 'booked' },
  { title: 'Pre-production', value: 'preproduction' },
  { title: 'Shoot', value: 'shoot' },
  { title: 'Rough cut', value: 'roughcut' },
  { title: 'Final cut', value: 'finalcut' },
  { title: 'Delivered', value: 'delivered' },
  { title: 'Paid', value: 'paid' },
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]['value']

/** Stages a client can't see in the portal yet. */
export const PRE_PORTAL_STAGES: PipelineStage[] = ['lead', 'quoted']

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
