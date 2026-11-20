/**
 * Retainer clients: a set number of deliverables a month, no approvals. Shared shapes for the
 * back office (setup, monthly items, recap drafts), the Publer sync and the client's retainer portal.
 *
 * Storage (Sanity `portal` dataset):
 *  - The existing `client` document gains a `retainer` object (RetainerSettings). A client is a retainer
 *    client when `retainer.active == true`. Logo stays on the client (`logo`).
 *  - One `retainerMonth` document per client per month, id `retainer-<clientId>-<YYYY-MM>` (RetainerMonth).
 *    It holds the planned/hand-made items (uploads, planned pieces). Publer posts are NOT stored here: they
 *    are read live from Publer (cached) and merged in at read time, see `PublerPiece`.
 *
 * Decisions (Josh, Nov 20 2026):
 *  - Each month starts fresh by default; `rollover` can be switched per client ('none' | 'next-month').
 *  - A piece posted to several networks at once counts as ONE deliverable (grouped, see PublerPiece.networks).
 *  - Done = scheduled or published in Publer, or a file delivered through the portal.
 *  - Month-end recap is DRAFTED for Josh; he reads it and presses Send. Never auto-sent.
 *  - Content tags are left out for now.
 *  - No approval step on retainer work.
 */

/** YYYY-MM, in Edmonton time. */
export type MonthKey = string

export type RetainerSettings = {
  active: boolean
  /** Deliverables included each month. */
  perMonth: number
  /** Unused deliverables: start fresh each month (default) or carry into the next month only. */
  rollover?: 'none' | 'next-month'
  /** The client's Publer workspace id (Publer-Workspace-Id). Empty = no social pieces for this client. */
  publerWorkspaceId?: string
  /** Main brand colour, #rrggbb, used as the portal accent. */
  accent?: string
  /** First month of the retainer (YYYY-MM). Months before it aren't shown. */
  startMonth?: MonthKey
  /** Last month, if it has ended. */
  endMonth?: MonthKey
}

export type ItemStatus = 'planned' | 'in-progress' | 'scheduled' | 'delivered'
export type ItemType = 'social' | 'video' | 'photo' | 'design' | 'other'

/** An item Josh plans or hands over directly (not from Publer). */
export type RetainerItem = {
  _key: string
  title: string
  type: ItemType
  status: ItemStatus
  /** YYYY-MM-DD it was delivered (status 'delivered'). */
  deliveredAt?: string
  /** Files handed over for this item: Google Drive file ids in the client's retainer folder. */
  files?: { id: string; name: string; mimeType?: string; size?: number }[]
  note?: string
}

export type RetainerMonth = {
  _id: string
  clientId: string
  month: MonthKey
  items: RetainerItem[]
  /** Month-end recap, drafted automatically on the 1st for the month before; sent only when Josh presses Send. */
  recap?: { draftedAt?: string; subject?: string; body?: string; sentAt?: string; sentTo?: string[] }
}

export type Network = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'twitter' | 'threads' | 'pinterest' | 'google' | 'bluesky' | 'mastodon' | 'other'

/** Post metrics as Publer reports them. Any can be missing: not every network gives every metric. */
export type PostMetrics = {
  reach?: number
  engagement?: number
  engagementRate?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  videoViews?: number
  linkClicks?: number
}

/** One deliverable from Publer: posts with the same text scheduled within the same hour are grouped. */
export type PublerPiece = {
  /** Stable id: the first Publer post id in the group. */
  id: string
  text: string
  /** ISO time it's scheduled for, or went out. */
  at: string
  state: 'scheduled' | 'published'
  postType?: string
  networks: { network: Network; accountName?: string; link?: string; postId: string }[]
  /** Summed across the grouped posts, published only. */
  metrics?: PostMetrics
}

/** What the retainer portal page for one month needs. Built on the server. */
export type RetainerMonthView = {
  month: MonthKey
  perMonth: number
  /** Extra carried in from last month (rollover 'next-month' only). */
  carried: number
  /** Done = delivered items + scheduled/published Publer pieces. */
  done: number
  items: RetainerItem[]
  pieces: PublerPiece[]
  /** Publer wasn't reachable or isn't set up; pieces may be incomplete. */
  publerNote?: string
}
