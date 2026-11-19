'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Task = { id: string; title: string; where: string; late?: string }
type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; connected: boolean; tasks: Task[] }

/** Today's TickTick tasks. Fetched after the page is up, so a slow TickTick never holds the page back. */
export function TodayTasks() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let live = true
    fetch('/api/admin/today-tasks', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setState({ status: 'ready', connected: Boolean(d.connected), tasks: Array.isArray(d.tasks) ? d.tasks : [] }))
      .catch(() => live && setState({ status: 'error' }))
    return () => {
      live = false
    }
  }, [])

  const connected = state.status === 'ready' && state.connected
  return (
    <section className="p-card td-card" aria-labelledby="td-tasks-h">
      <div className="a-card-head">
        <h2 id="td-tasks-h" className="a-h2">Today’s tasks</h2>
        {connected && (
          <a className="text-link small" href="https://ticktick.com/webapp" target="_blank" rel="noopener noreferrer">
            Open TickTick<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      <div aria-live="polite" className="td-card">
        {state.status === 'loading' ? (
          <p className="muted small a-empty">Checking TickTick…</p>
        ) : state.status === 'error' ? (
          <p className="muted small a-empty">Couldn’t reach TickTick just now. Reload to try again.</p>
        ) : !state.connected ? (
          <p className="muted small a-empty">
            <Link className="text-link" href="/admin/settings">Connect TickTick</Link> to see what’s due today.
          </p>
        ) : state.tasks.length ? (
          <ul className="a-tasks">
            {state.tasks.map((task) => (
              <li key={task.id}>
                <span className="a-box" aria-hidden="true" />
                <span className="stack">
                  <span>{task.title}</span>
                  <span className="muted small">
                    {task.where}
                    {task.late ? ` · due ${task.late}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small a-empty">Nothing due today.</p>
        )}
      </div>
      {connected && <p className="muted small a-empty">Tick things off in TickTick.</p>}
    </section>
  )
}
