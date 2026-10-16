import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { portalEnv } from './config'
import { addActivity, allProjects, updateDeliverable, updateDeliverableState } from './data'
import type { ClientProject, Deliverable } from './types'

/**
 * Frame.io V4 webhooks carry IDs only (no names), so we match them to what you
 * pasted in the Studio:
 *   project.id  → Client project › Frame.io project link
 *   resource.id → Deliverable › Frame.io file link (new versions) or review link (views)
 * Docs: developer.adobe.com/frameio/guides/Webhooks
 */

export function verifyFrameio(raw: string, timestamp: string | null, signature: string | null) {
  if (!portalEnv.frameioSecret || !timestamp || !signature) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = 'v0=' + createHmac('sha256', portalEnv.frameioSecret).update(`v0:${timestamp}:${raw}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

type FrameioEvent = { type: string; resource?: { id: string; type: string }; project?: { id: string }; user?: { id: string } }

const has = (url: string | undefined, id: string | undefined) => Boolean(url && id && url.toLowerCase().includes(id.toLowerCase()))

export async function handleFrameio(e: FrameioEvent) {
  if (!e.project?.id) return { matched: false }
  const projects = await allProjects('defined(frameioProjectUrl)')
  const project = projects.find((p) => has(p.frameioProjectUrl, e.project!.id))
  const rid = e.resource?.id

  // A view or a version can be matched even without the project link.
  const byResource = (field: 'frameioFileUrl' | 'shareUrl') => {
    for (const p of project ? [project] : projects)
      for (const d of p.deliverables ?? []) if (has(d[field], rid)) return { p, d }
    return null
  }

  switch (e.type) {
    case 'file.versioned': {
      const hit = byResource('frameioFileUrl')
      if (hit) {
        // Frame.io may deliver an event more than once (and signed requests are valid for 5 minutes),
        // so a second bump for the same deliverable inside 5 minutes is treated as a repeat.
        if (hit.d.versionedAt && Date.now() - Date.parse(hit.d.versionedAt) < 5 * 60_000) return { matched: true, duplicate: true }
        const version = (hit.d.version || 1) + 1
        await updateDeliverableState(hit.p._id, hit.d._key, { versionedAt: new Date().toISOString() })
        await updateDeliverable(hit.p._id, hit.d._key, { version, status: 'awaiting-feedback' })
        await addActivity(hit.p._id, `Version ${version} of ${hit.d.title} uploaded`, 'version')
        return { matched: true }
      }
      if (project) await addActivity(project._id, 'A new version was uploaded in Frame.io', 'version')
      return { matched: Boolean(project) }
    }
    case 'share.viewed': {
      const hit = byResource('shareUrl')
      if (hit && hit.d.viewedVersion !== hit.d.version) {
        await updateDeliverableState(hit.p._id, hit.d._key, { viewedVersion: hit.d.version })
        await addActivity(hit.p._id, `${hit.d.title} v${hit.d.version} was viewed`, 'view')
      }
      return { matched: Boolean(hit) }
    }
    case 'comment.created':
      if (project) await addActivity(project._id, 'New comment in Frame.io', 'comment')
      return { matched: Boolean(project) }
    case 'comment.completed':
      if (project) await addActivity(project._id, 'A comment was marked done', 'comment')
      return { matched: Boolean(project) }
    default:
      return { matched: Boolean(project), ignored: true }
  }
}

export type { ClientProject, Deliverable }
