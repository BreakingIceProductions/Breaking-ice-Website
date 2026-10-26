export type SanityImage = { asset?: { _ref?: string } } | null | undefined

export type Producer = { name?: string; role?: string; email?: string; phone?: string; portrait?: SanityImage }

export type Contact = { _key: string; name: string; email: string; role?: string; getsEmails?: boolean }

export type PortalClient = {
  _id: string
  organizationName: string
  logo?: SanityImage
  contacts: Contact[]
  producer?: Producer
  driveFolderId?: string
}

export type DeliverableStatus = 'in-progress' | 'awaiting-feedback' | 'changes-requested' | 'approved'

export type Deliverable = {
  _key: string
  title: string
  /** video (on Vimeo) or document (a Google Drive file). Old entries without it are worked out from their links. */
  category?: 'video' | 'document'
  version: number
  /** When this version went to the client (YYYY-MM-DD). */
  date?: string
  final?: boolean
  /** Older versions are greyed out for the client unless this is on. */
  clientCanView?: boolean
  status: DeliverableStatus
  /** Vimeo review link (or the video's own link). */
  shareUrl?: string
  /** Non-video work for review: a Google Drive file link. */
  fileUrl?: string
  fileName?: string
  thumbnail?: SanityImage
  thumbUrl?: string
  feedbackDue?: string
  length?: string
  notes?: string
  dontEmail?: boolean
  readyVersion?: number
  versionedAt?: string
  readyAt?: string
  notifiedVersion?: number
  notifiedAt?: string
  remindedVersion?: number
  viewedVersion?: number
  vimeoThumb?: string
  vimeoEmbed?: string
  vimeoLength?: string
  vimeoVersions?: number
  /** The video's Vimeo review page, found automatically. */
  vimeoReview?: string
  /** Whether the video's Vimeo links are currently switched on ('on' | 'off'). */
  vimeoAccess?: string
}

export type ActivityItem = { _key: string; at: string; text: string; kind?: string }

export type ClientProject = {
  _id: string
  title: string
  slug: string
  startDate?: string
  /** Back-office stage (lead, booked, preproduction, shoot, roughcut, finalcut, delivered, paid). */
  pipelineStage?: string
  /** Invoice statuses only (no amounts), for the billing card. */
  billing?: { kind?: string; status?: string; outstanding?: number }[]
  status: 'in-production' | 'in-review' | 'delivered'
  stage: number
  stageDates?: string[]
  nextStep?: string
  summary?: string
  coverImage?: SanityImage
  coverUrl?: string
  keyDates?: { _key: string; label?: string; date?: string }[]
  deliverables?: Deliverable[]
  links?: import('./links').ProjectLink[]
  driveFolderId?: string
  activity?: ActivityItem[]
  client: PortalClient
  _updatedAt?: string
}

export type PortalSettings = {
  signInHeadline?: string
  signInIntro?: string
  signInImage?: SanityImage
  checkEmailHeadline?: string
  checkEmailMessage?: string
  dashboardGreeting?: string
  nothingToReview?: string
  newProjectLine?: string
  feedbackSteps?: string[]
  feedbackVideo?: string
  filesIntro?: string
  producer?: Producer
  newVersionSubject?: string
  newVersionIntro?: string
  reminderSubject?: string
  reminderIntroUnviewed?: string
  reminderIntroViewed?: string
  reminderDays?: number
  signOff?: string
  copyTo?: string
}

export type DriveFile = {
  id: string
  name: string
  size?: number
  mimeType: string
  modifiedTime: string
  from: 'Documents' | 'Reference Assets'
  uploadedBy?: string
}

export type Session = { email: string; name?: string; demo?: boolean }
