import 'server-only'
import { adminSampleMode } from '@/admin/config'
import { fmtAgo } from '@/admin/dates'
import { portalClient } from '@/portal/data'
import { getChat } from '@/portal/chat'
import { teamId } from '@/slack/api'
import type { ChatMessage } from '@/portal/types'

/** The client page's "Portal chat" card: the last 20 messages, read only, and the Slack channel. Shows only when chat is on or has messages. */
export async function PortalChatCard({ clientId }: { clientId: string }) {
  if (adminSampleMode()) return null
  const [c, doc] = await Promise.all([
    portalClient.fetch<{ chat?: { enabled?: boolean; slackChannelId?: string } } | null>(`*[_type == "client" && _id == $id][0]{chat}`, { id: clientId }).catch(() => null),
    getChat(clientId).catch(() => ({ messages: [] as ChatMessage[] })),
  ])
  const msgs = (doc.messages ?? []).slice(-20)
  if (!c?.chat?.enabled && !msgs.length) return null
  const channel = c?.chat?.slackChannelId
  const team = channel ? await teamId().catch(() => undefined) : undefined
  return (
    <section className="p-card" aria-labelledby="h-chat">
      <h2 id="h-chat" className="a-h2">Portal chat</h2>
      <p className="muted small m0">
        {c?.chat?.enabled ? 'On.' : 'Off (turn it on in the client’s editor).'}{' '}
        {channel ? (team ? <a className="text-link" href={`https://app.slack.com/client/${team}/${channel}`} target="_blank" rel="noopener noreferrer">Open the Slack channel<span className="sr-only"> (opens in a new tab)</span></a> : <>Slack channel {channel}</>) : 'The Slack channel is made with the first message.'}
      </p>
      {msgs.length ? (
        <ul className="stack gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {msgs.map((m) => (
            <li key={m._key} className="small">
              <strong>{m.from === 'assistant' ? (m.handoff ? 'Assistant (for Josh)' : 'Assistant') : m.who}</strong>
              <span className="muted"> · {m.tab === 'josh' ? 'Josh tab' : 'Assistant tab'} · {fmtAgo(m.at)}</span>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text.length > 400 ? `${m.text.slice(0, 400)}…` : m.text}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sc-empty">No messages yet</p>
      )}
    </section>
  )
}
