import '../../../css/admin-pages.css'
import '../../../css/admin-simple-a.css'
import '../../../css/admin-simple-d.css'
import '../../../css/admin-calendar.css'
import { HelpTip } from '@/admin/ui/help-tip'
import { StateDot } from '@/admin/ui/viz-d'
import { requireAdmin } from '@/admin/auth'
import { adminEnv, calendarReady, googleOAuthReady, icloudReady, ticktickReady, zohoReady } from '@/admin/config'
import { allCalendars, calendarPrefs } from '@/admin/calendar-feed'
import { googleConnection, googleRedirect, hasGmailScope } from '@/admin/gcal'
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

const NAMES: Record<string, string> = { ticktick: 'TickTick', zoho: 'Zoho Books', wispr: 'Wispr Flow', google: 'Google' }

export default async function Settings({ searchParams }: Props) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const [tt, zoho, wispr, guests, gcal, cals, prefs] = await Promise.all([
    ticktickConnection().catch(() => null),
    zohoConnection().catch(() => null),
    wisprConnection().catch(() => null),
    listGuests(),
    googleConnection().catch(() => null),
    allCalendars().catch(() => null),
    calendarPrefs().catch(() => ({ defaultCalendar: undefined })),
  ])
  const writable = (cals?.calendars ?? []).filter((c) => c.writable)
  const icloudProblem = cals?.problems.find((p) => p.source === 'icloud')?.text
  const googleProblem = cals?.problems.find((p) => p.source === 'google')?.text
  const sa = serviceAccountEmail()
  const notice = sp.connected
    ? `${NAMES[sp.connected] ?? sp.connected} is connected.`
    : sp.saved === 'calendar'
      ? 'Saved. New events go to that calendar unless you pick another.'
    : sp.error === 'calendar'
      ? 'That calendar can’t take new events. Pick another.'
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
  const state = (on: boolean, ready: boolean, onText = 'Connected', since?: string) => (
    <StateDot tone={on ? 'on' : 'off'} label={on && since ? since : undefined}>{on ? onText : ready ? 'Not connected' : 'Not set up'}</StateDot>
  )

  return (
    <div className="a-page a-narrow">
      <header className="a-head">
        <h1 className="a-h1 sa-h1">Settings</h1>
      </header>
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="p-card" aria-labelledby="h-conns">
        <h2 id="h-conns" className="a-h2">Connections</h2>
        <ul className="sd-conns">
          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>Zoho Books</strong>
              <HelpTip label="About Zoho Books">
                {zoho
                  ? `Connected to ${zoho.orgName ?? 'your organisation'} since ${fmtDate(zoho.connectedAt)}. Makes customers and draft invoices; you send each invoice yourself from Zoho Books.`
                  : 'Makes customers and draft invoices (deposit, balance and portal payment requests). You send each invoice yourself from Zoho Books.'}
              </HelpTip>
            </div>
            {state(Boolean(zoho), zohoReady(), 'Connected', zoho ? `Connected to ${zoho.orgName ?? 'your organisation'} since ${fmtDate(zoho.connectedAt)}` : undefined)}
            <div className="sd-conn-action">{zoho ? disconnect('zoho', 'Zoho Books') : connect('zoho', 'Zoho Books')}</div>
            {zoho && zohoNeedsReconnect(zoho) && <p className="sd-conn-extra err">Disconnect and connect again so card payments from the portal are recorded in Zoho Books.</p>}
            <details className="ap-details sd-conn-more">
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

          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>TickTick</strong>
              <HelpTip label="About TickTick">{tt ? `Connected since ${fmtDate(tt.connectedAt)}. ` : ''}Each project gets its own list, and each stage adds its checklist with due dates.</HelpTip>
            </div>
            {state(Boolean(tt), ticktickReady(), 'Connected', tt ? `Connected since ${fmtDate(tt.connectedAt)}` : undefined)}
            <div className="sd-conn-action">{tt ? disconnect('ticktick', 'TickTick') : connect('ticktick', 'TickTick')}</div>
            {!ticktickReady() && (
              <details className="ap-details sd-conn-more">
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

          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>Wispr Flow</strong>
              <HelpTip label="About Wispr Flow">{wispr ? `Connected since ${fmtDate(wispr.connectedAt)}. ` : ''}Lets us find the call with a lead and draft the email from its notes. Read only: nothing in Wispr Flow is changed.</HelpTip>
            </div>
            {state(Boolean(wispr), wisprReady(), 'Connected', wispr ? `Connected since ${fmtDate(wispr.connectedAt)}` : undefined)}
            <div className="sd-conn-action">{wispr ? disconnect('wispr', 'Wispr Flow') : connect('wispr', 'Wispr Flow')}</div>
            {!wispr && (
              <details className="ap-details sd-conn-more">
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

          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>Google</strong>
              <HelpTip label="About Google">{gcal ? `Connected${gcal.email ? ` as ${gcal.email}` : ''} since ${fmtDate(gcal.connectedAt)}. ` : ''}Covers Calendar and Email. Every calendar on your Google account shows on the Calendar page, and you can add and change events there. Email from the people at your clients and leads shows on the Emails page, and replies you write there are sent from your Gmail, so they’re in your Sent folder and in Spark too.</HelpTip>
            </div>
            {state(Boolean(gcal), googleOAuthReady(), 'Connected', gcal ? `Connected${gcal.email ? ` as ${gcal.email}` : ''} since ${fmtDate(gcal.connectedAt)}` : undefined)}
            <div className="sd-conn-action">{gcal ? disconnect('google', 'Google') : googleOAuthReady() ? <a className="btn btn-secondary btn-sm" href="/api/admin/google/connect">Connect<span className="sr-only"> Google</span></a> : checkAgain('Google')}</div>
            <p className="sd-conn-extra">{gcal && !hasGmailScope(gcal) ? <>Covers: Calendar. Email isn’t included yet. <a className="text-link" href="/api/admin/google/connect">Reconnect Google to include email</a></> : 'Covers: Calendar (read and change events) and Email (read client mail, mark it read, send replies)'}</p>
            {gcal && googleProblem && <p className="sd-conn-extra err">{googleProblem}</p>}
            {!gcal && (
              <details className="ap-details sd-conn-more">
                <summary>{googleOAuthReady() ? 'How connecting works' : 'Setup steps'}</summary>
                {googleOAuthReady() ? (
                  <p className="small m0">You’ll sign in to Google and allow calendar and Gmail access. Only you can connect it; guests and view-only sign-ins can’t.</p>
                ) : (
                  <ol className="a-steps small">
                    <li>In <a className="text-link" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer">Google Cloud</a>, in the project that has the portal’s service account, turn on the Google Calendar API and the Gmail API.</li>
                    <li>Under APIs &amp; Services → OAuth consent screen, set it up as <strong>Internal</strong> (or External and press <strong>Publish app</strong>: apps left in Testing are signed out every 7 days).</li>
                    <li>Under Credentials, create an OAuth client ID of type <strong>Web application</strong>. Authorized redirect URIs: <code>{googleRedirect()}</code> and <code>http://localhost:3107/api/admin/google/callback</code></li>
                    <li>In Vercel, add <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code>, then redeploy.</li>
                    <li>Come back here and press Connect.</li>
                  </ol>
                )}
              </details>
            )}
          </li>

          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>iCloud calendars</strong>
              <HelpTip label="About iCloud calendars">Your Apple calendars show on the Calendar page, and you can add and change events there. Repeating iCloud events open in Apple Calendar to change.</HelpTip>
            </div>
            {state(icloudReady() && !icloudProblem, false, 'Connected')}
            <div className="sd-conn-action">{icloudReady() && !icloudProblem ? null : checkAgain('iCloud calendars')}</div>
            {icloudReady() && icloudProblem && <p className="sd-conn-extra err">{icloudProblem}</p>}
            <details className="ap-details sd-conn-more">
              <summary>{icloudReady() ? 'Details' : 'Setup steps'}</summary>
              {icloudReady() ? (
                <p className="small m0">Signed in with the Apple ID in <code>ICLOUD_APPLE_ID</code> and an app-specific password. To stop it, revoke that password at appleid.apple.com.</p>
              ) : (
                <ol className="a-steps small">
                  <li>Go to <a className="text-link" href="https://account.apple.com" target="_blank" rel="noopener noreferrer">account.apple.com</a> and sign in.</li>
                  <li>Open <strong>Sign-In and Security</strong> → <strong>App-Specific Passwords</strong>, press +, and call it “Breaking Ice back office”. Copy the password it shows.</li>
                  <li>In Vercel, add <code>ICLOUD_APPLE_ID</code> (your Apple ID email) and <code>ICLOUD_APP_PASSWORD</code> (that password), then redeploy.</li>
                  <li>Come back here and press Check again.</li>
                </ol>
              )}
            </details>
          </li>

          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>Project dates calendar</strong>
              <HelpTip label="About the project dates calendar">Shoots, travel, meetings and milestones go on a separate “Breaking Ice Projects” Google calendar, so your phone has them too. Your own events are never touched.</HelpTip>
            </div>
            {state(calendarReady(), false)}
            <div className="sd-conn-action">{calendarReady() ? null : checkAgain('the project dates calendar')}</div>
            <details className="ap-details sd-conn-more">
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

          <li className="sd-conn">
            <div className="sd-conn-name">
              <strong>Review storage</strong>
              <HelpTip label="About review storage">Holds the review copies for the review room. Clients and guests watch from short-lived private links; Vimeo links keep working as before.</HelpTip>
            </div>
            {state(r2Ready(), false, 'Ready')}
            <div className="sd-conn-action">{r2Ready() ? null : checkAgain('review storage')}</div>
            <details className="ap-details sd-conn-more">
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

      <section className="p-card" aria-labelledby="h-cal" id="calendars">
        <div className="a-card-head">
          <h2 id="h-cal" className="a-h2">Calendar</h2>
          <HelpTip label="About the main work calendar">New events on the Calendar page go here unless you pick another calendar for that event. Changes to an existing event always go back to the calendar it came from.</HelpTip>
        </div>
        {writable.length ? (
          <form action="/api/admin/calendar/default" method="post" className="sd-cal-form">
            <div className="field">
              <label htmlFor="sd-cal">Main work calendar</label>
              <select id="sd-cal" name="calendar" className="input" defaultValue={writable.some((c) => c.id === prefs.defaultCalendar) ? prefs.defaultCalendar : writable[0].id} disabled={admin.viewOnly}>
                {['Google', 'iCloud'].map((acct) => {
                  const list = writable.filter((c) => c.account === acct)
                  return list.length ? (
                    <optgroup key={acct} label={acct}>
                      {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ) : null
                })}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={admin.viewOnly}>Save</button>
          </form>
        ) : (
          <p className="m0 small">Connect Google or iCloud above to pick where new events go.</p>
        )}
      </section>

      <section className="p-card" aria-labelledby="h-access">
        <div className="a-card-head">
          <h2 id="h-access" className="a-h2">Full access</h2>
          <HelpTip label="How to change who has full access">Set <code>ADMIN_EMAILS</code> in Vercel, then redeploy.</HelpTip>
        </div>
        <p className="m0">{adminEnv.emails.join(', ')}</p>
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
