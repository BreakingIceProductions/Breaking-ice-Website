/**
 * Browser side of a Google Drive resumable upload, shared by the client portal and
 * the back office. The file goes straight to Google in chunks; a dropped connection
 * waits, asks Google how far it got, and carries on.
 */

const CHUNK = 8 * 1024 * 1024 // multiple of 256 KiB, as Google requires

export const fmtSize = (n?: number) =>
  n === undefined ? '' : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`
export const fmtEta = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s left` : s < 3600 ? `${Math.round(s / 60)} min left` : `${(s / 3600).toFixed(1)} h left`)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Put = { status: number; next?: number; body?: string }

/** One PUT to Google's upload address. Resolves with where Google says we are. */
function put(session: string, file: File, start: number, end: number, onBytes: (n: number) => void, onXhr: (x: XMLHttpRequest) => void): Promise<Put> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    onXhr(xhr)
    xhr.open('PUT', session)
    if (end > start) {
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`)
      xhr.upload.onprogress = (e) => onBytes(start + e.loaded)
    } else {
      xhr.setRequestHeader('Content-Range', `bytes */${file.size}`) // "how much did you get?"
    }
    xhr.onload = () => {
      const range = xhr.getResponseHeader('Range') // e.g. bytes=0-8388607 (when exposed)
      const m = range && /bytes=0-(\d+)/.exec(range)
      resolve({ status: xhr.status, next: m ? Number(m[1]) + 1 : xhr.status === 308 && end > start ? end : undefined, body: xhr.responseText })
    }
    xhr.onerror = () => reject(new Error('network'))
    xhr.onabort = () => reject(new Error('aborted'))
    xhr.send(end > start ? file.slice(start, end) : null)
  })
}

export type SendResult = { ok: true; id?: string } | { ok: false; reason: 'expired' | 'cancelled' | 'unsteady' | 'failed' }

export async function sendResumable(opts: {
  file: File
  session: string
  from: number
  cancelled: () => boolean
  onProgress: (sent: number, eta?: string) => void
  onPause: (message: string) => void
  onXhr: (x: XMLHttpRequest) => void
}): Promise<SendResult> {
  const { file, session, cancelled, onProgress, onPause, onXhr } = opts
  const total = file.size
  let start = opts.from
  let tries = 0
  const t0 = Date.now()
  const s0 = start
  const idOf = (body?: string) => {
    try {
      return (JSON.parse(body ?? '') as { id?: string }).id
    } catch {
      return undefined
    }
  }
  try {
    while (start < total) {
      if (cancelled()) return { ok: false, reason: 'cancelled' }
      const end = Math.min(start + CHUNK, total)
      try {
        const r = await put(session, file, start, end, (n) => {
          const rate = (n - s0) / Math.max(1, (Date.now() - t0) / 1000)
          onProgress(n, rate > 0 ? fmtEta((total - n) / rate) : undefined)
        }, onXhr)
        if (r.status === 200 || r.status === 201) return { ok: true, id: idOf(r.body) }
        if (r.status === 308) {
          start = r.next ?? end
          onProgress(start)
          tries = 0
          continue
        }
        if (r.status === 404 || r.status === 410) return { ok: false, reason: 'expired' }
        throw new Error(`status ${r.status}`)
      } catch {
        if (cancelled()) return { ok: false, reason: 'cancelled' }
        // Connection dropped: wait, ask Google how far it got, and carry on.
        tries++
        onPause(navigator.onLine ? 'Reconnecting…' : 'Waiting for your connection…')
        await wait(Math.min(30_000, 1000 * 2 ** Math.min(tries, 5)))
        while (!navigator.onLine) await wait(2000)
        try {
          const s = await put(session, file, 0, 0, () => {}, onXhr)
          if (s.status === 200 || s.status === 201) return { ok: true, id: idOf(s.body) }
          if (s.status === 308) start = s.next ?? 0
        } catch {
          /* try again next loop */
        }
        if (tries > 40) return { ok: false, reason: 'unsteady' }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
