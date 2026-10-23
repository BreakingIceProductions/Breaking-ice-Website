import 'server-only'
import { SITE_URL } from '@/lib/site'
import { signLinkToken } from './auth'
import { driveReady, emailReady } from './config'
import { addActivity, allProjects, claimDeliverable, cleanSignInGuards, freshState, getPortalSettings, producerFor, updateDeliverableState } from './data'
import { ensureProjectFolders } from './drive'
import { fill, sendEmail, versionEmail } from './email'
import type { ClientProject, Deliverable } from './types'
import { syncVimeo } from './vimeo'

/**
 * Runs every 10 minutes (GitHub Actions now; Vercel Cron once on Pro).
 *
 *  New version   status = Awaiting feedback, a review link is set, and 10 minutes have
 *                passed since it became ready → one email to every contact on the client.
 *                The wait bundles several changes and gives you a window to tick
 *                “Don’t send”. One email per version, never per comment.
 *  Reminder      once per version that is still not approved: 2 days before Feedback due,
 *                or after N days (Portal settings, default 7) when there’s no due date.
 *                Never sooner than a day after the first email.
 *  Folders       every active project gets its Drive folders, and renames follow the Studio.
 *
 *  Each email is claimed before it's sent (a write that only succeeds if nothing changed
 *  since we read the project), so a run that's cut short or overlaps another can never
 *  send the same email twice. If a send fails, it's logged rather than retried.
 */

const MIN = 60_000
const DAY = 86_400_000
const HOLD = 10 * MIN

const dateLabel = (d?: string) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : undefined

async function emailContacts(p: ClientProject, d: Deliverable, kind: 'new' | 'reminder', settings: Awaited<ReturnType<typeof getPortalSettings>>) {
  const to = p.client.contacts.filter((c) => c.getsEmails !== false && c.email)
  const producer = producerFor(p, settings)
  const vars = { title: d.title, version: d.version, due: dateLabel(d.feedbackDue) }
  let sent = 0
  const failed: string[] = []
  for (const c of to) {
    const name = c.name.split(' ')[0]
    const token = await signLinkToken(c.email.toLowerCase(), `/portal/${p.slug}`, 7 * 24 * 60)
    const intro =
      kind === 'new'
        ? fill(settings.newVersionIntro, { name })
        : fill(d.viewedVersion === d.version ? settings.reminderIntroViewed : settings.reminderIntroUnviewed, { name })
    const mail = versionEmail({
      kind,
      subject: fill(kind === 'new' ? settings.newVersionSubject : settings.reminderSubject, vars),
      intro,
      projectTitle: p.title,
      org: p.client.organizationName,
      title: d.title,
      version: d.version,
      notes: d.notes,
      length: d.length,
      due: vars.due,
      thumbUrl: d.thumbUrl,
      portalUrl: `${SITE_URL}/portal/auth?token=${encodeURIComponent(token)}`,
      shareUrl: d.shareUrl,
      signOff: settings.signOff,
      producerPhone: producer?.phone,
    })
    // One bad address must never stop (or repeat) the others.
    try {
      const r = await sendEmail({ to: [c.email], bcc: settings.copyTo ? [settings.copyTo] : undefined, ...mail })
      if (r.ok) sent++
      else if (r.reason === 'not-configured') return { sent, total: to.length, configured: false }
    } catch (e) {
      failed.push(`${c.email}: ${String(e).slice(0, 120)}`)
    }
    await new Promise((r) => setTimeout(r, 600)) // stay under the email service's rate limit
  }
  return { sent, total: to.length, configured: true, failed }
}

type Settings = Awaited<ReturnType<typeof getPortalSettings>>

export async function runScheduler(now = Date.now()) {
  const started = Date.now()
  const settings = await getPortalSettings()
  const projects = await allProjects()
  const log: string[] = []

  // 1. Vimeo, then emails, so slow folder work can't push them past the time limit.
  for (const p of projects) {
    if (p.status === 'delivered') continue
    try {
      await syncVimeo(p, log).catch((e) => log.push(`vimeo failed for ${p.title}: ${String(e).slice(0, 120)}`))
      await projectEmails(p, now, settings, log)
    } catch (e) {
      log.push(`project failed: ${p.title}: ${String(e).slice(0, 160)}`)
    }
  }

  // 2. Drive folders, while there's time left in this run (the next run picks up the rest).
  if (driveReady()) {
    for (const p of projects) {
      if (Date.now() - started > 40_000) break
      if (p.status === 'delivered' && p.driveFolderId) continue
      await ensureProjectFolders(p).catch((e) => log.push(`folders failed for ${p.title}: ${String(e).slice(0, 120)}`))
    }
  }

  await cleanSignInGuards()
  return { projects: projects.length, log }
}

async function projectEmails(p: ClientProject, now: number, settings: Settings, log: string[]) {
  for (const d of p.deliverables ?? []) {
    if (d.status !== 'awaiting-feedback') continue
    const v = d.version || 1

    // First time we see this version as ready: start the 10-minute hold.
    if (d.readyVersion !== v || !d.readyAt) {
      await updateDeliverableState(p._id, d._key, { readyVersion: v, readyAt: new Date(now).toISOString() })
      log.push(`hold started: ${p.title} / ${d.title} v${v}`)
      continue
    }

    const isNew = d.notifiedVersion !== v
    let due = false
    if (isNew) due = now - Date.parse(d.readyAt) >= HOLD && Boolean(d.shareUrl)
    else if (d.remindedVersion !== v && d.notifiedAt && !d.dontEmail) {
      const notified = Date.parse(d.notifiedAt)
      const at = d.feedbackDue ? Date.parse(`${d.feedbackDue}T09:00:00-06:00`) - 2 * DAY : notified + (settings.reminderDays || 7) * DAY
      due = now >= at && now - notified >= DAY
    }
    if (!due) continue
    // Not set up yet: leave it waiting so it goes out once email is connected.
    if (!d.dontEmail && !emailReady()) continue

    // Claim it against the latest state record, then send.
    const fresh = await freshState(p._id)
    const cur = fresh?.deliverables?.find((x) => x._key === d._key)
    if (!fresh || !cur) continue
    if (isNew ? cur.notifiedVersion === v : cur.remindedVersion === v) continue
    const stamp = new Date(now).toISOString()
    const claim = isNew
      ? d.dontEmail
        ? { notifiedVersion: v, remindedVersion: v, notifiedAt: stamp }
        : { notifiedVersion: v, notifiedAt: stamp }
      : { remindedVersion: v }
    if (!(await claimDeliverable(p._id, fresh._rev, d._key, claim))) {
      log.push(`skipped (another run has it): ${d.title} v${v}`)
      continue
    }
    if (isNew && d.dontEmail) {
      log.push(`skipped (don't send): ${d.title} v${v}`)
      continue
    }

    const r = await emailContacts(p, { ...d, version: v }, isNew ? 'new' : 'reminder', settings)
    if (isNew) await addActivity(p._id, `Version ${v} of ${d.title} is ready for review`, 'version')
    log.push(`${isNew ? 'new-version' : 'reminder'} email: ${d.title} v${v} → ${r.sent}/${r.total}${r.failed?.length ? ` · failed: ${r.failed.join('; ')}` : ''}`)
  }
}
