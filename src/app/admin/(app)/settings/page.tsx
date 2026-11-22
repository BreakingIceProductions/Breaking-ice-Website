import '../../../css/admin-pages.css'
import { requireAdmin } from '@/admin/auth'
import { adminEnv, calendarReady, ticktickReady, zohoReady } from '@/admin/config'
import { fmtDate } from '@/admin/dates'
import { listGuests } from '@/admin/guests'
import { GuestsCard } from '@/admin/ui/guests-card'
import { SITE_URL } from '@/lib/site'
import { serviceAccountEmail } from '@/admin/google'
import { r2Env, r2Ready } from '@/portal/r2'
import { ticktickConnection, ticktickRedirect } from '@/admin/ticktick'
import { zohoConnection, zohoNeedsReconnect, zohoRedirect } from '@/admin/zoho'
import { lastWisprError, wisprConnection, wisprReady, wisprRedirect } from '@/admin/wispr'

export const metadata = { title: 'Settings' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }

const NAMES: Record<string, string> = { ticktick: 'TickTick', zoho: 'Zoho Books', wispr: 'Wispr Flow' }

export default async function Settings({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const [tt, zoho, wispr, guests] = await Promise.all([ticktickConnection().catch(() => null), zohoConnection().catch(() => null), wisprConnection().catch(() => null), listGuests()])
  const sa = serviceAccountEmail()
  const notice = sp.connected
    ? `${NAMES[sp.connected] ?? sp.connected} is connected.`
    : sp.disconnected
      ? 'Disconnected.'
      : sp.error === 'sample'
        ? 'Connections only work on the live site. This copy is showing sample data.'
        : sp.error === 'view-only'
          ? 'This account is view only, so it can’t connect apps.'
        : sp.error === 'wispr'
          ? (await lastWisprError()) || 'Wispr Flow didn’t allow this app to connect. Try again.'
        : sp.error === 'not-set-up' && sp.app === 'wispr'
          ? 'Wispr Flow isn’t set up on the site yet. The setup steps are under Wispr Flow below.'
        : sp.error === 'not-set-up'
          ? `${NAMES[sp.app ?? ''] ?? 'That app'} isn’t set up on the site yet. The setup steps are under it below.`
          : sp.error
            ? `Connecting ${NAMES[sp.app ?? ''] ?? ''} didn’t work. Try again. If it keeps failing, check the setup steps below.`
            : ''

  const disconnect = (app: string, label: string) => (
    <form action="/api/admin/disconnect" method="post">
      <input type="hidden" name="app" value={app} />
      <button className="btn btn-secondary btn-sm" type="submit">Disconnect<span className="sr-only"> {label}</span></button>
    </form>
  )
  const connect = (app: string, label: string) => <a className="btn btn-secondary btn-sm" href={`/api/admin/connect/${app}`}>Connect<span className="sr-only"> {label}</span></a>
  // Set up in Vercel rather than signed in to, so the row's action looks again once the steps are done.
  const checkAgain = (label: string) => <a className="btn btn-secondary btn-sm" href="/admin/settings">Check again<span className="sr-only"> for {label}</span></a>
  const state = (on: boolean, ready: boolean, onText = 'Connected') => <span className={`a-conn-state ${on ? 'on' : 'off'}`}>{on ? onText : ready ? 'Not connected' : 'Not set up yet'}</span>

  return (
    <div className="a-page a-narrow">
      <header className="a-head">
        <div className="stack ap-gap-2">
          <h1 className="a-h1">Settings</h1>
          <p className="muted m0">The apps the back office works with, and who can sign in.</p>
        </div>
      </header>
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="p-card" aria-labelledby="h-conns">
        <h2 id="h-conns" className="a-h2">Connections</h2>
        <ul className="ap-conns">
          <li className="ap-conn">
            <div>
              <div className="ap-conn-name"><strong>Zoho Books</strong>{state(Boolean(zoho), zohoReady())}</div>
              <p className="ap-conn-what">
                {zoho
                  ? `Connected to ${zoho.orgName ?? 'your organisation'} since ${fmtDate(zoho.connectedAt)}. Makes customers and draft invoices; you send each invoice yourself from Zoho Books.`
                  : 'Makes customers and draft invoices (deposit, balance and portal payment requests). You send each invoice yourself from Zoho Books.'}
              </p>
            </div>
            <div className="ap-conn-action">{zoho ? disconnect('zoho', 'Zoho Books') : connect('zoho', 'Zoho Books')}</div>
            {zoho && zohoNeedsReconnect(zoho) && <p className="ap-conn-extra err">Disconnect and connect again so card payments from the portal are recorded in Zoho Books.</p>}
            <details className="ap-details">
              <summary>{zoho || zohoReady() ? 'How it works' : 'Setup steps'}</summary>
              <div className="stack small ap-gap-2">
                <p className="m0">Deposit invoices are drafted when a project is booked and balance invoices when it’s delivered. When a client pays by card in the portal, the card fee is added to their invoice and the payment is recorded. e-Transfers and EFTs show as paid in the portal once Zoho Books has them.</p>
                {zoho && <p className="m0">Invoice lines go to {adminEnv.zohoAccountId ? 'the chosen income account' : 'Sales'}{adminEnv.zohoTaxId ? ' with GST added' : ' with no tax added (set ZOHO_TAX_ID once GST is set up in Zoho)'}, due in {adminEnv.zohoDueDays} days.</p>}
                {!zohoReady() && (
                  <ol className="a-steps">
                    <li>Go to <a className="text-link" href="https://api-console.zohocloud.ca" target="_blank" rel="noopener noreferrer">api-console.zohocloud.ca</a>, press <strong>Add Client</strong> and pick <strong>Server-based Applications</strong>. Call it “Breaking Ice back office”.</li>
                    <li>Homepage: <code>{zohoRedirect().replace(/\/api\/.*/, '')}</code>. Authorized redirect URI: <code>{zohoRedirect()}</code></li>
                    <li>Copy the Client ID and Client Secret. In Vercel, add <code>ZOHO_CLIENT_ID</code> and <code>ZOHO_CLIENT_SECRET</code>, then redeploy.</li>
                    <li>Come back here and press Connect, then Accept.</li>
                  </ol>
                )}
              </div>
            </details>
          </li>

          <li className="ap-conn">
            <div>
              <div className="ap-conn-name"><strong>TickTick</strong>{state(Boolean(tt), ticktickReady())}</div>
              <p className="ap-conn-what">{tt ? `Connected since ${fmtDate(tt.connectedAt)}. ` : ''}Each project gets its own list, and each stage adds its checklist with due dates.</p>
            </div>
            <div className="ap-conn-action">{tt ? disconnect('ticktick', 'TickTick') : connect('ticktick', 'TickTick')}</div>
            {!ticktickReady() && (
              <details className="ap-details">
                <summary>Setup steps</summary>
                <ol className="a-steps small">
                  <li>Go to <a className="text-link" href="https://developer.ticktick.com/manage" target="_blank" rel="noopener noreferrer">developer.ticktick.com/manage</a> and create an app.</li>
                  <li>OAuth redirect URL: <code>{ticktickRedirect()}</code></li>
                  <li>In Vercel, add <code>TICKTICK_CLIENT_ID</code> and <code>TICKTICK_CLIENT_SECRET</code>, then redeploy.</li>
                  <li>Come back here and press Connect.</li>
                </ol>
              </details>
            )}
          </li>

          <li className="ap-conn">
            <div>
              <div className="ap-conn-name"><strong>Wispr Flow</strong>{state(Boolean(wispr), wisprReady())}</div>
              <p className="ap-conn-what">{wispr ? `Connected since ${fmtDate(wispr.connectedAt)}. ` : ''}Lets us find the call with a lead and draft the email from its notes. Read only: nothing in Wispr Flow is changed.</p>
            </div>
            <div className="ap-conn-action">{wispr ? disconnect('wispr', 'Wispr Flow') : connect('wispr', 'Wispr Flow')}</div>
            {!wispr && (
              <details className="ap-details">
                <summary>{wisprReady() ? 'How connecting works' : 'Setup steps'}</summary>
                {wisprReady() ? (
                  <p className="small m0">You’ll sign in to Wispr Flow and allow access. If Wispr doesn’t accept this site, the reason shows here and nothing else changes.</p>
                ) : (
                  <ol className="a-steps small">
                    <li>In Wispr Flow, open Settings → MCP → “All other apps” and copy the Server URL.</li>
                    <li>In Vercel, add <code>WISPR_MCP_URL</code> with that address (no slash at the end), then redeploy.</li>
                    <li>Come back here and press Connect, then sign in. It comes back to <code>{wisprRedirect()}</code>.</li>
                  </ol>
                )}
              </details>
            )}
          </li>

          <li className="ap-conn">
            <div>
              <div className="ap-conn-name"><strong>Google Calendar</strong>{state(calendarReady(), false)}</div>
              <p className="ap-conn-what">Shoots, travel, meetings and milestones go on a separate “Breaking Ice Projects” calendar, so your own events are never touched.</p>
            </div>
            <div className="ap-conn-action">{calendarReady() ? null : checkAgain('Google Calendar')}</div>
            <details className="ap-details">
              <summary>{calendarReady() ? 'Details' : 'Setup steps'}</summary>
              {calendarReady() ? (
                <p className="small m0">Writing to <code>{adminEnv.calendarId}</code>. Turn TickTick’s own calendar sync off for these lists, or you’ll see things twice.</p>
              ) : (
                <ol className="a-steps small">
                  <li>In Google Calendar, create a calendar called “Breaking Ice Projects”.</li>
                  <li>
                    In its settings under “Share with specific people”, add {sa ? <code>{sa}</code> : 'the portal’s service account (the client_email in GOOGLE_SERVICE_ACCOUNT)'} with “Make changes to events”.
                  </li>
                  <li>In the Google Cloud project that owns that service account, turn on the Google Calendar API.</li>
                  <li>Copy the Calendar ID (Settings → Integrate calendar) into <code>GOOGLE_CALENDAR_ID</code> in Vercel, then redeploy.</li>
                  <li>Turn TickTick’s own calendar sync off for these lists, or you’ll see things twice.</li>
                </ol>
              )}
            </details>
          </li>

          <li className="ap-conn">
            <div>
              <div className="ap-conn-name"><strong>Review storage</strong>{state(r2Ready(), false, 'Ready')}</div>
              <p className="ap-conn-what">Holds the review copies for the review room. Clients and guests watch from short-lived private links; Vimeo links keep working as before.</p>
            </div>
            <div className="ap-conn-action">{r2Ready() ? null : checkAgain('review storage')}</div>
            <details className="ap-details">
              <summary>{r2Ready() ? 'Details' : 'Setup steps'}</summary>
              {r2Ready() ? (
                <p className="small m0">Cloudflare R2 bucket <code>{r2Env.bucket}</code>.</p>
              ) : (
                <ol className="a-steps small">
                  <li>In Cloudflare, create a private R2 bucket and an R2 API token with Object Read &amp; Write on that bucket only.</li>
                  <li>Set the bucket’s CORS policy (the JSON is in <code>docs/r2-setup.md</code>) so the browser can upload and play.</li>
                  <li>In Vercel, add <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>, <code>R2_SECRET_ACCESS_KEY</code> and <code>R2_BUCKET</code>, then redeploy.</li>
                </ol>
              )}
            </details>
          </li>
        </ul>
      </section>

      <section className="p-card" aria-labelledby="h-access">
        <h2 id="h-access" className="a-h2">Full access</h2>
        <p className="m0">{adminEnv.emails.join(', ')}</p>
        <details className="ap-details">
          <summary className="small muted">How to change this</summary>
          <p className="small muted m0">Set <code>ADMIN_EMAILS</code> in Vercel, then redeploy.</p>
        </details>
      </section>

      <GuestsCard
        canEdit={!admin.viewOnly}
        signInUrl={`${SITE_URL}/admin/sign-in`}
        guests={[
          ...adminEnv.viewers.map((email) => ({ email, when: 'No end date', fixed: true })),
          ...guests.map((g) => {
            const ended = g.until <= new Date().toISOString()
            return { key: g._key, email: g.email, name: g.name, ended, when: `${ended ? 'Ended' : 'Through'} ${fmtDate(g.until)}` }
          }),
        ]}
      />
    </div>
  )
}
