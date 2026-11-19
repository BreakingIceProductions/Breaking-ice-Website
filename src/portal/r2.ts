import 'server-only'
import { createHash, createHmac } from 'node:crypto'

/**
 * Review copies of new cuts live in a private Cloudflare R2 bucket (S3-compatible).
 * Nothing here talks to an SDK: every request is a presigned URL (AWS Signature V4,
 * query-string form), made with Node's crypto. The browser only ever sees short-lived
 * URLs for one object; the bucket name in them is fine, the keys never leave the server.
 * Setup: docs/r2-setup.md.
 */
export const r2Env = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
}

export const r2Ready = () => Boolean(r2Env.accountId && r2Env.accessKeyId && r2Env.secretAccessKey && r2Env.bucket)

/** RFC 3986 encoding, as SigV4 wants it (everything but A–Z a–z 0–9 - _ . ~). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const encPath = (p: string) => p.split('/').map(enc).join('/')
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s, 'utf8').digest()

export type PresignInput = {
  method: string
  host: string
  /** Absolute path, not yet encoded (e.g. /bucket/review/a b.mp4). */
  path: string
  query?: Record<string, string>
  expires: number
  accessKeyId: string
  secretAccessKey: string
  region: string
  service?: string
  now?: Date
}

/** A presigned URL (SigV4, query auth, unsigned payload). Exported for the signer check against AWS's test vector. */
export function presign(i: PresignInput) {
  const now = i.now ?? new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const day = amzDate.slice(0, 8)
  const service = i.service ?? 's3'
  const scope = `${day}/${i.region}/${service}/aws4_request`
  const query: Record<string, string> = {
    ...i.query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${i.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604_800, Math.round(i.expires)))),
    'X-Amz-SignedHeaders': 'host',
  }
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k])}`)
    .join('&')
  const canonicalPath = encPath(i.path)
  const canonical = [i.method.toUpperCase(), canonicalPath, canonicalQuery, `host:${i.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
  const kDate = hmac(`AWS4${i.secretAccessKey}`, day)
  const kSigning = hmac(hmac(hmac(kDate, i.region), service), 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex')
  return `https://${i.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

const host = () => `${r2Env.accountId}.r2.cloudflarestorage.com`

function r2Url(method: string, key: string, query: Record<string, string> = {}, expires = 900) {
  if (!r2Ready()) throw new Error('R2 is not set up')
  return presign({
    method,
    host: host(),
    path: `/${r2Env.bucket}/${key.replace(/^\/+/, '')}`,
    query,
    expires,
    accessKeyId: r2Env.accessKeyId,
    secretAccessKey: r2Env.secretAccessKey,
    region: 'auto',
  })
}

/** Plays (or downloads, with a file name) one object. Default two hours. */
export function presignGet(key: string, opts: { expires?: number; download?: string } = {}) {
  const query: Record<string, string> = {}
  if (opts.download) {
    const ascii = opts.download.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
    query['response-content-disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${enc(opts.download)}`
  }
  return r2Url('GET', key, query, opts.expires ?? 2 * 3600)
}

/** A single PUT of a whole (small) object. */
export const presignPut = (key: string, expires = 3600) => r2Url('PUT', key, {}, expires)

/** One part of a multipart upload, straight from the browser. */
export const presignPart = (key: string, uploadId: string, partNumber: number, expires = 3 * 3600) =>
  r2Url('PUT', key, { partNumber: String(partNumber), uploadId }, expires)

async function call(method: string, key: string, query: Record<string, string>, body?: string, contentType?: string) {
  const res = await fetch(r2Url(method, key, query, 300), {
    method,
    body,
    headers: contentType ? { 'Content-Type': contentType } : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`r2 ${method} ${res.status}: ${text.slice(0, 200)}`)
  return text
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]

/** Starts a multipart upload and returns its upload ID. */
export async function createMultipart(key: string, contentType = 'video/mp4') {
  const xml = await call('POST', key, { uploads: '' }, undefined, contentType)
  const id = tag(xml, 'UploadId')
  if (!id) throw new Error('r2: no UploadId in reply')
  return id
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Joins the uploaded parts into the object. Parts are { n, etag } in any order. */
export async function completeMultipart(key: string, uploadId: string, parts: { n: number; etag: string }[]) {
  const body = `<CompleteMultipartUpload>${[...parts]
    .sort((a, b) => a.n - b.n)
    .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${xmlEsc(p.etag)}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`
  const xml = await call('POST', key, { uploadId }, body, 'application/xml')
  // R2, like S3, can answer 200 with an error document.
  if (/<Error>/.test(xml)) throw new Error(`r2 complete failed: ${xml.slice(0, 200)}`)
}

export async function abortMultipart(key: string, uploadId: string) {
  await call('DELETE', key, { uploadId })
}

export async function deleteObject(key: string) {
  await call('DELETE', key, {})
}

/** Size of an object, or null if it isn't there. */
export async function headObject(key: string) {
  const res = await fetch(r2Url('HEAD', key, {}, 300), { method: 'HEAD', cache: 'no-store' })
  if (!res.ok) return null
  return Number(res.headers.get('content-length') ?? 0)
}
