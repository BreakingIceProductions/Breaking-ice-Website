import { requireAdmin } from '@/admin/auth'
import { adminEnv, calendarReady, ticktickReady, xeroReady } from '@/admin/config'
import { fmtDay } from '@/admin/dates'
import { serviceAccountEmail } from '@/admin/google'
import { ticktickConnection, ticktickRedirect } from '@/admin/ticktick'
import { xeroConnection, xeroRedirect } from '@/admin/xero'

export const metadata = { title: 'Settings' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }

const NAMES: Record<string, string> = { ticktick: 'TickTick', xero: 'Xero' }

export default async function Settings({ searchParams }: Props) {
  await requireAdmin()
  const sp = await searchParams
  const [tt, xero] = await Promise.all([ticktickConnection().catch(() => null), xeroConnection().catch(() => null)])
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

      <section className="p-card" aria-labelledby="h-xero">
        <div className="a-card-head">
          <h2 id="h-xero" className="a-h2">Xero</h2>
          <span className={`a-conn-state ${xero ? 'on' : 'off'}`}>{xero ? 'Connected' : xeroReady() ? 'Not connected' : 'Not set up'}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Creates contacts and draft invoices (deposit when booked, balance when delivered). You approve and send every invoice in Xero.</p>
        {xero ? (
          <>
            <p className="small" style={{ margin: 0 }}>Connected to <strong>{xero.tenantName ?? 'your organisation'}</strong> since {fmtDay(xero.connectedAt.slice(0, 10))}. Invoice lines use account {adminEnv.xeroAccountCode}{adminEnv.xeroTaxType ? ` and tax type ${adminEnv.xeroTaxType}` : ' and its default tax rate'}, due in {adminEnv.xeroDueDays} days.</p>
            <form action="/api/admin/disconnect" method="post"><input type="hidden" name="app" value="xero" /><button className="btn btn-secondary btn-sm" type="submit">Disconnect</button></form>
          </>
        ) : xeroReady() ? (
          <a className="btn btn-primary" href="/api/admin/connect/xero">Connect Xero</a>
        ) : (
          <ol className="a-steps small">
            <li>Go to <a className="text-link" href="https://developer.xero.com/app/manage" target="_blank" rel="noopener noreferrer">developer.xero.com/app/manage</a> and create a <strong>Web app</strong> called “Breaking Ice back office”.</li>
            <li>Redirect URI: <code>{xeroRedirect()}</code></li>
            <li>Copy the Client ID and generate a secret. In Vercel, add <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code>, then redeploy.</li>
            <li>Come back here and press Connect Xero. Pick the Breaking Ice organisation when Xero asks.</li>
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
