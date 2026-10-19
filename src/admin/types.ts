import type { PipelineStage } from '@/sanity/portal/office-constants'
import type { ActivityItem, Contact, Deliverable } from '@/portal/types'

export type ScheduleItem = {
  _key: string
  kind?: 'shoot' | 'travel' | 'meeting' | 'other'
  title: string
  start: string
  end?: string
  time?: string
  location?: string
}

export type Milestones = {
  roughCutDue?: string
  round1Due?: string
  finalCutDue?: string
  round2Due?: string
  deliveryDue?: string
}

export type InvoiceKind = 'deposit' | 'final' | 'retainer'

export type InvoiceRecord = {
  _key: string
  kind: InvoiceKind
  /** Xero InvoiceID */
  id: string
  number?: string
  amount: number
  /** Xero status, lower-cased: draft, submitted, authorised, paid, voided */
  status?: string
  outstanding?: number
  createdAt: string
  syncedAt?: string
}

export type TaskRecord = {
  _key: string
  id: string
  title: string
  /** Milestone field the due date follows (e.g. "roughCutDue"), so date changes move the task. */
  anchor?: keyof Milestones | 'stage'
  offsetDays?: number
  due?: string
}

export type OfficeState = {
  _id: string
  _rev?: string
  stageChangedAt?: string
  stageHistory?: { _key: string; at: string; from?: string; to: string }[]
  ticktickProjectId?: string
  tasks?: TaskRecord[]
  /** Calendar events this project owns, keyed by what they come from ("ms-roughCutDue", "sch-<key>"). */
  calendar?: { _key: string; eventId: string; hash: string }[]
  invoices?: InvoiceRecord[]
  notes?: { _key: string; at: string; text: string }[]
  log?: { _key: string; at: string; text: string; kind?: string }[]
}

export type OfficeClient = {
  _id: string
  organizationName: string
  contacts?: Contact[]
  billingEmail?: string
  driveFolderId?: string
}

export type OfficeProject = {
  _id: string
  _updatedAt?: string
  title: string
  slug?: string
  status?: 'in-production' | 'in-review' | 'delivered'
  stage?: number
  nextStep?: string
  deliverables: Deliverable[]
  frameioProjectUrl?: string
  driveFolderId?: string
  pipelineStage: PipelineStage
  projectType?: string
  region?: 'alberta' | 'nwt' | 'other'
  quoteAmount?: number
  depositAmount?: number
  quoteUrl?: string
  milestones: Milestones
  schedule: ScheduleItem[]
  crew?: { _key: string; name?: string; role?: string }[]
  retainer?: { monthlyFee?: number; allowance?: string }
  client: OfficeClient
  activity: ActivityItem[]
  office: OfficeState
}

/** One thing a stage change will do. Shown in the preview, then run. */
export type PlannedAction = {
  id: string
  app: 'TickTick' | 'Google Calendar' | 'Xero' | 'Client portal' | 'Back office'
  kind: 'ticktick-list' | 'ticktick-task' | 'calendar-sync' | 'calendar-done' | 'invoice' | 'portal-status' | 'stage'
  label: string
  /** Why it can't run right now (not connected, missing amount…). Shown, and skipped. */
  blocked?: string
  data?: Record<string, unknown>
}

export type StagePlan = {
  from: PipelineStage
  to: PipelineStage
  warnings: string[]
  actions: PlannedAction[]
}
