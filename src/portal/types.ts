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
  /** Pays deposits and balances in the portal: e-Transfer or EFT first, card (Stripe) with a fee. Off for clients invoiced elsewhere. */
  portalPayments?: boolean
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
  /** Notes and approvals from the portal, newest last. */
  feedback?: { _key: string; at: string; who?: string; action: 'approve' | 'changes'; note?: string }[]
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
  dontEmailDelivery?: boolean
  /** Recorded automatically: when the scheduler first saw it delivered, and when the delivery email went. */
  deliveredSeenAt?: string
  deliveredNotifiedAt?: string
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
  /** The company's GST/HST number. When set, portal payments add 5% GST and show the number. */
  gstNumber?: string
  /** Where clients send Interac e-Transfers. Shown as the first way to pay. */
  etransferEmail?: string
  /** Bank details for EFT / direct deposit, shown to signed-in clients with something due. */
  eftDetails?: string
  /** Processing fee added when a client chooses to pay by credit card, in percent. */
  cardFeePercent?: number
}

export type DriveFile = {
  id: string
  name: string
  size?: number
  mimeType: string
  modifiedTime: string
  from: 'Documents' | 'Reference Assets' | 'Final Files'
  uploadedBy?: string
}

/** preview: the back office viewing a client's portal (the client's id). Read-only. */
export type Session = { email: string; name?: string; demo?: boolean; preview?: string }

/** A quote as the client sees it. Amounts come from the project; everything else from the quote record. */
export type PortalQuote = {
  projectId: string
  slug: string
  title: string
  org: string
  /** The project's back-office stage: once it's booked, the project itself opens in the portal. */
  pipelineStage?: string
  version: number
  fileName?: string
  summary?: string
  /** A line or two from Josh, shown when the quote is first opened. */
  note?: string
  includes?: string[]
  /** Packages to choose from (Base, Expanded…). The client picks one when signing. */
  options?: QuoteOption[]
  /** Deposit as a share of the chosen total, when it isn't a fixed amount. */
  depositPercent?: number
  validUntil?: string
  sharedAt: string
  total?: number
  deposit?: number
  signature?: QuoteSignature
}

/** What the client can see of a signature. The full record (IP, device, fingerprints) stays on the server. */
export type QuoteSignature = { name: string; title?: string; org?: string; at: string; method: 'typed' | 'drawn'; option?: string; total?: number; deposit?: number; certificateId: string }

export type QuoteOption = { _key: string; name: string; total: number; note?: string }

/** Money asked of a client through the portal: a deposit, a balance, or anything else. Amounts in dollars. */
export type PortalPayment = {
  _id: string
  projectId: string
  clientId: string
  /** Project slug and title, for links and labels. */
  slug?: string
  projectTitle?: string
  kind: 'deposit' | 'balance' | 'other'
  label: string
  /** Before tax. */
  amount: number
  gst?: number
  total: number
  /** due → (processing, once the client says an e-Transfer or EFT is on its way) → paid. Canceled ones aren't shown to the client. */
  status: 'due' | 'processing' | 'paid' | 'canceled'
  createdAt: string
  paidAt?: string
  /** How it was (or is being) paid: etransfer, eft, card, or outside (marked paid by Josh). */
  method?: string
  receiptUrl?: string
  /** Card processing fee and its GST, added only when paid by card. */
  cardFee?: number
  cardFeeGst?: number
  /** The matching Zoho Books invoice. */
  zohoInvoiceId?: string
  zohoInvoiceNumber?: string
}
