import 'server-only'

/**
 * The Slack app's settings (Vercel env). Each part turns on when its settings exist:
 *  - pings with buttons: SLACK_BOT_TOKEN + SLACK_CHANNEL_ID (otherwise SLACK_WEBHOOK_URL, plain text, as before)
 *  - the two-way chat and the buttons themselves: also SLACK_SIGNING_SECRET + SLACK_OWNER_ID
 * Nothing here is ever sent to the browser or echoed back to Slack.
 */
export const slackEnv = {
  /** Bot User OAuth Token (xoxb-…), from the Slack app's "OAuth & Permissions" page. */
  botToken: process.env.SLACK_BOT_TOKEN?.trim() || '',
  /** "Signing Secret" from the Slack app's "Basic Information" page. */
  signingSecret: process.env.SLACK_SIGNING_SECRET?.trim() || '',
  /** The channel the back office's pings go to (C…). */
  channelId: process.env.SLACK_CHANNEL_ID?.trim() || '',
  /** Josh's Slack member ID (U…). The bot ignores everyone else. */
  ownerId: process.env.SLACK_OWNER_ID?.trim() || '',
}

/** Pings can go out through the bot (with buttons). */
export const slackBotReady = () => Boolean(slackEnv.botToken && slackEnv.channelId)
/** The events and interactivity endpoints can accept requests. */
export const slackChatReady = () => Boolean(slackEnv.botToken && slackEnv.signingSecret && slackEnv.ownerId)
