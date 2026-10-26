import 'server-only'
import { importPKCS8, SignJWT } from 'jose'
import { getVercelOidcToken } from '@vercel/oidc'
import { driveReady, googleKeyless, portalEnv } from './config'
import { setDriveFolder } from './data'
import { projectLabel } from './library'
import type { ClientProject, DriveFile } from './types'

/**
 * Google Drive through a service account that is a member of the Workspace
 * Shared Drive "BI Clients". Clients never need a Google account: the server
 * holds the connection and only ever touches the signed-in client's folder.
 *
 *   BI Clients / [Client] / [YYYY-MM-DD Project] / Documents          (versions of designs, PDFs…)
 *                                                / Reference Assets   (logos, scripts, what the client sends)
 * Videos live on Vimeo, not here.
 */

export const SUBFOLDERS = ['Documents', 'Reference Assets'] as const
/** Folders from the first layout, renamed in place the first time a project is opened. */
const OLD_NAMES: Record<string, string> = { Documents: 'From Breaking Ice', 'Reference Assets': 'From client' }
type Sub = (typeof SUBFOLDERS)[number]
const FOLDER = 'application/vnd.google-apps.folder'
const API = 'https://www.googleapis.com/drive/v3'
const ALL = 'supportsAllDrives=true&includeItemsFromAllDrives=true'

let token: { value: string; exp: number } | null = null

function serviceAccount(): { client_email: string; private_key: string } {
  const raw = portalEnv.googleServiceAccount.trim()
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
}

/** Keyless: Vercel's OIDC token → Google STS → a short-lived token for the portal service account. */
async function keylessToken() {
  const sts = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: `//iam.googleapis.com/${portalEnv.googleWifProvider}`,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      subjectToken: await getVercelOidcToken(),
    }),
  })
  if (!sts.ok) throw new Error(`google sts ${sts.status}: ${(await sts.text()).slice(0, 300)}`)
  const federated = ((await sts.json()) as { access_token: string }).access_token
  const res = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${portalEnv.googleServiceAccountEmail}:generateAccessToken`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${federated}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/drive'], lifetime: '3600s' }),
  })
  if (!res.ok) throw new Error(`google impersonation ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json()) as { accessToken: string; expireTime: string }
  return { value: j.accessToken, exp: Date.parse(j.expireTime) }
}

export async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value
  if (googleKeyless()) {
    token = await keylessToken()
    return token.value
  }
  const sa = serviceAccount()
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/drive' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, 'RS256'))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`google token ${res.status}: ${await res.text()}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return token.value
}

async function drive<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`drive ${path.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as T
}

const qs = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const safeName = (s: string) => s.replace(/[/\\]/g, '–').trim().slice(0, 120) || 'Untitled'

async function children(parent: string, foldersOnly = false) {
  const q = `'${parent}' in parents and trashed = false${foldersOnly ? ` and mimeType = '${FOLDER}'` : ` and mimeType != '${FOLDER}'`}`
  const files: { id: string; name: string; size?: string; mimeType: string; modifiedTime: string; appProperties?: Record<string, string> }[] = []
  let pageToken = ''
  do {
    const r = await drive<{ files: typeof files; nextPageToken?: string }>(
      `/files?${ALL}&corpora=drive&driveId=${portalEnv.sharedDriveId}&pageSize=200&orderBy=modifiedTime desc` +
        `&fields=nextPageToken,files(id,name,size,mimeType,modifiedTime,appProperties)&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )
    files.push(...r.files)
    pageToken = r.nextPageToken ?? ''
  } while (pageToken && files.length < 1000)
  return files
}

async function getFolder(id: string) {
  try {
    const f = await drive<{ id: string; name: string; trashed: boolean; mimeType: string }>(`/files/${id}?supportsAllDrives=true&fields=id,name,trashed,mimeType`)
    return f.trashed || f.mimeType !== FOLDER ? null : f
  } catch {
    return null
  }
}

async function createFolder(name: string, parent: string, sanityId?: string) {
  const f = await drive<{ id: string }>(`/files?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent], ...(sanityId ? { appProperties: { sanityId } } : {}) }),
  })
  return f.id
}

/** Subfolders live inside a project's own folder, so finding them by name is safe. */
async function findOrCreateSub(name: string, parent: string) {
  const folders = await children(parent, true)
  const existing = folders.find((f) => f.name === name)
  if (existing) return existing.id
  const old = OLD_NAMES[name] && folders.find((f) => f.name === OLD_NAMES[name])
  if (old) {
    await drive(`/files/${old.id}?supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify({ name }) })
    return old.id
  }
  return createFolder(name, parent)
}

/** A folder we made earlier for this exact Sanity document (tagged with its ID), wherever it is. */
async function findTagged(sanityId: string) {
  const q = `appProperties has { key='sanityId' and value='${qs(sanityId)}' } and mimeType = '${FOLDER}' and trashed = false`
  const r = await drive<{ files: { id: string }[] }>(
    `/files?${ALL}&corpora=drive&driveId=${portalEnv.sharedDriveId}&pageSize=1&fields=files(id)&q=${encodeURIComponent(q)}`,
  )
  return r.files[0]?.id
}

/**
 * The folder for one client or project. Matched by its stored ID or its Sanity tag,
 * never by name, so two clients called the same thing can never share a folder.
 * Renames follow the Studio. Never deletes anything.
 */
async function ensureFolder(doc: { _id: string; driveFolderId?: string }, name: string, parent: string) {
  if (doc.driveFolderId) {
    const f = await getFolder(doc.driveFolderId)
    if (f) {
      if (f.name !== name) await drive(`/files/${f.id}?supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify({ name }) })
      return f.id
    }
  }
  const id = (await findTagged(doc._id)) ?? (await createFolder(name, parent, doc._id))
  await setDriveFolder(doc._id, id)
  doc.driveFolderId = id
  return id
}

const subCache = new Map<string, { at: number; subs: Record<Sub, string> }>()
const inflight = new Map<string, Promise<Record<Sub, string>>>()
const clientInflight = new Map<string, Promise<string>>()

/** Several projects of one new client must not each create a client folder. */
function ensureClientFolder(c: ClientProject['client']) {
  const running = clientInflight.get(c._id)
  if (running) return running
  const job = ensureFolder(c, safeName(c.organizationName), portalEnv.sharedDriveId).finally(() => clientInflight.delete(c._id))
  clientInflight.set(c._id, job)
  return job
}

/** Creates (or finds) the client and project folders and their three subfolders, one project at a time. */
export function ensureProjectFolders(p: ClientProject): Promise<Record<Sub, string>> {
  const running = inflight.get(p._id)
  if (running) return running
  const job = (async () => {
    const hit = p.driveFolderId && subCache.get(p.driveFolderId)
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.subs
    const clientFolder = await ensureClientFolder(p.client)
    const projectFolder = await ensureFolder(p, safeName(projectLabel(p)), clientFolder)
    const subs = {} as Record<Sub, string>
    for (const name of SUBFOLDERS) subs[name] = await findOrCreateSub(name, projectFolder)
    subCache.set(projectFolder, { at: Date.now(), subs })
    return subs
  })().finally(() => inflight.delete(p._id))
  inflight.set(p._id, job)
  return job
}

export async function listProjectFiles(p: ClientProject): Promise<DriveFile[]> {
  if (!driveReady()) return []
  const subs = await ensureProjectFolders(p)
  const lists = await Promise.all(
    SUBFOLDERS.map(async (from) =>
      (await children(subs[from])).map<DriveFile>((f) => ({
        id: f.id,
        name: f.name,
        size: f.size ? Number(f.size) : undefined,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        from,
        uploadedBy: f.appProperties?.uploadedBy,
      })),
    ),
  )
  return lists.flat().sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
}

/**
 * Opens a resumable upload into "From client". The browser then sends the file
 * straight to Google in chunks (so 3 GB files never pass through our server, and
 * a dropped connection picks up where it left off). Passing the browser's Origin
 * here is what lets Google accept those chunks from the page.
 */
export async function startUpload(p: ClientProject, file: { name: string; size: number; type: string }, origin: string, uploadedBy: string, folder: Sub = 'Reference Assets') {
  const subs = await ensureProjectFolders(p)
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
      'X-Upload-Content-Length': String(file.size),
      Origin: origin,
    },
    body: JSON.stringify({ name: safeName(file.name), parents: [subs[folder]], appProperties: { uploadedBy: uploadedBy.slice(0, 100) } }),
  })
  const location = res.headers.get('location')
  if (!res.ok || !location) throw new Error(`drive upload start ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return location
}

/** Confirms a file sits in one of this project's folders before we hand it out. */
export async function fileInProject(p: ClientProject, fileId: string) {
  const subs = await ensureProjectFolders(p)
  const f = await drive<{ id: string; name: string; mimeType: string; size?: string; parents?: string[]; trashed: boolean }>(
    `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,parents,trashed`,
  )
  const allowed = new Set(Object.values(subs))
  return !f.trashed && f.parents?.some((x) => allowed.has(x)) ? f : null
}

const EXPORTS: Record<string, [string, string]> = {
  'application/vnd.google-apps.document': ['application/pdf', '.pdf'],
  'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  'application/vnd.google-apps.presentation': ['application/pdf', '.pdf'],
}

/** Streams the file from Google to the browser. Google Docs/Sheets/Slides are exported. */
export async function downloadStream(f: { id: string; name: string; mimeType: string; size?: string }, range?: string | null) {
  const exp = EXPORTS[f.mimeType]
  const url = exp
    ? `${API}/files/${f.id}/export?mimeType=${encodeURIComponent(exp[0])}`
    : `${API}/files/${f.id}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, ...(range && !exp ? { Range: range } : {}) } })
  if (!res.ok && res.status !== 206) throw new Error(`drive download ${res.status}`)
  const name = exp ? f.name.replace(/\.[^.]+$/, '') + exp[1] : f.name
  return { res, name, type: exp ? exp[0] : f.mimeType }
}
