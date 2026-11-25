export type SanityImage = { asset?: { _ref?: string } } | null | undefined

export type Producer = { name?: string; role?: string; email?: string; phone?: string; portrait?: SanityImage }

export type Contact = { _key: string; name: string; email: string; role?: string; getsEmails?: boolean; /** Back office only: not read for the portal. */ phone?: string }

export type PortalClient = {
  _id: string
  organizationName: string
  logo?: SanityImage
  contacts: Contact[]
  producer?: Producer
  driveFolderId?: string
  /** Pays deposits and balances in the portal: e-Transfer or EFT first, card (Stripe) with a fee. Off for clients invoiced elsewhere. */
  portalPayments?: boolean
  /** GST-exempt: nothing adds or mentions GST. */
  noGst?: boolean
  /** The portal chat: on or off, and its Slack channel once made. */
  chat?: { enabled?: boolean; slackChannelId?: string }
}

/** One message in a client's portal chat. */
export type ChatMessage = {
  _key: string
  at: string
  from: 'client' | 'josh' | 'assistant'
  who: string
  text: string
  tab: 'josh' | 'assistant'
  slackTs?: string
  /** The assistant answered in the Josh tab because Josh hadn't replied yet. */
  handoff?: boolean
  /** Written by Josh from the back office's portal preview, not by the client. */
  staff?: boolean
  /** Who wrote it (stored only; the browser gets `mine` instead). */
  email?: string
  /** For the browser: written by the person looking. */
  mine?: boolean
}

/** A Claude summary of a stretch of the portal chat, also posted to Slack. */
export type ChatSummary = { _key: string; at: string; tab: 'josh' | 'assistant'; from: string; to: string; count: number; text: string }

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
  /** Where the video plays: Vimeo (a shareUrl), or our own review room (an MP4 or MOV in R2). Unset means Vimeo. */
  host?: 'vimeo' | 'r2'
  /** The review copy's object key in the R2 bucket. */
  r2Key?: string
  r2Size?: number
  /** The thumbnail grabbed from the video at upload, a JPEG next to it in R2. */
  r2Thumb?: string
  /** Where the thumbnail was picked from, in seconds (the back office's frame picker). */
  thumbAt?: number
  /** false: the browser can't play the stored file (often a ProRes delivery). No review room; the preview comes from the Vimeo copy. */
  playable?: boolean
  /** A finished file's copy on Vimeo, for the website (uploads for delivery). Separate from shareUrl, which is for playback. */
  vimeoUrl?: string
  vimeoUri?: string
  vimeoState?: 'uploading' | 'ready' | 'failed'
  vimeoError?: string
  durationSec?: number
  /** Frame rate of the review copy, for timecode: 23.976, 24, 25, 29.97, 30, 50, 59.94 or 60. */
  fps?: number
  width?: number
  height?: number
  /** Guest link to the review room. Kept in the state record so publishing an old draft can't bring back a switched-off link. */
  share?: { token: string; on: boolean; createdAt: string }
  /** When the owner was last told about new comments on this version, and whether more came in since. */
  commentsNotifiedAt?: string
  commentsPending?: boolean
  /** Worked out on the server (never stored): open comments from the client or guests on this version. */
  openComments?: number
}

export const REVIEW_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const

/** One shape drawn on a paused frame. Coordinates are 0–1 of the picture's width and height. */
export type ReviewShape = { type: 'arrow' | 'box' | 'pen'; color: string; points: [number, number][] }

/** A time-coded comment in the review room, as the browser sees it. */
export type ReviewComment = {
  _id: string
  deliverableKey: string
  version: number
  /** Seconds into the video; tOut makes it a range. */
  t: number
  tOut?: number
  text: string
  author: { kind: 'client' | 'guest' | 'admin'; name: string }
  parent?: string
  done?: boolean
  doneBy?: string
  doneAt?: string
  drawing?: ReviewShape[]
  createdAt: string
  editedAt?: string
  /** Worked out per viewer: they wrote it. */
  mine?: boolean
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
  chatHandoffMinutes?: number
  chatMonthlyCap?: number
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
  /** A small image of the PDF's first page, so the reveal shows the cover straight away. */
  coverUrl?: string
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
  /** The client is GST-exempt, so prices show without "+ GST". */
  noGst?: boolean
}

/** What the client can see of a signature. The full record (IP, device, fingerprints) stays on the server. */
export type QuoteSignature = { name: string; title?: string; org?: string; at: string; method: 'typed' | 'drawn'; option?: string; total?: number; deposit?: number; certificateId: string }

export type QuoteOption = { _key: string; name: string; total: number; note?: string }

/**
 * Money asked of a client through the portal: a deposit, a balance, or anything else. Amounts in dollars.
 * A retainer payment mirrors a monthly invoice Zoho Books generated from a recurring profile: it
 * belongs to the client, not a project, so it has no projectId.
 */
export type PortalPayment = {
  _id: string
  /** Missing on retainer payments. */
  projectId?: string
  clientId: string
  /** Project slug and title, for links and labels. */
  slug?: string
  projectTitle?: string
  /** The client's name, where a query asks for it (retainer payments have no project to name). */
  clientName?: string
  kind: 'deposit' | 'balance' | 'other' | 'retainer'
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
