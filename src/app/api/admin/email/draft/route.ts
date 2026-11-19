import { aiReady, draftFromCall, findInWispr, sampleDraft, sampleFound, type DraftInput, type FoundMeeting } from '@/admin/ai-draft'
import { adminFromRequest } from '@/admin/auth'
import { getProject } from '@/admin/data'
import { callPeople } from '@/admin/email-templates'
import { callSource, GranolaError, granolaReady, listCallNotes } from '@/admin/granola'
import { wisprAccessToken, wisprConnection, WisprError } from '@/admin/wispr'
import { getPortalSettings } from '@/portal/data'
import { json } from '@/portal/http'
import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

export const runtime = 'nodejs'
// Raised from 60: "Find it for me" searches Wispr Flow with Claude before the draft is written.
// 300 is what the plan already allows (the portal's download routes use it).
export const maxDuration = 300

const MAX_PASTE = 100_000

/**
 * "Draft from a call", step two: { projectId, noteId } (a Granola note) or { projectId, text } (pasted
 * notes or a transcript) or { projectId, find: true } ("Find it for me": Claude looks for the call in
 * Wispr Flow if it's connected, else the best-matching Granola note), plus an optional { goal }.
 * Returns { subject, body } written by Claude, and for "find" which { meeting } was used.
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
  const find = b.find === true
  if (!find && !noteId && !pasted) return json({ ok: false, error: 'no-source', message: 'Pick a call from Granola, or paste some notes.' }, 400)
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

  if (admin.sample) return json({ ok: true, sample: true, ...sampleDraft(context), ...(find ? { meeting: sampleFound(context) } : {}) })
  if (!aiReady()) return json({ ok: false, error: 'ai-off', message: 'Add ANTHROPIC_API_KEY in Vercel to draft with Claude.' }, 503)

  let source: DraftInput['source']
  let meeting: FoundMeeting | undefined
  if (find) {
    const wispr = await wisprConnection().catch(() => null)
    if (wispr) {
      let token: string
      try {
        token = await wisprAccessToken()
      } catch (e) {
        if (e instanceof WisprError) return json({ ok: false, error: 'wispr', message: e.message }, 503)
        console.error('[admin] wispr token failed', e)
        return json({ ok: false, error: 'wispr', message: 'Couldn’t use the Wispr Flow sign-in. Connect it again in Settings.' }, 503)
      }
      const found = await findInWispr({ token, mcpUrl: wispr.mcpUrl, who: people, project: p.title })
      if (!found.ok) return json({ ok: false, error: 'wispr', message: found.message }, found.status)
      meeting = found.meeting
      source = { kind: 'wispr', title: found.meeting.title, text: found.text }
    } else if (granolaReady()) {
      try {
        const best = (await listCallNotes(people)).find((n) => n.match)
        if (!best) return json({ ok: false, error: 'not-found', message: 'No Granola call with them in the last 60 days. Pick one from the Granola list, or paste the notes.' }, 404)
        const note = await callSource(best.id)
        meeting = { id: best.id, title: note.title, at: best.at }
        source = { kind: 'granola', title: note.title, text: note.text }
      } catch (e) {
        if (e instanceof GranolaError) return json({ ok: false, error: 'granola', message: e.message }, 502)
        console.error('[admin] granola find failed', e)
        return json({ ok: false, error: 'failed', message: 'Couldn’t read Granola. Try again, or paste the notes.' }, 502)
      }
    } else return json({ ok: false, error: 'no-finder', message: 'Connect Wispr Flow in Settings (or add GRANOLA_API_KEY in Vercel) so Claude can find the call. Or paste the notes.' }, 503)
  } else if (noteId) {
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
  return json({ ok: true, subject: r.subject, body: r.body, ...(r.warning ? { warning: r.warning } : {}), ...(meeting ? { meeting: { title: meeting.title, at: meeting.at } } : {}) })
}
