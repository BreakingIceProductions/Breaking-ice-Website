import { PIPELINE_STAGES } from '@/sanity/portal/office-constants'

/**
 * Activity lines are stored as written at the time ("Moved to Final cut"). Stages have since been renamed,
 * so when a line is shown, an old stage name is swapped for today's (Final cut → Revisions).
 * `activityText('Moved to Final cut (1 step failed)')` → "Moved to Revisions (1 step failed)".
 */
const OLD_NAMES: Record<string, string> = {
  lead: 'lead', 'new lead': 'lead',
  'discovery call': 'call', call: 'call', 'call booked': 'call',
  proposal: 'proposal', 'quote to write': 'proposal',
  quote: 'quoted', quoted: 'quoted',
  booked: 'booked', onboarding: 'booked',
  preproduction: 'preproduction', 'pre-production': 'preproduction',
  shoot: 'shoot', shooting: 'shoot', filming: 'shoot',
  roughcut: 'roughcut', 'rough cut': 'roughcut', editing: 'roughcut',
  finalcut: 'finalcut', 'final cut': 'finalcut', revisions: 'finalcut',
  delivered: 'delivered', delivery: 'delivered', 'final delivery': 'delivered',
  paid: 'paid',
}

export function activityText(text: string): string {
  const m = /^(Moved (?:back )?to )(.+?)( \(.*\))?$/.exec(text)
  if (!m) return text
  const value = OLD_NAMES[m[2].trim().toLowerCase()]
  const title = value ? PIPELINE_STAGES.find((s) => s.value === value)?.title : undefined
  return title ? `${m[1]}${title}${m[3] ?? ''}` : text
}
