/**
 * One icon per kind of file, worked out from the name, the file type or a link,
 * so nothing needs a naming convention. Used in the portal and the back office.
 */

export type FileKind = 'video' | 'image' | 'design' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'audio' | 'archive' | 'font' | 'folder' | 'link' | 'file'

const BY_EXT: Record<string, FileKind> = {
  mp4: 'video', mov: 'video', m4v: 'video', avi: 'video', mkv: 'video', webm: 'video', mxf: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', heic: 'image', tif: 'image', tiff: 'image', svg: 'image', raw: 'image', dng: 'image', cr3: 'image', arw: 'image',
  ai: 'design', psd: 'design', indd: 'design', afdesign: 'design', afphoto: 'design', afpub: 'design', af: 'design', eps: 'design', fig: 'design', sketch: 'design', xd: 'design',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', pages: 'doc', rtf: 'doc', txt: 'doc', md: 'doc', odt: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', numbers: 'sheet', ods: 'sheet',
  ppt: 'slides', pptx: 'slides', key: 'slides', odp: 'slides',
  mp3: 'audio', wav: 'audio', aif: 'audio', aiff: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
}

const LABEL: Record<FileKind, string> = {
  video: 'Video', image: 'Image', design: 'Design file', pdf: 'PDF', doc: 'Document', sheet: 'Spreadsheet',
  slides: 'Slides', audio: 'Audio', archive: 'Zip', font: 'Font', folder: 'Folder', link: 'Link', file: 'File',
}

export function fileKind({ name, mime, url }: { name?: string; mime?: string; url?: string }): FileKind {
  if (url) {
    if (/vimeo\.com|youtube\.com|youtu\.be/.test(url)) return 'video'
    if (/docs\.google\.com\/document/.test(url)) return 'doc'
    if (/docs\.google\.com\/spreadsheets/.test(url)) return 'sheet'
    if (/docs\.google\.com\/presentation/.test(url)) return 'slides'
    if (/drive\.google\.com\/drive\/folders/.test(url)) return 'folder'
  }
  if (mime) {
    if (mime === 'application/vnd.google-apps.folder') return 'folder'
    if (mime === 'application/vnd.google-apps.document') return 'doc'
    if (mime === 'application/vnd.google-apps.spreadsheet') return 'sheet'
    if (mime === 'application/vnd.google-apps.presentation') return 'slides'
  }
  const ext = (name ?? url ?? '').split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  if (BY_EXT[ext]) return BY_EXT[ext]
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  return url ? 'link' : 'file'
}

export const kindLabel = (k: FileKind) => LABEL[k]

const GLYPH: Record<FileKind, React.ReactNode> = {
  video: <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />,
  image: <><circle cx="10" cy="10" r="1.5" /><path d="M7 17l4-4 2.5 2.5L15 14l2 3" /></>,
  design: <><path d="M12 7l4 8h-8z" /><path d="M10 17h4" /></>,
  pdf: <><path d="M8 11h8M8 14h8M8 17h5" /></>,
  doc: <><path d="M8 11h8M8 14h8M8 17h5" /></>,
  sheet: <><rect x="8" y="10" width="8" height="7" /><path d="M8 13.5h8M12 10v7" /></>,
  slides: <><rect x="7.5" y="10" width="9" height="6" rx=".5" /><path d="M12 16v1.5" /></>,
  audio: <path d="M8 13v2M10 11v6M12 9.5v9M14 11v6M16 13v2" />,
  archive: <path d="M12 8v1.5M12 11v1.5M12 14v1.5M11 16.5h2v2h-2z" />,
  font: <path d="M8.5 17l3.5-8 3.5 8M9.8 14h4.4" />,
  folder: null,
  link: <path d="M10.5 13.5l3-3M9.5 11.5l-1 1a2 2 0 0 0 3 3l1-1M14.5 12.5l1-1a2 2 0 0 0-3-3l-1 1" />,
  file: null,
}

/** A small tile with the file's kind drawn on it. Decorative: the name next to it says what it is. */
export function FileIcon({ kind, ext, size = 40 }: { kind: FileKind; ext?: string; size?: number }) {
  const tag = kind === 'pdf' ? 'PDF' : ext && ext.length <= 4 && kind !== 'folder' && kind !== 'link' ? ext.toUpperCase() : undefined
  return (
    <span className={`ficon ficon-${kind}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.7} height={size * 0.7} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'folder' ? (
          <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5H10l2 2h6.5A1.5 1.5 0 0 1 20 10.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
        ) : (
          <>
            <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3H14l4.5 4.5v12A1.5 1.5 0 0 1 17 21H7.5A1.5 1.5 0 0 1 6 19.5z" />
            <path d="M14 3v4.5h4.5" />
            {GLYPH[kind]}
          </>
        )}
      </svg>
      {tag && <span className="ficon-tag">{tag}</span>}
    </span>
  )
}

/** Icon straight from a file name, type or link. */
export function IconFor(props: { name?: string; mime?: string; url?: string; size?: number }) {
  const ext = props.name?.includes('.') ? props.name.split('.').pop() : undefined
  return <FileIcon kind={fileKind(props)} ext={ext} size={props.size} />
}
