import 'server-only'
import { SITE_URL } from '@/lib/site'
import { signLinkToken } from './auth'
import { driveReady } from './config'
import { addActivity, allProjects, getPortalSettings, producerFor, updateDeliverable } from './data'
import { ensureProjectFolders } from './drive'
import { fill, sendEmail, versionEmail } from './email'
import type { ClientProject, Deliverable } from './types'

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
    const r = await sendEmail({ to: [c.email], bcc: settings.copyTo ? [settings.copyTo] : undefined, ...mail })
    if (r.ok) sent++
  }
  return { sent, total: to.length }
}

export async function runScheduler(now = Date.now()) {
  const settings = await getPortalSettings()
  const projects = await allProjects()
  const log: string[] = []

  for (const p of projects) {
    if (driveReady() && (p.status !== 'delivered' || !p.driveFolderId)) {
      try {
        await ensureProjectFolders(p)
      } catch (e) {
        log.push(`folders failed for ${p.title}: ${String(e).slice(0, 120)}`)
      }
    }
    if (p.status === 'delivered') continue

    for (const d of p.deliverables ?? []) {
      if (d.status !== 'awaiting-feedback') continue
      const v = d.version || 1

      // First time we see this version as ready: start the 10-minute hold.
      if (d.readyVersion !== v || !d.readyAt) {
        await updateDeliverable(p._id, d._key, { readyVersion: v, readyAt: new Date(now).toISOString() })
        log.push(`hold started: ${p.title} / ${d.title} v${v}`)
        continue
      }

      if (d.notifiedVersion !== v) {
        if (now - Date.parse(d.readyAt) < HOLD || !d.shareUrl) continue
        if (d.dontEmail) {
          await updateDeliverable(p._id, d._key, { notifiedVersion: v, remindedVersion: v, notifiedAt: new Date(now).toISOString() })
          log.push(`skipped (don't send): ${d.title} v${v}`)
          continue
        }
        const r = await emailContacts(p, d, 'new', settings)
        if (r.sent || !r.total) {
          await updateDeliverable(p._id, d._key, { notifiedVersion: v, notifiedAt: new Date(now).toISOString() })
          await addActivity(p._id, `Version ${v} of ${d.title} is ready for review`, 'version')
        }
        log.push(`new-version email: ${d.title} v${v} → ${r.sent}/${r.total}`)
        continue
      }

      if (d.remindedVersion !== v && d.notifiedAt) {
        const notified = Date.parse(d.notifiedAt)
        const due = d.feedbackDue
          ? Date.parse(`${d.feedbackDue}T09:00:00-06:00`) - 2 * DAY
          : notified + (settings.reminderDays || 7) * DAY
        if (now >= due && now - notified >= DAY) {
          const r = await emailContacts(p, d, 'reminder', settings)
          if (r.sent || !r.total) await updateDeliverable(p._id, d._key, { remindedVersion: v })
          log.push(`reminder: ${d.title} v${v} → ${r.sent}/${r.total}`)
        }
      }
    }
  }
  return { projects: projects.length, log }
}
