import { requireAccess } from '@/portal/current'
import { today } from '@/portal/library'
import { QuoteList } from '@/portal/quote-list'
import { quoteExpired } from '@/portal/quotes'
import { EmptyMark } from '@/portal/ui'

export const metadata = { title: 'Quotes' }

export default async function Quotes() {
  const { quotes } = await requireAccess()
  const t = today()
  const open = quotes.filter((q) => !q.signature && !quoteExpired(q, t))
  const rest = quotes.filter((q) => !open.includes(q))

  return (
    <div className="wrap p-home">
      <section className="p-hello">
        <span className="eyebrow">Quotes</span>
        <h1 className="h1">Your quotes</h1>
        <p className="body-lg muted" style={{ margin: 0 }}>
          {open.length ? `${open.length === 1 ? 'One quote is' : `${open.length} quotes are`} ready for your signature.` : 'Every quote we’ve sent you, signed and kept here for reference.'}
        </p>
      </section>

      {!quotes.length && (
        <div className="p-empty-page">
          <EmptyMark />
          <p className="muted">No quotes yet. When we send you one, it’ll be here.</p>
        </div>
      )}

      {open.length > 0 && <QuoteList id="open-h" label="Waiting for your signature" quotes={open} t={t} />}
      {rest.length > 0 && <QuoteList id="past-h" label="Signed and past quotes" quotes={rest} t={t} />}
    </div>
  )
}
