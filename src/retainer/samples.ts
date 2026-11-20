import { DEMO_EMAIL } from '@/portal/samples'
import type { MonthKey, PublerPiece, RetainerItem, RetainerSettings } from './types'

/**
 * Sample mode: a made-up retainer client so the screens can be built and judged with no Sanity or
 * Publer. Nothing here is real, and nothing in sample mode is ever written or sent.
 */

export const SAMPLE_RETAINER_ID = 'sample-retainer'

export const SAMPLE_RETAINER_SETTINGS: RetainerSettings = {
  active: true,
  perMonth: 10,
  rollover: 'none',
  publerWorkspaceId: 'sample-workspace',
  accent: '#1f6feb',
}

export const sampleRetainerClient = (startMonth: MonthKey) => ({
  _id: SAMPLE_RETAINER_ID,
  organizationName: 'North Sample Air',
  contacts: [{ _key: 'c1', name: 'Alex Sample', email: DEMO_EMAIL, role: 'Marketing lead', getsEmails: true }],
  retainer: { ...SAMPLE_RETAINER_SETTINGS, startMonth },
  firstMonth: startMonth,
})

/** Days in a month, and a timestamp on a given day at a given Edmonton hour (UTC−7 in winter is close enough for samples). */
const daysIn = (m: MonthKey) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()
const at = (m: MonthKey, day: number, hour: number) => new Date(`${m}-${String(Math.min(day, daysIn(m))).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-07:00`).toISOString()

/** A few hand-made items. The current month has some still to do. */
export function sampleItems(m: MonthKey, current: boolean): RetainerItem[] {
  const files = (n: string) => [{ id: `sample-file-${m}-${n}`, name: n, mimeType: n.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', size: n.endsWith('.mp4') ? 184_000_000 : 6_400_000 }]
  return [
    { _key: `${m}-v1`, title: 'Winter ops hangar walk-through', type: 'video', status: 'delivered', deliveredAt: `${m}-08`, files: files('Hangar walkthrough 1080p.mp4') },
    { _key: `${m}-p1`, title: 'Twin Otter on skis: photo set', type: 'photo', status: 'delivered', deliveredAt: `${m}-14`, files: files('Twin Otter skis 01.jpg') },
    current
      ? { _key: `${m}-d1`, title: 'Holiday schedule graphic', type: 'design', status: 'in-progress', note: 'Waiting on final dates from dispatch.' }
      : { _key: `${m}-d1`, title: 'Holiday schedule graphic', type: 'design', status: 'delivered', deliveredAt: `${m}-20`, files: files('Holiday schedule.jpg') },
    ...(current ? [{ _key: `${m}-v2`, title: 'Pilot profile: 30-second cut', type: 'video' as const, status: 'planned' as const }] : []),
  ]
}

const POSTS = [
  { text: 'First light over the Mackenzie. Our 6:40 to Norman Wells, right on time. ✈️', type: 'photo', networks: ['instagram', 'facebook'] as const },
  { text: 'Meet Sam, one of our captains. 14 winters flying the North and still loves the morning run.', type: 'video', networks: ['instagram', 'facebook', 'linkedin'] as const },
  { text: 'Cargo tip: book perishables by Thursday noon for weekend delivery to the communities.', type: 'status', networks: ['facebook'] as const },
  { text: 'Behind the scenes: de-icing at −38 °C. It takes a crew of three and about 20 minutes.', type: 'video', networks: ['instagram', 'tiktok'] as const },
  { text: 'We’re hiring aircraft maintenance engineers in Yellowknife. Apply through our careers page.', type: 'status', networks: ['linkedin', 'facebook'] as const },
  { text: 'Thank you to the Inuvik crew for 1,000 safe departures this year.', type: 'photo', networks: ['instagram', 'facebook'] as const },
  { text: 'Holiday travel: check-in opens 90 minutes before departure at every terminal.', type: 'status', networks: ['facebook', 'instagram'] as const },
]

/** Seeded so the same month always shows the same numbers. */
const seeded = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

/** Fake Publer pieces for a month: published ones up to `nowIso`, scheduled after it. */
export function samplePieces(m: MonthKey, nowIso: string): PublerPiece[] {
  const rnd = seeded(Number(m.replace('-', '')))
  const days = [3, 6, 10, 13, 17, 22, 26]
  return POSTS.map((p, i) => {
    const when = at(m, days[i], 9 + (i % 3) * 2)
    const published = when <= nowIso
    const reach = Math.round(800 + rnd() * 4200)
    const engagement = Math.round(reach * (0.03 + rnd() * 0.07))
    return {
      id: `sample-${m}-${i}`,
      text: p.text,
      at: when,
      state: published ? 'published' : 'scheduled',
      postType: p.type,
      networks: p.networks.map((network, j) => ({
        network,
        accountName: 'North Sample Air',
        postId: `sample-${m}-${i}-${j}`,
        ...(published ? { link: `https://example.com/sample/${m}/${i}/${network}` } : {}),
      })),
      ...(published
        ? {
            metrics: {
              reach,
              engagement,
              engagementRate: Math.round((engagement / reach) * 10000) / 100,
              likes: Math.round(engagement * 0.7),
              comments: Math.round(engagement * 0.1),
              shares: Math.round(engagement * 0.12),
              saves: Math.round(engagement * 0.08),
              ...(p.type === 'video' ? { videoViews: Math.round(reach * 0.6) } : {}),
            },
          }
        : {}),
    }
  })
}
