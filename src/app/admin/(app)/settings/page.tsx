import { requireAdmin } from '@/admin/auth'
import { adminEnv, calendarReady, ticktickReady, zohoReady } from '@/admin/config'
import { fmtDay } from '@/admin/dates'
import { serviceAccountEmail } from '@/admin/google'
import { ticktickConnection, ticktickRedirect } from '@/admin/ticktick'
import { zohoConnection, zohoRedirect } from '@/admin/zoho'

export const metadata = { title: 'Settings' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }

const NAMES: Record<string, string> = { ticktick: 'TickTick', zoho: 'Zoho Books' }

export default async function Settings({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams
  const [tt, zoho] = await Promise.all([ticktickConnection().catch(() => null), zohoConnection().catch(() => null)])
  const sa = serviceAccountEmail()
  const notice = sp.connected
    ? `${NAMES[sp.connected] ?? sp.connected} is connected.`
    : sp.disconnected
      ? 'Disconnected.'
      : sp.error === 'sample'
        ? 'Connections need the real site settings; this machine is showing sample data.'
        : sp.error === 'not-set-up'
          ? `${NAMES[sp.app ?? ''] ?? 'That app'} needs its client ID and secret in Vercel first (steps below).`
          : sp.error
            ? `Connecting ${NAMES[sp.app ?? ''] ?? ''} didn’t work. Try again; if it keeps failing, check the redirect address matches exactly.`
            : ''

  return (
    <div className="a-page a-narrow">
      <header className="a-head">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <span className="eyebrow">Back office</span>
          <h1 className="a-h1">Settings</h1>
        </div>
      </header>
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="p-card" aria-labelledby="h-zoho">
        <div className="a-card-head">
          <h2 id="h-zoho" className="a-h2">Zoho Books</h2>
          <span className={`a-conn-state ${zoho ? 'on' : 'off'}`}>{zoho ? 'Connected' : zohoReady() ? 'Not connected' : 'Not set up'}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Creates customers and draft invoices (deposit when booked, balance when delivered). You send every invoice yourself from Zoho Books.</p>
        {zoho ? (
          <>
            <p className="small" style={{ margin: 0 }}>Connected to <strong>{zoho.orgName ?? 'your organisation'}</strong> since {fmtDay(zoho.connectedAt.slice(0, 10))}. Invoice lines go to {adminEnv.zohoAccountId ? 'the chosen income account' : 'Sales'}{adminEnv.zohoTaxId ? ' with GST added' : ' with no tax added (set ZOHO_TAX_ID once GST is set up in Zoho)'}, due in {adminEnv.zohoDueDays} days.</p>
            <form action="/api/admin/disconnect" method="post"><input type="hidden" name="app" value="zoho" /><button className="btn btn-secondary btn-sm" type="submit">Disconnect</button></form>
          </>
        ) : zohoReady() ? (
          <a className="btn btn-primary" href="/api/admin/connect/zoho">Connect Zoho Books</a>
        ) : (
          <ol className="a-steps small">
            <li>Go to <a className="text-link" href="https://api-console.zohocloud.ca" target="_blank" rel="noopener noreferrer">api-console.zohocloud.ca</a>, press <strong>Add Client</strong> and pick <strong>Server-based Applications</strong>. Call it “Breaking Ice back office”.</li>
            <li>Homepage: <code>{zohoRedirect().replace(/\/api\/.*/, '')}</code>. Authorized redirect URI: <code>{zohoRedirect()}</code></li>
            <li>Copy the Client ID and Client Secret. In Vercel, add <code>ZOHO_CLIENT_ID</code> and <code>ZOHO_CLIENT_SECRET</code>, then redeploy.</li>
            <li>Come back here and press Connect Zoho Books, then Accept.</li>
          </ol>
        )}
      </section>

      <section className="p-card" aria-labelledby="h-tt">
        <div className="a-card-head">
          <h2 id="h-tt" className="a-h2">TickTick</h2>
          <span className={`a-conn-state ${tt ? 'on' : 'off'}`}>{tt ? 'Connected' : ticktickReady() ? 'Not connected' : 'Not set up'}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Each project gets its own list, and each stage adds its checklist with due dates.</p>
        {tt ? (
          <>
            <p className="small" style={{ margin: 0 }}>Connected since {fmtDay(tt.connectedAt.slice(0, 10))}.</p>
            <form action="/api/admin/disconnect" method="post"><input type="hidden" name="app" value="ticktick" /><button className="btn btn-secondary btn-sm" type="submit">Disconnect</button></form>
          </>
        ) : ticktickReady() ? (
          <a className="btn btn-primary" href="/api/admin/connect/ticktick">Connect TickTick</a>
        ) : (
          <ol className="a-steps small">
            <li>Go to <a className="text-link" href="https://developer.ticktick.com/manage" target="_blank" rel="noopener noreferrer">developer.ticktick.com/manage</a> and create an app.</li>
            <li>OAuth redirect URL: <code>{ticktickRedirect()}</code></li>
            <li>In Vercel, add <code>TICKTICK_CLIENT_ID</code> and <code>TICKTICK_CLIENT_SECRET</code>, then redeploy.</li>
            <li>Come back here and press Connect TickTick.</li>
          </ol>
        )}
      </section>

      <section className="p-card" aria-labelledby="h-cal">
        <div className="a-card-head">
          <h2 id="h-cal" className="a-h2">Google Calendar</h2>
          <span className={`a-conn-state ${calendarReady() ? 'on' : 'off'}`}>{calendarReady() ? 'Connected' : 'Not set up'}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Shoots, travel, meetings and milestones go on a separate “Breaking Ice Projects” calendar, so your own events are never touched. Turn TickTick’s own calendar sync off for these lists, or you’ll see things twice.</p>
        {calendarReady() ? (
          <p className="small" style={{ margin: 0 }}>Writing to <code>{adminEnv.calendarId}</code>.</p>
        ) : (
          <ol className="a-steps small">
            <li>In Google Calendar, create a calendar called “Breaking Ice Projects”.</li>
            <li>
              In its settings under “Share with specific people”, add {sa ? <code>{sa}</code> : 'the portal’s service account (the client_email in GOOGLE_SERVICE_ACCOUNT)'} with “Make changes to events”.
            </li>
            <li>In the Google Cloud project that owns that service account, turn on the Google Calendar API.</li>
            <li>Copy the Calendar ID (Settings → Integrate calendar) into <code>GOOGLE_CALENDAR_ID</code> in Vercel, then redeploy.</li>
          </ol>
        )}
      </section>

      <section className="p-card" aria-labelledby="h-access">
        <h2 id="h-access" className="a-h2">Who can sign in</h2>
        <p className="small" style={{ margin: 0 }}>{adminEnv.emails.join(', ')}</p>
        <p className="muted small" style={{ margin: 0 }}>Change this with <code>ADMIN_EMAILS</code> in Vercel.</p>
      </section>
    </div>
  )
}
