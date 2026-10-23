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
  version: number
  status: DeliverableStatus
  /** Vimeo review link (or the video's own link). */
  shareUrl?: string
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
}

export type ActivityItem = { _key: string; at: string; text: string; kind?: string }

export type ClientProject = {
  _id: string
  title: string
  slug: string
  status: 'in-production' | 'in-review' | 'delivered'
  stage: number
  stageDates?: string[]
  nextStep?: string
  summary?: string
  coverImage?: SanityImage
  coverUrl?: string
  keyDates?: { _key: string; label?: string; date?: string }[]
  deliverables?: Deliverable[]
  links?: { _key: string; title?: string; url?: string; note?: string }[]
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
  from: 'From client' | 'From Breaking Ice' | 'Finals'
  uploadedBy?: string
}

export type Session = { email: string; name?: string; demo?: boolean }
