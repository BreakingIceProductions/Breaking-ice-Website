import { checkLocalSession, localAppend, localReceived } from '@/galleries/drive'

export const runtime = 'nodejs'

/**
 * Local development only: a stand-in for Google Drive's resumable upload address, so the
 * gallery uploader's "originals to Drive" path can be tried on a laptop with no Google settings.
 * Answers like Google: 308 + Range while bytes are missing, 200 + {id} once the file is whole.
 */
export async function PUT(req: Request) {
  const q = new URL(req.url).searchParams
  const s = checkLocalSession(q.get('id') ?? '', q.get('f') ?? '', q.get('t') ?? '', q.get('s') ?? '')
  if (!s) return new Response('Not found', { status: 404 })
  const have = await localReceived(s.id)
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers.get('content-range') ?? '')
  const done = () => Response.json({ id: s.id, name: 'original', size: String(s.total) }, { status: 200 })
  const resume = (n: number) => new Response(null, { status: 308, headers: n > 0 ? { Range: `bytes=0-${n - 1}` } : {} })

  if (!range) return have >= s.total ? done() : resume(have)
  const start = Number(range[1])
  if (Number(range[3]) !== s.total) return new Response('Bad range', { status: 400 })
  if (start !== have) return resume(have)
  const body = new Uint8Array(await req.arrayBuffer())
  await localAppend(s.id, s.folder, body)
  const now = have + body.length
  return now >= s.total ? done() : resume(now)
}
