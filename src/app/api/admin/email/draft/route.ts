import { aiReady, draftFromCall, sampleDraft, type DraftInput } from '@/admin/ai-draft'
import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { callPeople } from '@/admin/email-templates'
import { callSource, GranolaError, granolaReady } from '@/admin/granola'
import { getPortalSettings } from '@/portal/data'
import { json } from '@/portal/http'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PASTE = 100_000

/**
 * "Draft from a call", step two: { projectId, noteId } (a Granola note) or { projectId, text } (pasted
 * notes or a transcript), plus an optional { goal }. Returns { subject, body } written by Claude.
 * Nothing is sent or saved: the composer fills in, and Josh reads, edits and presses Send himself.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req)
  if (!admin || admin.viewOnly) return json({ ok: false, error: 'signed-out', message: 'This sign-in can’t do that, or it has expired.' }, 401)
  const b = await req.json().catch(() => ({}))
  const p = await getProject(String(b.projectId ?? ''))
  if (!p) return json({ ok: false, error: 'not-found', message: 'That project isn’t there any more. Reload the page.' }, 404)

  const noteId = typeof b.noteId === 'string' ? b.noteId.trim() : ''
  const pasted = typeof b.text === 'string' ? b.text.replace(/\r\n?/g, '\n').trim() : ''
  const goal = typeof b.goal === 'string' ? b.goal.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
  if (!noteId && !pasted) return json({ ok: false, error: 'no-source', message: 'Pick a call from Granola, or paste some notes.' }, 400)
  if (pasted.length > MAX_PASTE) return json({ ok: false, error: 'too-long', message: `That’s a lot of text. Keep it under ${MAX_PASTE.toLocaleString('en-CA')} characters.` }, 400)

  const settings = await getPortalSettings()
  const people = callPeople(p)
  const context: DraftInput['context'] = {
    firstName: people.person.firstName,
    name: people.person.name,
    company: people.company,
    project: p.title,
    stage: PIPELINE_STAGES.find((s) => s.value === p.pipelineStage)?.title,
    signOff: settings.signOff,
  }

  if (admin.sample) return json({ ok: true, sample: true, ...sampleDraft(context) })
  if (!aiReady()) return json({ ok: false, error: 'ai-off', message: 'Add ANTHROPIC_API_KEY in Vercel to draft with Claude.' }, 503)

  let source: DraftInput['source']
  if (noteId) {
    if (!granolaReady()) return json({ ok: false, error: 'granola-off', message: 'Connect Granola: add GRANOLA_API_KEY in Vercel. Or paste the notes instead.' }, 503)
    try {
      const note = await callSource(noteId)
      source = { kind: 'granola', title: note.title, text: note.text }
    } catch (e) {
      if (e instanceof GranolaError) return json({ ok: false, error: 'granola', message: e.message }, e.status === 404 || e.status === 400 ? e.status : 502)
      console.error('[admin] granola note failed', e)
      return json({ ok: false, error: 'failed', message: 'Couldn’t read that note from Granola. Try again, or paste the notes.' }, 502)
    }
  } else source = { kind: 'paste', text: pasted }

  const r = await draftFromCall({ source, goal, context })
  if (!r.ok) return json({ ok: false, error: 'draft', message: r.message }, r.status)
  return json({ ok: true, subject: r.subject, body: r.body, ...(r.warning ? { warning: r.warning } : {}) })
}
