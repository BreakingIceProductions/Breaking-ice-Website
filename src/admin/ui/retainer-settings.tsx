'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { RetainerSettings } from '@/retainer/types'

/** POSTs JSON to a back-office route; never throws. */
export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; message?: string; sample?: boolean; [k: string]: unknown }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const j = r ? await r.json().catch(() => ({})) : {}
  return { ...j, ok: Boolean(r?.ok && j.ok !== false) }
}

type Form = { active: boolean; perMonth: string; rollover: 'none' | 'next-month'; publerWorkspaceId: string; accent: string; startMonth: string; endMonth: string }

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
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const badAccent = Boolean(f.accent) && !/^#[0-9a-fA-F]{6}$/.test(f.accent)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (badAccent) return setMsg('The colour must look like #1f6feb.')
    setBusy(true)
    setMsg('')
    const r = await postJson('/api/admin/retainer/settings', {
      clientId,
      settings: { ...f, perMonth: Number(f.perMonth) || 0, publerWorkspaceId: f.publerWorkspaceId.trim(), accent: f.accent.trim() },
    })
    setBusy(false)
    if (!r.ok) return setMsg(r.message || 'That didn’t save. Reload the page and try again.')
    setMsg(r.sample ? 'Sample data: the settings weren’t saved.' : 'Settings saved.')
    router.refresh()
  }

  return (
    <form className="stack" style={{ gap: 'var(--space-4)' }} onSubmit={save}>
      <fieldset disabled={readOnly || busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
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
      </fieldset>
      {!readOnly && (
        <div className="row-wrap">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || badAccent}>{busy ? 'Saving…' : 'Save settings'}</button>
          <span className="small muted" role="status">{msg}</span>
        </div>
      )}
    </form>
  )
}
