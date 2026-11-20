import 'server-only'
import { adminSampleMode } from '@/admin/config'
import { driveReady, portalReady } from '@/portal/config'
import { CLIENT_FIELDS, findClientsByEmail, portalClient } from '@/portal/data'
import { fileMeta, findClientSubfolder, listFolderFiles, listSubfolders } from '@/portal/drive'
import type { DriveFile, PortalClient, Session } from '@/portal/types'
import { publerPieces, publerReady, type PublerResult } from './publer'
import { SAMPLE_RETAINER_ID, sampleItems, samplePieces, sampleRetainerClient } from './samples'
import { BRAND_COLOURS, type BrandImage, type ItemStatus, type ItemType, type MonthKey, type PublerPiece, type RetainerBrand, type RetainerItem, type RetainerMonth, type RetainerMonthView, type RetainerSettings } from './types'

/**
 * Retainer clients, server side. Read by the client's retainer portal and the back office; written
 * only by the back office (and the scheduler, which drafts recaps). See ./types.ts for Josh’s decisions.
 */

const TZ = 'America/Edmonton'

/* ── Months (Edmonton time) ──────────────────────────────────────────── */

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** YYYY-MM-DD in Edmonton. */
export const edmontonDate = (d: Date = new Date()) => {
  const p = Object.fromEntries(ymd.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/** The month a moment falls in, in Edmonton time. */
export function monthKey(d: Date = new Date()): MonthKey {
  return edmontonDate(d).slice(0, 7)
}

export const isMonthKey = (s: unknown): s is MonthKey => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export function shiftMonth(m: MonthKey, by: number): MonthKey {
  const n = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + by
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`
}

/** "November 2026". */
export function monthLabel(m: MonthKey): string {
  return new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const daysIn = (m: MonthKey) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()
const addDays = (date: string, by: number) => new Date(Date.parse(`${date}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10)

/* ── Types ───────────────────────────────────────────────────────────── */

/** A client with a retainer. `firstMonth` is the month of their earliest retainerMonth record, if any. */
export type RetainerClient = PortalClient & { retainer: RetainerSettings; firstMonth?: MonthKey }

/**
 * A file handed over on retainer work (from: 'Final Files', in the client's Drive Retainer/<YYYY-MM>),
 * or a client document such as the agreement (from: 'Documents', in their Drive Documents folder).
 * A DriveFile, so the portal's file components take it as is.
 */
export type RetainerFile = DriveFile & {
  /** The month folder it sits in (retainer deliveries), or the month it was last changed (documents). */
  month: MonthKey
  /** The retainer item it was attached to, when we know. */
  itemTitle?: string
}

export type RecapDraft = NonNullable<RetainerMonth['recap']>

/* ── Reading ─────────────────────────────────────────────────────────── */

/** Brand images carry their raw asset url and type, so SVGs can be used as they are (not rasterized). */
const BRAND_IMG = (k: string) => `${k}{asset, "url": asset->url, "mimeType": asset->mimeType}`
const RC_FIELDS = `${CLIENT_FIELDS}, retainer{..., brand{..., ${BRAND_IMG('pattern')}, ${BRAND_IMG('mark')}, ${BRAND_IMG('markSmall')}}}, "firstMonth": *[_type == "retainerMonth" && clientId == ^._id] | order(month asc)[0].month`
type RawClient = PortalClient & { retainer?: Partial<RetainerSettings> | null; firstMonth?: string | null }

async function q<T>(query: string, params: Record<string, unknown> = {}): Promise<T | null> {
  if (!portalReady()) return null
  try {
    return await portalClient.fetch<T>(query, params, { cache: 'no-store' })
  } catch (err) {
    console.error('[retainer] query failed', err)
    return null
  }
}

export const ITEM_TYPES: ItemType[] = ['social', 'video', 'photo', 'design', 'other']
export const ITEM_STATUSES: ItemStatus[] = ['planned', 'in-progress', 'scheduled', 'delivered']

/** Settings as stored, made safe: numbers are numbers, unknown values fall back to the defaults. */
export function cleanSettings(raw: Partial<RetainerSettings> | null | undefined): RetainerSettings {
  const per = Math.round(Number(raw?.perMonth))
  const out: RetainerSettings = {
    active: raw?.active === true,
    perMonth: Number.isFinite(per) && per >= 0 ? Math.min(per, 500) : 0,
    rollover: raw?.rollover === 'next-month' ? 'next-month' : 'none',
  }
  const ws = typeof raw?.publerWorkspaceId === 'string' ? raw.publerWorkspaceId.trim().slice(0, 80) : ''
  if (ws) out.publerWorkspaceId = ws
  if (typeof raw?.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accent.trim())) out.accent = raw.accent.trim().toLowerCase()
  if (isMonthKey(raw?.startMonth)) out.startMonth = raw.startMonth
  if (isMonthKey(raw?.endMonth)) out.endMonth = raw.endMonth
  const brand = cleanBrand(raw?.brand)
  if (brand) out.brand = brand
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/

function cleanImage(raw: unknown): BrandImage | undefined {
  const r = raw as BrandImage | null | undefined
  if (!r || typeof r !== 'object') return undefined
  const out: BrandImage = {}
  if (typeof r.asset?._ref === 'string') out.asset = { _ref: r.asset._ref }
  // Only https urls from Sanity, or a site-relative path (sample files in public/).
  if (typeof r.url === 'string' && (/^https:\/\/cdn\.sanity\.io\/[\w./-]+$/.test(r.url) || /^\/[\w./-]+$/.test(r.url))) out.url = r.url
  if (typeof r.mimeType === 'string') out.mimeType = r.mimeType.slice(0, 60)
  return out.asset || out.url ? out : undefined
}

/** The brand object made safe: valid #rrggbb colours only, known fonts, images with an asset or a safe url. Undefined when empty. */
export function cleanBrand(raw: Partial<RetainerBrand> | null | undefined): RetainerBrand | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: RetainerBrand = {}
  const name = typeof raw.displayName === 'string' ? raw.displayName.trim().slice(0, 80) : ''
  if (name) out.displayName = name
  for (const k of BRAND_COLOURS) {
    const v = raw[k]
    if (typeof v === 'string' && HEX.test(v.trim())) out[k] = v.trim().toLowerCase()
  }
  if (raw.fonts === 'geometric' || raw.fonts === 'breaking-ice') out.fonts = raw.fonts
  for (const k of ['pattern', 'mark', 'markSmall'] as const) {
    const img = cleanImage(raw[k])
    if (img) out[k] = img
  }
  return Object.keys(out).length ? out : undefined
}

const shape = (c: RawClient): RetainerClient => ({
  ...c,
  contacts: c.contacts ?? [],
  retainer: cleanSettings(c.retainer),
  firstMonth: isMonthKey(c.firstMonth) ? c.firstMonth : undefined,
})

const sampleClient = (): RetainerClient => sampleRetainerClient(shiftMonth(monthKey(), -2))
export const isSampleRetainer = (c: { _id: string }) => c._id === SAMPLE_RETAINER_ID

/**
 * The signed-in person's retainer clients (active ones only). Same rules as the portal's getAccess:
 * a contact's email, a back-office preview of one client, or the sample client in sample mode.
 */
export async function retainerClientsFor(session: Session): Promise<RetainerClient[]> {
  if (session.demo || adminSampleMode()) return [sampleClient()]
  let raw: RawClient[]
  if (session.preview) {
    raw = (await q<RawClient[]>(`*[_type == "client" && _id == $id]{${RC_FIELDS}}`, { id: session.preview })) ?? []
  } else {
    const ids = (await findClientsByEmail(session.email)).map((c) => c._id)
    raw = ids.length ? ((await q<RawClient[]>(`*[_type == "client" && _id in $ids]{${RC_FIELDS}}`, { ids })) ?? []) : []
  }
  return raw.map(shape).filter((c) => c.retainer.active)
}

/** One client with its retainer. Null if there's no such client, or (unless includeInactive) its retainer isn't on. */
export async function getRetainerClient(clientId: string, opts: { includeInactive?: boolean } = {}): Promise<RetainerClient | null> {
  if (clientId === SAMPLE_RETAINER_ID) return sampleClient()
  if (adminSampleMode() || !/^[\w.-]{1,100}$/.test(clientId)) return null
  const c = await q<RawClient>(`*[_type == "client" && _id == $id][0]{${RC_FIELDS}}`, { id: clientId })
  if (!c) return null
  const r = shape(c)
  return r.retainer.active || opts.includeInactive ? r : null
}

/** Every client with a retainer set up (back office and scheduler). Inactive ones only when asked. */
export async function allRetainerClients(opts: { includeInactive?: boolean } = {}): Promise<RetainerClient[]> {
  if (adminSampleMode()) return [sampleClient()]
  const raw = (await q<RawClient[]>(`*[_type == "client" && defined(retainer)] | order(organizationName asc){${RC_FIELDS}}`)) ?? []
  return raw.map(shape).filter((c) => c.retainer.active || opts.includeInactive)
}

export const monthDocId = (clientId: string, month: MonthKey) => `retainer-${clientId}-${month}`

/** The month's record (hand-made items and the recap), or null if nothing has been added for that month yet. */
export async function getRetainerMonth(clientId: string, month: MonthKey): Promise<RetainerMonth | null> {
  if (clientId === SAMPLE_RETAINER_ID) {
    const cur = monthKey()
    return month > cur ? null : { _id: monthDocId(clientId, month), clientId, month, items: sampleItems(month, month === cur) }
  }
  const doc = await q<RetainerMonth>(`*[_id == $id][0]{_id, clientId, month, items, recap}`, { id: monthDocId(clientId, month) })
  return doc ? { ...doc, items: doc.items ?? [] } : null
}

/** Publer pieces that went out (or are scheduled) in a month, Edmonton time. `failed`: Publer is set up but didn't answer. */
export async function piecesForMonth(c: RetainerClient, month: MonthKey, opts: { insights?: boolean } = {}): Promise<PublerResult & { failed?: boolean }> {
  if (isSampleRetainer(c)) return { pieces: month <= monthKey() ? samplePieces(month, new Date().toISOString()) : [] }
  // Publer's dates are plain days, so ask for a day either side and keep what falls in the month here.
  const r = await publerPieces(c.retainer.publerWorkspaceId, addDays(`${month}-01`, -1), addDays(`${month}-${String(daysIn(month)).padStart(2, '0')}`, 1), opts)
  const pieces = r.pieces.filter((p) => monthKey(new Date(p.at)) === month)
  const failed = Boolean(r.note) && publerReady() && Boolean(c.retainer.publerWorkspaceId)
  return { pieces, ...(r.note ? { note: r.note } : {}), ...(failed ? { failed } : {}) }
}

const deliveredCount = (items: RetainerItem[]) => items.filter((i) => i.status === 'delivered').length

/**
 * One month as the portal and back office show it: hand-made items plus Publer pieces, how many are
 * done, and (rollover 'next-month' only) what's carried in from the month before.
 */
export async function buildMonthView(c: RetainerClient, month: MonthKey): Promise<RetainerMonthView> {
  const { perMonth, rollover, startMonth } = c.retainer
  const prev = shiftMonth(month, -1)
  const carryOn = rollover === 'next-month' && (!startMonth || prev >= startMonth)
  const [doc, pub, before] = await Promise.all([
    getRetainerMonth(c._id, month),
    piecesForMonth(c, month),
    carryOn ? Promise.all([getRetainerMonth(c._id, prev), piecesForMonth(c, prev, { insights: false })]) : null,
  ])
  const items = doc?.items ?? []
  let carried = 0
  let note = pub.note
  if (before) {
    const [prevDoc, prevPub] = before
    // Unknown is safer than a wrong number: carry nothing until Publer answers for last month.
    if (prevPub.failed) note = note ?? 'Last month’s posts couldn’t be counted just now, so nothing is carried over until Publer answers.'
    else carried = Math.max(0, perMonth - (deliveredCount(prevDoc?.items ?? []) + prevPub.pieces.length))
  }
  return {
    month,
    perMonth,
    carried,
    done: deliveredCount(items) + pub.pieces.length,
    items,
    pieces: [...pub.pieces].sort((a, b) => b.at.localeCompare(a.at)),
    ...(note ? { publerNote: note } : {}),
  }
}

/** Months to show, newest first: from startMonth (or the first record, or this month) to this month (or endMonth). */
export function monthsFor(c: RetainerClient): MonthKey[] {
  const now = monthKey()
  const start = c.retainer.startMonth ?? c.firstMonth ?? now
  const end = c.retainer.endMonth && c.retainer.endMonth < now ? c.retainer.endMonth : now
  if (start > end) return [start > now ? start : end]
  const out: MonthKey[] = []
  for (let m = end; m >= start && out.length < 120; m = shiftMonth(m, -1)) out.push(m)
  return out
}

/** Scheduled posts from now forward, soonest first. */
export async function upcomingPieces(c: RetainerClient, days = 30): Promise<{ pieces: PublerPiece[]; note?: string }> {
  const nowIso = new Date().toISOString()
  const limit = new Date(Date.now() + days * 86_400_000).toISOString()
  const keep = (list: PublerPiece[]) => list.filter((p) => p.state === 'scheduled' && p.at >= nowIso && p.at <= limit).sort((a, b) => a.at.localeCompare(b.at))
  if (isSampleRetainer(c)) {
    const m = monthKey()
    return { pieces: keep([...samplePieces(m, nowIso), ...samplePieces(shiftMonth(m, 1), nowIso)]) }
  }
  const today = edmontonDate()
  const r = await publerPieces(c.retainer.publerWorkspaceId, today, addDays(today, days), { insights: false })
  return { pieces: keep(r.pieces), ...(r.note ? { note: r.note } : {}) }
}

/** Every retainerMonth record of a client (items only), for naming files after their items. */
async function allMonthItems(clientId: string) {
  return (await q<{ month: MonthKey; items?: RetainerItem[] }[]>(`*[_type == "retainerMonth" && clientId == $id]{month, items}`, { id: clientId })) ?? []
}

/** Everything handed over on retainer work, newest first, from the client's Drive folder Retainer/<YYYY-MM>. */
export async function retainerLibrary(c: RetainerClient): Promise<RetainerFile[]> {
  if (isSampleRetainer(c)) {
    return monthsFor(c)
      .flatMap((m) =>
        sampleItems(m, m === monthKey()).flatMap((i) =>
          (i.files ?? []).map<RetainerFile>((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
            mimeType: f.mimeType ?? 'application/octet-stream',
            modifiedTime: `${i.deliveredAt ?? `${m}-01`}T17:00:00.000Z`,
            from: 'Final Files',
            month: m,
            itemTitle: i.title,
          })),
        ),
      )
      .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
  }
  if (!driveReady() || !c.driveFolderId) return []
  try {
    const root = await findClientSubfolder(c, ['Retainer'])
    if (!root) return []
    const [folders, docs] = await Promise.all([listSubfolders(root), allMonthItems(c._id)])
    const titles = new Map<string, string>()
    for (const d of docs) for (const i of d.items ?? []) for (const f of i.files ?? []) titles.set(f.id, i.title)
    const lists = await Promise.all(
      folders
        .filter((f) => isMonthKey(f.name))
        .map(async (f) =>
          (await listFolderFiles(f.id)).map<RetainerFile>((x) => ({ id: x.id, name: x.name, size: x.size, mimeType: x.mimeType, modifiedTime: x.modifiedTime, uploadedBy: x.uploadedBy, from: 'Final Files', month: f.name, itemTitle: titles.get(x.id) })),
        ),
    )
    return lists.flat().sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
  } catch (e) {
    console.error('[retainer] library failed', e)
    return []
  }
}

/** Files in the client's own Drive "Documents" folder (contracts, the retainer agreement). Read-only for the client. */
export async function retainerDocuments(c: RetainerClient): Promise<RetainerFile[]> {
  if (isSampleRetainer(c)) {
    const m = c.retainer.startMonth ?? monthKey()
    return [{ id: 'sample-doc-agreement', name: 'Retainer agreement 2026.pdf', size: 240_000, mimeType: 'application/pdf', modifiedTime: `${m}-01T17:00:00.000Z`, from: 'Documents', month: m }]
  }
  if (!driveReady() || !c.driveFolderId) return []
  try {
    const folder = await findClientSubfolder(c, ['Documents'])
    if (!folder) return []
    return (await listFolderFiles(folder)).map<RetainerFile>((x) => ({ id: x.id, name: x.name, size: x.size, mimeType: x.mimeType, modifiedTime: x.modifiedTime, from: 'Documents', month: monthKey(new Date(x.modifiedTime)) }))
  } catch (e) {
    console.error('[retainer] documents failed', e)
    return []
  }
}

/**
 * The file, if it sits in this client's Retainer/<YYYY-MM> folders or their Documents folder; null otherwise.
 * Its shape fits downloadStream() in src/portal/drive.ts. Sample files can't be downloaded.
 */
export async function retainerFile(c: RetainerClient, fileId: string) {
  if (isSampleRetainer(c) || !driveReady() || !c.driveFolderId || !/^[\w-]{10,200}$/.test(fileId)) return null
  try {
    const [f, root, docs] = await Promise.all([fileMeta(fileId), findClientSubfolder(c, ['Retainer']), findClientSubfolder(c, ['Documents'])])
    if (!f || f.mimeType === 'application/vnd.google-apps.folder') return null
    const parents = f.parents ?? []
    if (docs && parents.includes(docs)) return { ...f, from: 'Documents' as const }
    if (root) {
      for (const p of parents) {
        const folder = await fileMeta(p)
        if (folder && isMonthKey(folder.name) && folder.parents?.includes(root)) return { ...f, from: 'Final Files' as const, month: folder.name }
      }
    }
    // A file attached to one of this client's retainer items counts too, wherever it sits in Drive.
    for (const d of await allMonthItems(c._id)) if (d.items?.some((i) => i.files?.some((x) => x.id === fileId))) return { ...f, from: 'Final Files' as const, month: d.month }
    return null
  } catch (e) {
    console.error('[retainer] file check failed', e)
    return null
  }
}

/** For the download route's permission check. */
export async function fileInRetainer(c: RetainerClient, fileId: string): Promise<boolean> {
  return (await retainerFile(c, fileId)) !== null
}

/* ── Writes (back office and scheduler only; never in sample mode) ──── */

/** False in sample mode or for the sample client: the caller should say "sample, not saved". */
export const canWrite = (clientId: string) => portalReady() && !adminSampleMode() && clientId !== SAMPLE_RETAINER_ID

const newKey = () => Math.random().toString(36).slice(2, 12)
export const validKey = (k: unknown): k is string => typeof k === 'string' && /^[\w-]{1,40}$/.test(k)

/** An item as it may be stored: trimmed, known values only, delivered date set when it's delivered. */
export function cleanItem(raw: Partial<RetainerItem>): RetainerItem {
  const status: ItemStatus = ITEM_STATUSES.includes(raw.status as ItemStatus) ? (raw.status as ItemStatus) : 'planned'
  const item: RetainerItem = {
    _key: validKey(raw._key) ? raw._key : newKey(),
    title: String(raw.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Untitled',
    type: ITEM_TYPES.includes(raw.type as ItemType) ? (raw.type as ItemType) : 'other',
    status,
  }
  if (status === 'delivered') item.deliveredAt = typeof raw.deliveredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.deliveredAt) ? raw.deliveredAt : edmontonDate()
  const note = String(raw.note ?? '').trim().slice(0, 1000)
  if (note) item.note = note
  if (Array.isArray(raw.files)) item.files = cleanFiles(raw.files)
  return item
}

function cleanFiles(files: unknown[]) {
  return files
    .slice(0, 50)
    .map((f) => f as { id?: unknown; name?: unknown; mimeType?: unknown; size?: unknown })
    .filter((f) => typeof f.id === 'string' && /^[\w-]{1,200}$/.test(f.id) && typeof f.name === 'string' && f.name.trim())
    .map((f) => ({
      _key: String(f.id).slice(0, 40),
      id: String(f.id),
      name: String(f.name).slice(0, 200),
      ...(typeof f.mimeType === 'string' && f.mimeType ? { mimeType: f.mimeType.slice(0, 120) } : {}),
      ...(Number.isFinite(Number(f.size)) && Number(f.size) > 0 ? { size: Number(f.size) } : {}),
    }))
}

async function ensureMonthDoc(clientId: string, month: MonthKey) {
  const _id = monthDocId(clientId, month)
  await portalClient.createIfNotExists({ _id, _type: 'retainerMonth', clientId, client: { _type: 'reference', _ref: clientId, _weak: true }, month, items: [] })
  return _id
}

export async function saveRetainerSettings(clientId: string, settings: Partial<RetainerSettings>): Promise<RetainerSettings> {
  const clean = cleanSettings(settings)
  if (!canWrite(clientId)) return clean
  // Optional fields left empty are removed rather than stored as blanks.
  const unset: string[] = (['publerWorkspaceId', 'accent', 'startMonth', 'endMonth'] as const).filter((k) => clean[k] === undefined).map((k) => `retainer.${k}`)
  const { brand, ...flat } = clean
  const set: Record<string, unknown> = Object.fromEntries(Object.entries(flat).map(([k, v]) => [`retainer.${k}`, v]))
  // Brand: only the name, colours and type come from the back office, field by field. The images are
  // set in the Studio and are never touched here. Sent only when the form included `brand`.
  if (settings.brand !== undefined) {
    for (const k of ['displayName', ...BRAND_COLOURS, 'fonts'] as const) {
      if (brand?.[k] !== undefined) set[`retainer.brand.${k}`] = brand[k]
      else unset.push(`retainer.brand.${k}`)
    }
  }
  let patch = portalClient.patch(clientId).setIfMissing({ retainer: {} })
  if (settings.brand !== undefined) patch = patch.setIfMissing({ 'retainer.brand': {} })
  await patch.set(set).unset(unset).commit()
  // What's stored now: the cleaned form values plus any brand images already there.
  const after = (await getRetainerClient(clientId, { includeInactive: true }).catch(() => null))?.retainer
  return after ?? clean
}

/** Adds the item, or replaces the one with the same _key. Returns what was stored. */
export async function upsertItem(clientId: string, month: MonthKey, item: Partial<RetainerItem>): Promise<RetainerItem> {
  const clean = cleanItem(item)
  if (!canWrite(clientId) || !isMonthKey(month)) return clean
  const id = await ensureMonthDoc(clientId, month)
  const doc = await portalClient.getDocument<{ items?: RetainerItem[] }>(id)
  const existing = doc?.items?.find((i) => i._key === clean._key)
  // Files are attached separately (attachFiles); an edit that doesn't send them keeps the ones already there.
  if (!item.files && existing?.files) clean.files = existing.files
  const patch = portalClient.patch(id).setIfMissing({ items: [] })
  if (existing) patch.set({ [`items[_key=="${clean._key}"]`]: { _type: 'retainerItem', ...clean } })
  else patch.insert('after', 'items[-1]', [{ _type: 'retainerItem', ...clean }])
  await patch.commit({ autoGenerateArrayKeys: false })
  return clean
}

/** Adds handed-over files to an item. */
export async function attachFiles(clientId: string, month: MonthKey, key: string, files: unknown[]) {
  const clean = cleanFiles(files)
  if (!canWrite(clientId) || !isMonthKey(month) || !validKey(key) || !clean.length) return clean
  await portalClient
    .patch(monthDocId(clientId, month))
    .setIfMissing({ [`items[_key=="${key}"].files`]: [] })
    .append(`items[_key=="${key}"].files`, clean)
    .commit({ autoGenerateArrayKeys: false })
  return clean
}

export async function removeItem(clientId: string, month: MonthKey, key: string) {
  if (!canWrite(clientId) || !isMonthKey(month) || !validKey(key)) return
  await portalClient.patch(monthDocId(clientId, month)).unset([`items[_key=="${key}"]`]).commit()
}

/** Merges into the month's recap. A null value removes that field. */
export async function saveRecap(clientId: string, month: MonthKey, recap: { [K in keyof RecapDraft]?: RecapDraft[K] | null }) {
  if (!canWrite(clientId) || !isMonthKey(month)) return
  const id = await ensureMonthDoc(clientId, month)
  const set = Object.fromEntries(Object.entries(recap).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [`recap.${k}`, v]))
  const unset = Object.entries(recap).filter(([, v]) => v === null).map(([k]) => `recap.${k}`)
  await portalClient.patch(id).setIfMissing({ recap: {} }).set(set).unset(unset).commit()
}

/**
 * Claims the recap before it's sent: only succeeds if it hasn't been sent and nobody changed the record
 * since we read it, so a double click or two open tabs can't send it twice.
 */
export async function claimRecapSend(clientId: string, month: MonthKey, stamp: string): Promise<'ok' | 'sent' | 'busy'> {
  if (!canWrite(clientId)) return 'busy'
  const id = await ensureMonthDoc(clientId, month)
  const doc = await portalClient.getDocument<{ _rev: string; recap?: RecapDraft }>(id)
  if (!doc) return 'busy'
  if (doc.recap?.sentAt) return 'sent'
  try {
    await portalClient.patch(id).ifRevisionId(doc._rev).setIfMissing({ recap: {} }).set({ 'recap.sentAt': stamp }).commit()
    return 'ok'
  } catch {
    return 'busy'
  }
}
