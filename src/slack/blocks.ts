/**
 * Block Kit pieces for the back office's Slack messages. Plain data, no imports.
 * Action ids the interactivity endpoint (src/app/api/slack/interact) understands:
 *   sugg_accept / sugg_dismiss   value: the lead suggestion's _key
 *   recap_send                   value: "<clientId>|<YYYY-MM>"
 *   pending_confirm / pending_cancel   value: a pending entry id (src/slack/pending.ts)
 *   open                         a link button; nothing to do server side
 */

export type SlackText = { type: 'mrkdwn' | 'plain_text'; text: string; emoji?: boolean }
export type SlackConfirm = { title: SlackText; text: SlackText; confirm: SlackText; deny: SlackText }
export type SlackButton = {
  type: 'button'
  text: SlackText
  action_id: string
  value?: string
  url?: string
  style?: 'primary' | 'danger'
  confirm?: SlackConfirm
}
export type SlackBlock = { type: string; block_id?: string; [k: string]: unknown }

/** Slack mrkdwn treats < > & as markup: escape them in anything that came from data or a person. */
export const slackEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const plain = (text: string): SlackText => ({ type: 'plain_text', text: text.slice(0, 75), emoji: false })

/** Section text is capped at 3000 characters by Slack. */
export const section = (text: string): SlackBlock => ({ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2990) || ' ' } })
export const context = (text: string): SlackBlock => ({ type: 'context', elements: [{ type: 'mrkdwn', text: text.slice(0, 2990) || ' ' }] })
export const divider = (): SlackBlock => ({ type: 'divider' })
export const actions = (buttons: SlackButton[]): SlackBlock => ({ type: 'actions', elements: buttons.slice(0, 25) })

export const button = (label: string, action_id: string, value: string, opts: { style?: 'primary' | 'danger'; confirm?: { title: string; text: string; yes: string } } = {}): SlackButton => ({
  type: 'button',
  text: plain(label),
  action_id,
  value: value.slice(0, 2000),
  ...(opts.style && { style: opts.style }),
  ...(opts.confirm && {
    confirm: { title: plain(opts.confirm.title), text: { type: 'plain_text', text: opts.confirm.text.slice(0, 300) }, confirm: plain(opts.confirm.yes), deny: plain('Not yet') },
  }),
})

export const linkButton = (label: string, url: string): SlackButton => ({ type: 'button', text: plain(label), action_id: 'open', url })

/** The buttons under a "new possible lead" ping. */
export const suggestionButtons = (key: string, adminUrl: string): SlackButton[] => [
  button('Accept lead', 'sugg_accept', key, { style: 'primary' }),
  button('Dismiss', 'sugg_dismiss', key),
  linkButton('Open in back office', adminUrl),
]

/** The buttons under a "recap drafted" ping. The recap sent is the one saved in the back office when the button is tapped. */
export const recapButtons = (clientId: string, month: string, pageUrl: string): SlackButton[] => [
  button('Approve and send', 'recap_send', `${clientId}|${month}`, {
    style: 'primary',
    confirm: { title: 'Send the recap?', text: 'This emails the saved recap to every contact on this client who gets emails. It can’t be unsent.', yes: 'Send it' },
  }),
  linkButton('Open in back office', pageUrl),
]
