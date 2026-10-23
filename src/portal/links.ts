/**
 * Documents & links on a client project. Google Drive files and Docs download
 * through the portal (the server fetches them), so clients never land on Google.
 * Works for anything shared as "Anyone with the link"; anything else just opens.
 */

export type ProjectLink = { _key: string; title?: string; url?: string; note?: string }

const driveId = (url: string) =>
  url.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/)?.[1] ??
  url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]{10,})/)?.[1]

const DOC_EXPORT: Record<string, { format: string; ext: string; kind: string }> = {
  document: { format: 'pdf', ext: 'pdf', kind: 'Google Doc' },
  spreadsheets: { format: 'xlsx', ext: 'xlsx', kind: 'Google Sheet' },
  presentation: { format: 'pdf', ext: 'pdf', kind: 'Google Slides' },
}

/** Where the server can fetch the file itself, or null if it can only be opened. */
export function downloadSource(url: string): { fetchUrl: string; ext?: string } | null {
  const id = driveId(url)
  if (id) return { fetchUrl: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` }
  const doc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{10,})/)
  if (doc) {
    const e = DOC_EXPORT[doc[1]]
    return { fetchUrl: `https://docs.google.com/${doc[1]}/d/${doc[2]}/export?format=${e.format}`, ext: e.ext }
  }
  return null
}

/** A plain word for what the link is, so the client knows what they'll get. */
export function linkKind(url: string) {
  const doc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\//)
  if (doc) return `${DOC_EXPORT[doc[1]].kind}, downloads as ${DOC_EXPORT[doc[1]].ext.toUpperCase()}`
  if (/drive\.google\.com\/drive\/folders/.test(url)) return 'Folder'
  if (driveId(url)) return 'File'
  if (/\.pdf($|\?)/i.test(url)) return 'PDF'
  if (/vimeo\.com/.test(url)) return 'Vimeo'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
