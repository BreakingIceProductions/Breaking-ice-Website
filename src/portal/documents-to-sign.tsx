import Link from 'next/link'
import type { SignRequest } from './sign-docs'
import { fmtDate } from './ui'
import './sign-doc.css'

/** On the client's project page: their documents to sign, and the ones they've signed. Nothing shows when there are none. */
export function DocumentsToSign({ requests }: { requests: SignRequest[] }) {
  const list = requests.filter((r) => r.status !== 'void')
  if (!list.length) return null
  const open = list.filter((r) => r.status !== 'signed').length
  return (
    <section id="sign" className="p-card p-anchor" aria-labelledby="sign-h">
      <h2 id="sign-h" className="p-label">Documents to sign</h2>
      <ul className="p-sign-list">
        {list.map((r) => (
          <li key={r._id}>
            <span className="stack" style={{ gap: 2 }}>
              <strong>{r.snapshot.title}</strong>
              <span className="muted small">{r.status === 'signed' && r.signature ? `Signed by ${r.signature.name}, ${fmtDate(r.signature.at, { month: 'short', day: 'numeric', year: 'numeric' })}` : `For ${r.recipient.name} · sent ${fmtDate(r.createdAt)}`}</span>
            </span>
            <Link className={`btn btn-sm ${r.status === 'signed' ? 'btn-secondary' : 'btn-primary'}`} href={`/portal/documents/${r._id}`}>
              {r.status === 'signed' ? 'View' : 'Read and sign'}<span className="sr-only">: {r.snapshot.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {open > 0 && <p className="muted small" style={{ margin: 0 }}>{open === 1 ? 'One document is' : `${open} documents are`} waiting for a signature.</p>}
    </section>
  )
}
