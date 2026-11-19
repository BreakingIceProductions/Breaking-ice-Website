import 'server-only'
import { randomBytes } from 'node:crypto'
import { SITE_URL } from '@/lib/site'
import { getPortalSettings, portalClient } from '@/portal/data'
import { PIPELINE_STAGES, type PipelineStage } from '@/sanity/portal/office-constants'
import { blockOptions } from './email-blocks'
import { granolaReady } from './granola'
import { wisprConnected } from './wispr'
import { adminSampleMode } from './config'
import { LIMITS, STARTER_TEMPLATES, type EmailTemplate, type TemplateVars } from './email-templates-shared'
import type { OfficeProject } from './types'

/**
 * The composer's email templates, in one free-form record in the private "portal" dataset:
 * "bo-email-templates" with a keyed `templates` list. Until it exists the starters in
 * email-templates-shared.ts are shown; the first change writes them in, so edits to a starter stick.
 */

const DOC_ID = 'bo-email-templates'
const sample = () => adminSampleMode()
const key = () => randomBytes(6).toString('hex')

/** Whatever's stored, tidied: missing fields filled, unknown stages dropped. */
const tidy = (t: Partial<EmailTemplate> & { _key: string }): EmailTemplate => ({
  _key: t._key,
  name: String(t.name ?? 'Untitled'),
  subject: String(t.subject ?? ''),
  body: String(t.body ?? ''),
  approved: t.approved === true,
  ...(t.stage && PIPELINE_STAGES.some((s) => s.value === t.stage) ? { stage: t.stage } : {}),
})

/** `saved` is false while the starters are still in use (nothing stored yet). */
export async function getEmailTemplates(): Promise<{ templates: EmailTemplate[]; saved: boolean }> {
  if (sample()) return { templates: STARTER_TEMPLATES, saved: false }
  try {
    const doc = await portalClient.fetch<{ templates?: (Partial<EmailTemplate> & { _key: string })[] } | null>(`*[_id == $id][0]{templates}`, { id: DOC_ID }, { cache: 'no-store' })
    if (!doc) return { templates: STARTER_TEMPLATES, saved: false }
    return { templates: (doc.templates ?? []).filter((t) => t?._key).map(tidy), saved: true }
  } catch (e) {
    console.error('[admin] email templates query failed', e)
    return { templates: STARTER_TEMPLATES, saved: false }
  }
}

async function ensureDoc() {
  await portalClient.createIfNotExists({ _id: DOC_ID, _type: 'boEmailTemplates', templates: STARTER_TEMPLATES.map((t) => ({ ...t })) })
}

export type TemplateInput = { name: string; subject: string; body: string; stage?: PipelineStage }

/** Checks a template from the browser. Returns an error message, or the cleaned fields. */
export function cleanTemplate(input: Record<string, unknown>): TemplateInput | string {
  const name = String(input.name ?? '').trim()
  const subject = String(input.subject ?? '').replace(/\s+/g, ' ').trim()
  const body = String(input.body ?? '').replace(/\r\n?/g, '\n').trim()
  const stage = String(input.stage ?? '')
  if (!name || name.length > LIMITS.name) return `Give it a name (up to ${LIMITS.name} characters).`
  if (!subject || subject.length > LIMITS.subject) return `The subject needs to be 1 to ${LIMITS.subject} characters.`
  if (!body || body.length > LIMITS.body) return `The email needs some wording (up to ${LIMITS.body.toLocaleString('en-CA')} characters).`
  if (stage && !PIPELINE_STAGES.some((s) => s.value === stage)) return 'Pick a stage from the list.'
  return { name, subject, body, ...(stage ? { stage: stage as PipelineStage } : {}) }
}

/**
 * Adds a template (no `templateKey`) or saves changes to one. A change to the subject or wording
 * sets it back to not approved, like the documents in the Library.
 */
export async function saveEmailTemplate(input: TemplateInput, templateKey?: string): Promise<EmailTemplate> {
  const { templates } = await getEmailTemplates()
  const before = templateKey ? templates.find((t) => t._key === templateKey) : undefined
  if (templateKey && !before) throw new Error('not-found')
  if (!before && templates.length >= LIMITS.templates) throw new Error('too-many')
  const next: EmailTemplate = {
    _key: before?._key ?? key(),
    name: input.name,
    subject: input.subject,
    body: input.body,
    approved: before ? before.approved && before.subject === input.subject && before.body === input.body : false,
    ...(input.stage ? { stage: input.stage } : {}),
  }
  if (sample()) return next
  await ensureDoc()
  const patch = portalClient.patch(DOC_ID).setIfMissing({ templates: [] })
  if (before) patch.set({ [`templates[_key=="${next._key}"]`]: next })
  else patch.append('templates', [next])
  await patch.commit({ autoGenerateArrayKeys: false })
  return next
}

export async function setEmailTemplateApproved(templateKey: string, approved: boolean) {
  if (sample()) return
  await ensureDoc()
  await portalClient.patch(DOC_ID).set({ [`templates[_key=="${templateKey}"].approved`]: approved }).commit()
}

export async function deleteEmailTemplate(templateKey: string) {
  if (sample()) return
  await ensureDoc()
  await portalClient.patch(DOC_ID).unset([`templates[_key=="${templateKey}"]`]).commit()
}

/** Keys come from the browser and go into a patch path, so only plain ones are let through. */
export const safeKey = (k: unknown) => (typeof k === 'string' && /^[\w-]{1,40}$/.test(k) ? k : '')

/**
 * What the composer needs for one project: the templates, who it goes to at first, and the fill-in values.
 * `person` is the one to write to (the lead page passes its contact); otherwise the client's first contact who gets emails.
 */
export async function composerSetup(p: OfficeProject, person?: { name?: string; email?: string }) {
  const [{ templates }, settings] = await Promise.all([getEmailTemplates(), getPortalSettings()])
  const contacts = (p.client.contacts ?? []).filter((c) => c.email)
  const who = person?.email || person?.name ? person : (contacts.find((c) => c.getsEmails !== false) ?? contacts[0])
  const name = who?.name?.trim() ?? ''
  const vars: TemplateVars = {
    firstName: name.split(/\s+/)[0] || 'there',
    name,
    company: p.client._id ? p.client.organizationName : '',
    project: p.title,
    signOff: settings.signOff,
    portalUrl: `${SITE_URL}/portal`,
  }
  // Portal blocks for this project, and whether Granola / Wispr Flow are connected (for "Draft from a call").
  const [blocks, wispr] = await Promise.all([blockOptions(p), wisprConnected()])
  return { templates, to: who?.email ?? '', vars, stage: p.pipelineStage, blocks, granola: granolaReady() || adminSampleMode(), wispr: wispr || adminSampleMode() }
}

/**
 * Who a call was with, for "Draft from a call": the person on the lead, or the client's contacts.
 * `person` is the one the email is written to (first name and full name).
 */
export function callPeople(p: OfficeProject) {
  const lead = p.office.lead ?? {}
  const contacts = (p.client.contacts ?? []).filter((c) => c.email || c.name)
  const listed = lead.email ? contacts.find((c) => c.email?.toLowerCase() === lead.email!.toLowerCase()) : undefined
  const person = listed ?? (lead.name || lead.email ? { name: lead.name ?? '', email: lead.email ?? '' } : (contacts.find((c) => c.getsEmails !== false) ?? contacts[0]))
  const name = person?.name?.trim() ?? ''
  return {
    emails: [...new Set([lead.email, ...contacts.map((c) => c.email)].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()))],
    names: [...new Set([lead.name, ...contacts.map((c) => c.name)].filter((n): n is string => Boolean(n?.trim())))],
    company: p.client._id ? p.client.organizationName : undefined,
    person: { firstName: name.split(/\s+/)[0] || '', name },
  }
}

/** Made-up details for the Library's previews. */
export async function sampleTemplateVars(): Promise<TemplateVars> {
  const settings = await getPortalSettings()
  return { firstName: 'Alex', name: 'Alex Sample', company: 'Sample Organization', project: 'Sample project', signOff: settings.signOff, portalUrl: `${SITE_URL}/portal` }
}
