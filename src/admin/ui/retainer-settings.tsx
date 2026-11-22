'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BRAND_COLOURS, type BrandFonts, type RetainerSettings } from '@/retainer/types'

/** POSTs JSON to a back-office route; never throws. */
export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; message?: string; sample?: boolean; [k: string]: unknown }> {
  const r = await fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const j = r ? await r.json().catch(() => ({})) : {}
  return { ...j, ok: Boolean(r?.ok && j.ok !== false) }
}

type BrandColour = (typeof BRAND_COLOURS)[number]
type Form = {
  active: boolean; perMonth: string; rollover: 'none' | 'next-month'; publerWorkspaceId: string; accent: string; startMonth: string; endMonth: string
  displayName: string; fonts: BrandFonts
  /** Brand colours, kept apart from the retainer's own `accent`. */
  colours: Record<BrandColour, string>
}

const HEX = /^#[0-9a-fA-F]{6}$/
const COLOUR_LABEL: Record<BrandColour, { label: string; hint: string }> = {
  primary: { label: 'Brand surface', hint: 'Hero band, with white text' },
  accent: { label: 'Accent', hint: 'Rules and progress fill only' },
  accentText: { label: 'Accent as small text', hint: 'Eyebrows on white' },
  ink: { label: 'Text', hint: 'Body and headings' },
  muted: { label: 'Muted text', hint: 'Captions' },
  surfaceAlt: { label: 'Alternate surface', hint: 'Cards and tiles' },
  border: { label: 'Hairlines', hint: 'Card outlines, rules' },
}

/** The retainer's settings: on/off, deliverables a month, rollover, Publer workspace, brand colour, first and last month. */
export function RetainerSettingsForm({ clientId, settings, readOnly }: { clientId: string; settings: RetainerSettings; readOnly?: boolean }) {
  const router = useRouter()
  const [f, setF] = useState<Form>({
    active: settings.active,
    perMonth: settings.perMonth ? String(settings.perMonth) : '',
    rollover: settings.rollover ?? 'none',
    publerWorkspaceId: settings.publerWorkspaceId ?? '',
    accent: settings.accent ?? '',
    startMonth: settings.startMonth ?? '',
    endMonth: settings.endMonth ?? '',
    displayName: settings.brand?.displayName ?? '',
    fonts: settings.brand?.fonts ?? 'breaking-ice',
    colours: Object.fromEntries(BRAND_COLOURS.map((k) => [k, settings.brand?.[k] ?? ''])) as Record<BrandColour, string>,
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const setColour = (k: BrandColour, v: string) => setF((x) => ({ ...x, colours: { ...x.colours, [k]: v } }))
  const badAccent = Boolean(f.accent) && !HEX.test(f.accent)
  const badBrand = BRAND_COLOURS.filter((k) => f.colours[k] && !HEX.test(f.colours[k]))
  const bad = badAccent || badBrand.length > 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (bad) return setMsg('Colours must look like #1f6feb.')
    setBusy(true)
    setMsg('')
    const { displayName, fonts, active, perMonth, rollover, publerWorkspaceId, accent, startMonth, endMonth } = f
    const brand = { displayName: displayName.trim(), fonts, ...Object.fromEntries(BRAND_COLOURS.map((k) => [k, f.colours[k].trim()])) }
    const r = await postJson('/api/admin/retainer/settings', {
      clientId,
      settings: { active, rollover, startMonth, endMonth, perMonth: Number(perMonth) || 0, publerWorkspaceId: publerWorkspaceId.trim(), accent: accent.trim(), brand },
    })
    setBusy(false)
    if (!r.ok) return setMsg(r.message || 'That didn’t save. Reload the page and try again.')
    setMsg(r.sample ? 'Sample data: the settings weren’t saved.' : 'Settings saved.')
    router.refresh()
  }

  return (
    <form className="stack rt-stack" onSubmit={save}>
      <fieldset className="rt-fieldset" disabled={readOnly || busy}>
        <legend className="sr-only">Retainer settings</legend>
        <div className="rt-form">
          <label className="small a-check rt-wide">
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Retainer is on (shows their retainer portal and counts the month)
          </label>
          <div className="field">
            <label htmlFor="rt-per">Deliverables a month</label>
            <input id="rt-per" className="input" inputMode="numeric" autoComplete="off" value={f.perMonth} onChange={(e) => set('perMonth', e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </div>
          <div className="field">
            <label htmlFor="rt-roll">Unused ones</label>
            <select id="rt-roll" className="input" value={f.rollover} onChange={(e) => set('rollover', e.target.value === 'next-month' ? 'next-month' : 'none')}>
              <option value="none">Start fresh each month</option>
              <option value="next-month">Carry into next month only</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rt-start">First month</label>
            <input id="rt-start" className="input" type="month" value={f.startMonth} onChange={(e) => set('startMonth', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rt-end">Last month <span className="muted small">(if it has ended)</span></label>
            <input id="rt-end" className="input" type="month" value={f.endMonth} onChange={(e) => set('endMonth', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rt-ws">Publer workspace ID</label>
            <input id="rt-ws" className="input" autoComplete="off" spellCheck={false} value={f.publerWorkspaceId} onChange={(e) => set('publerWorkspaceId', e.target.value)} placeholder="Empty: no social posts" />
          </div>
          <div className="field">
            <label htmlFor="rt-accent">Brand colour</label>
            <div className="rt-color">
              <input type="color" aria-label="Pick the brand colour" value={/^#[0-9a-fA-F]{6}$/.test(f.accent) ? f.accent : '#1f6feb'} onChange={(e) => set('accent', e.target.value)} />
              <input id="rt-accent" className="input" autoComplete="off" spellCheck={false} value={f.accent} onChange={(e) => set('accent', e.target.value.trim().slice(0, 7))} placeholder="#1f6feb" aria-invalid={badAccent || undefined} />
            </div>
          </div>
        </div>
        <fieldset className="rt-fieldset rt-brand-set">
          <legend className="p-label">Brand</legend>
          <p className="small muted rt-brand-note">
            Optional. Fill these in and their retainer page wears the client’s own design system, with Breaking Ice as a small credit. Leave them all empty for the Breaking Ice look. Logo files are set in the editor, under the client’s Retainer, Brand.
          </p>
          <div className="rt-form">
            <div className="field">
              <label htmlFor="rt-bname">Name on the page</label>
              <input id="rt-bname" className="input" autoComplete="off" value={f.displayName} onChange={(e) => set('displayName', e.target.value.slice(0, 80))} placeholder="e.g. North-Wright Air" />
            </div>
            <div className="field">
              <label htmlFor="rt-bfonts">Type</label>
              <select id="rt-bfonts" className="input" value={f.fonts} onChange={(e) => set('fonts', e.target.value === 'geometric' ? 'geometric' : 'breaking-ice')}>
                <option value="breaking-ice">Breaking Ice type</option>
                <option value="geometric">Geometric: Jost headings, Montserrat body</option>
              </select>
            </div>
            {BRAND_COLOURS.map((k) => {
              const v = f.colours[k]
              const invalid = Boolean(v) && !HEX.test(v)
              return (
                <div className="field" key={k}>
                  <label htmlFor={`rt-b-${k}`}>{COLOUR_LABEL[k].label} <span className="muted small">({COLOUR_LABEL[k].hint})</span></label>
                  <div className="rt-color">
                    <input type="color" aria-label={`Pick: ${COLOUR_LABEL[k].label}`} value={HEX.test(v) ? v : '#ffffff'} onChange={(e) => setColour(k, e.target.value)} />
                    <input id={`rt-b-${k}`} className="input" autoComplete="off" spellCheck={false} value={v} onChange={(e) => setColour(k, e.target.value.trim().slice(0, 7))} placeholder="#rrggbb" aria-invalid={invalid || undefined} />
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>
      </fieldset>
      {!readOnly && (
        <div className="row-wrap">
          <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || bad}>{busy ? 'Saving…' : 'Save settings'}</button>
          <span className="small muted" role="status">{msg}</span>
        </div>
      )}
    </form>
  )
}
