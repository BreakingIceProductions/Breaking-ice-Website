import { CalendarIcon } from '@sanity/icons/Calendar'
import { CaseIcon } from '@sanity/icons/Case'
import { CogIcon } from '@sanity/icons/Cog'
import { UsersIcon } from '@sanity/icons/Users'
import { defineArrayMember, defineField, defineType } from 'sanity'
import { officeFields, officeGroup } from './office'

/**
 * Client portal content. Lives in the private "portal" dataset, so none of it
 * (contact emails, project details) is readable without a server token.
 * Fields marked "Set automatically" are written by the website's server.
 */

export const PROJECT_STATUSES = [
  { title: 'In production', value: 'in-production' },
  { title: 'In review', value: 'in-review' },
  { title: 'Delivered', value: 'delivered' },
]

export const DELIVERABLE_STATUSES = [
  { title: 'In progress (not shown to client yet)', value: 'in-progress' },
  { title: 'Awaiting feedback', value: 'awaiting-feedback' },
  { title: 'Changes in progress', value: 'changes-requested' },
  { title: 'Approved', value: 'approved' },
]

const auto = { readOnly: true, description: 'Set automatically.' }
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const producerFields = [
  defineField({ name: 'name', type: 'string' }),
  defineField({ name: 'role', type: 'string' }),
  defineField({ name: 'email', type: 'string' }),
  defineField({ name: 'phone', type: 'string' }),
  defineField({ name: 'portrait', type: 'image', options: { hotspot: true } }),
]

export const client = defineType({
  name: 'client',
  title: 'Client',
  type: 'document',
  icon: UsersIcon,
  fields: [
    defineField({ name: 'organizationName', title: 'Organization name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'logo', type: 'image', description: 'Optional. Shown on their dashboard.' }),
    defineField({
      name: 'chat',
      title: 'Portal chat',
      description: 'A chat window in their portal: a “Josh” tab that goes to a Slack channel, and an AI assistant tab.',
      type: 'object',
      fields: [
        defineField({ name: 'enabled', title: 'Chat is on', type: 'boolean', initialValue: false }),
        defineField({ name: 'slackChannelId', title: 'Slack channel', type: 'string', readOnly: true, description: 'Made automatically with the first message.' }),
      ],
    }),
    defineField({
      name: 'contacts',
      title: 'Contacts (people who can sign in)',
      description: 'Anyone listed here can sign in with their email and sees every project for this client. Remove someone to remove their access.',
      type: 'array',
      validation: (r) => r.min(1),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'contact',
          fields: [
            defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
            defineField({
              name: 'email',
              type: 'string',
              description: 'Optional for leads saved from a call; needed before they can sign in to the portal.', validation: (r) => r.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { name: 'email' }),
            }),
            defineField({ name: 'role', type: 'string' }),
            defineField({ name: 'phone', title: 'Phone', type: 'string', description: 'Optional. Shown in the back office only, never on the portal.' }),
            defineField({ name: 'getsEmails', title: 'Gets “new version” emails', type: 'boolean', initialValue: true }),
          ],
          preview: { select: { title: 'name', subtitle: 'email' } },
        }),
      ],
    }),
    defineField({
      name: 'producer',
      title: 'Producer (optional)',
      description: 'Leave empty to use the producer in Portal settings.',
      type: 'object',
      options: { collapsible: true, collapsed: true },
      fields: producerFields,
    }),
    defineField({ name: 'driveFolderId', title: 'Google Drive folder ID', type: 'string', ...auto }),
    defineField({
      name: 'billingEmail',
      title: 'Billing email (private)',
      description: 'The email on the Zoho Books customer, where invoices go. Leave empty to use the first contact.',
      type: 'string',
      validation: (r) => r.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { name: 'email' }),
    }),
    defineField({
      name: 'portalPayments',
      title: 'Takes payments in the portal',
      description: 'Deposits and balances show in their portal with e-Transfer and EFT details, or card (Stripe) with the processing fee added. Leave off for clients invoiced in QuickBooks.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'noGst',
      title: 'No GST charged',
      description: 'For GST-exempt clients. Quotes, emails and portal payments show no GST, and Zoho Books invoices add no tax.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'retainer',
      title: 'Retainer',
      description: 'For clients on a monthly retainer: a set number of deliverables a month, shown in their retainer portal. Easier to set in the back office (Retainers).',
      type: 'object',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: 'active', title: 'Retainer is on', type: 'boolean', initialValue: false }),
        defineField({ name: 'perMonth', title: 'Deliverables a month', type: 'number', validation: (r) => r.min(0).max(500).integer() }),
        defineField({
          name: 'rollover',
          title: 'Unused deliverables',
          type: 'string',
          initialValue: 'none',
          options: { list: [{ title: 'Start fresh each month', value: 'none' }, { title: 'Carry into the next month only', value: 'next-month' }], layout: 'radio' },
        }),
        defineField({ name: 'publerWorkspaceId', title: 'Publer workspace ID', description: 'Their Publer workspace. Empty: no social posts are counted.', type: 'string' }),
        defineField({
          name: 'accent',
          title: 'Brand colour',
          description: 'The client’s main colour, #rrggbb. Used as the accent in their retainer portal.',
          type: 'string',
          validation: (r) => r.regex(/^#[0-9a-fA-F]{6}$/, { name: 'colour like #1f6feb' }),
        }),
        defineField({ name: 'startMonth', title: 'First month (YYYY-MM)', type: 'string', validation: (r) => r.regex(MONTH_RE, { name: 'YYYY-MM' }) }),
        defineField({ name: 'endMonth', title: 'Last month (YYYY-MM, if it has ended)', type: 'string', validation: (r) => r.regex(MONTH_RE, { name: 'YYYY-MM' }) }),
        defineField({
          name: 'brand',
          title: 'Brand',
          description: 'Optional. Fill this in and their retainer page is dressed in the client’s own design system (their colours, type and marks), with Breaking Ice as a small credit. Leave it empty for the Breaking Ice look. Colours and type can also be set in the back office (Retainers).',
          type: 'object',
          options: { collapsible: true, collapsed: true },
          fields: [
            defineField({ name: 'displayName', title: 'Name on the page', description: 'How the client writes their name, e.g. North-Wright Air. Empty: the organization name.', type: 'string' }),
            ...([
              ['primary', 'Brand surface colour', 'The colour that carries their brand with white, e.g. navy #19324a. Used for the hero band.'],
              ['accent', 'Accent colour', 'Rules, rings, progress fill. Never body text, e.g. orange #e65729.'],
              ['accentText', 'Accent as small text', 'A darker accent that reads as small text on white, e.g. #b83f17.'],
              ['ink', 'Text colour', 'Body and headings, e.g. #0e1e2c.'],
              ['muted', 'Muted text colour', 'Captions and secondary copy, e.g. #4a5d6c.'],
              ['surfaceAlt', 'Alternate surface', 'Cards and alternate sections, e.g. ice #e8eef2.'],
              ['border', 'Hairline colour', 'Card outlines and table rules, e.g. #dce3e8.'],
            ] as const).map(([name, title, description]) =>
              defineField({ name, title, description, type: 'string', validation: (r) => r.regex(/^#[0-9a-fA-F]{6}$/, { name: 'colour like #19324a' }) }),
            ),
            defineField({
              name: 'fonts',
              title: 'Type',
              type: 'string',
              initialValue: 'breaking-ice',
              options: { list: [{ title: 'Breaking Ice type', value: 'breaking-ice' }, { title: 'Geometric: Jost headings, Montserrat body', value: 'geometric' }], layout: 'radio' },
            }),
            defineField({ name: 'pattern', title: 'Hero pattern', description: 'Fills the hero band (cover). SVG or PNG, about 1600 × 1000, quiet enough for white text on top.', type: 'image', options: { accept: 'image/svg+xml,image/png' } }),
            defineField({ name: 'mark', title: 'Mark, full colour', description: 'Their round mark, used at 64px and up. SVG or PNG.', type: 'image', options: { accept: 'image/svg+xml,image/png' } }),
            defineField({ name: 'markSmall', title: 'Mark, small', description: 'The version for under 64px (e.g. without a fine ring). SVG or PNG.', type: 'image', options: { accept: 'image/svg+xml,image/png' } }),
          ],
        }),
      ],
    }),
  ],
  preview: { select: { title: 'organizationName', media: 'logo', contacts: 'contacts' }, prepare: ({ title, media, contacts }) => ({ title, media, subtitle: `${contacts?.length ?? 0} contact(s)` }) },
})

export const clientProject = defineType({
  name: 'clientProject',
  title: 'Client project',
  type: 'document',
  icon: CaseIcon,
  groups: [
    { name: 'overview', title: 'Overview', default: true },
    { name: 'review', title: 'For review' },
    { name: 'links', title: 'Google Drive' },
    officeGroup,
  ],
  fields: [
    defineField({ name: 'title', type: 'string', group: 'overview', validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'overview',
      description: 'The project’s portal address. Clients only ever see their own projects.',
      options: { source: 'title', maxLength: 80 },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'client', type: 'reference', to: [{ type: 'client' }], group: 'overview', validation: (r) => r.required() }),
    defineField({
      name: 'startDate',
      title: 'Start date',
      description: 'Names the project everywhere: “2026-10-19 Management Plan Explainer” in the portal, back office and Google Drive.',
      type: 'date',
      group: 'overview',
    }),
    defineField({
      name: 'status',
      type: 'string',
      group: 'overview',
      initialValue: 'in-production',
      options: { list: PROJECT_STATUSES, layout: 'radio', direction: 'horizontal' },
    }),
    defineField({
      name: 'hiddenFromClient',
      title: 'Hide from the client’s portal',
      description: 'The client won’t see this project in their portal. Everything else (the back office, files, invoices) carries on as normal.',
      type: 'boolean',
      group: 'overview',
      initialValue: false,
    }),
    defineField({
      name: 'dontEmailDelivery',
      title: 'Don’t send the “your files are ready” email',
      description: 'When you mark it Delivered, the client gets one email (after 10 minutes) linking to their final files. Tick this to skip it.',
      type: 'boolean',
      group: 'overview',
      initialValue: false,
    }),
    defineField({
      name: 'stage',
      title: 'Stage (1–4)',
      description: '1 Listen · 2 Earn trust · 3 Find what matters · 4 Craft the film',
      type: 'number',
      group: 'overview',
      initialValue: 1,
      validation: (r) => r.min(1).max(4).integer(),
    }),
    defineField({
      name: 'stageDates',
      title: 'Stage dates',
      description: 'Four short lines, one per stage, e.g. “Oct 2–6”.',
      type: 'array',
      group: 'overview',
      of: [defineArrayMember({ type: 'string' })],
      validation: (r) => r.max(4),
    }),
    defineField({ name: 'nextStep', title: 'Next step (and who it’s waiting on)', type: 'string', group: 'overview' }),
    defineField({ name: 'summary', type: 'text', rows: 3, group: 'overview' }),
    defineField({ name: 'coverImage', title: 'Cover image', type: 'image', options: { hotspot: true }, group: 'overview' }),
    defineField({
      name: 'links',
      title: 'Documents & links',
      description: 'Posters, scripts, Google Docs, Drive folders: anything you want the client to open. In Google, set sharing to “Anyone with the link” (or share with their email) first.',
      type: 'array',
      group: 'overview',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'projectLink',
          fields: [
            defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
            defineField({ name: 'url', title: 'Link', type: 'url', validation: (r) => r.required() }),
            defineField({ name: 'note', title: 'Note (optional)', description: 'e.g. “Final, print-ready” or “Draft for your comments”', type: 'string' }),
          ],
          preview: { select: { title: 'title', subtitle: 'url' } },
        }),
      ],
    }),
    defineField({
      name: 'keyDates',
      title: 'Key dates',
      type: 'array',
      group: 'overview',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'keyDate',
          fields: [defineField({ name: 'label', type: 'string' }), defineField({ name: 'date', type: 'date' })],
          preview: { select: { title: 'label', subtitle: 'date' } },
        }),
      ],
    }),
    defineField({
      name: 'deliverables',
      title: 'Deliverables (one entry per version)',
      description: 'Each entry is one version. Entries with the same title and type are versions of the same deliverable. The newest version is the one the client sees; setting it to “Awaiting feedback” emails them 10 minutes later. The back office adds versions for you.',
      type: 'array',
      group: 'review',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'deliverable',
          fields: [
            defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
            defineField({
              name: 'category',
              title: 'Type',
              type: 'string',
              initialValue: 'video',
              options: { list: [{ title: 'Video', value: 'video' }, { title: 'Document', value: 'document' }], layout: 'radio', direction: 'horizontal' },
            }),
            defineField({ name: 'version', type: 'number', initialValue: 1, validation: (r) => r.min(1).integer() }),
            defineField({ name: 'date', title: 'Date', description: 'When this version went to the client.', type: 'date' }),
            defineField({ name: 'final', title: 'Final', description: 'Shows as “Final” instead of its version number.', type: 'boolean', initialValue: false }),
            defineField({
              name: 'clientCanView',
              title: 'Client can view (older versions)',
              description: 'The newest version is always open to the client. Older ones stay listed but greyed out (they can’t open them in the portal) unless this is on.',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'status',
              type: 'string',
              initialValue: 'in-progress',
              options: { list: DELIVERABLE_STATUSES, layout: 'radio' },
            }),
            defineField({
              name: 'shareUrl',
              title: 'Vimeo link',
              description: 'The video’s link (or its review page link). Each version is its own Vimeo video. The review page link is found automatically.',
              type: 'url',
              validation: (r) => r.custom((v?: string) => !v || /vimeo\.com/i.test(v) || 'Paste a Vimeo link.'),
            }),
            defineField({
              name: 'fileUrl',
              title: 'File for review (designs, PDFs, audio)',
              description: 'For anything that isn’t a video: a Google Drive file link. Uploading “for review” from the back office fills this in. The client sees a preview, can download it, and approves or asks for changes in the portal.',
              type: 'url',
            }),
            defineField({ name: 'fileName', title: 'File name', type: 'string', hidden: ({ parent }) => !parent?.fileUrl, readOnly: true, description: 'Set automatically when uploaded from the back office.' }),
            defineField({
              name: 'host',
              title: 'Plays from',
              type: 'string',
              readOnly: true,
              hidden: ({ parent }) => parent?.host !== 'r2',
              options: { list: [{ title: 'Vimeo', value: 'vimeo' }, { title: 'Review room (our storage)', value: 'r2' }] },
              description: 'Set automatically when a review copy is uploaded from the back office.',
            }),
            defineField({ name: 'r2Key', title: 'Review copy (storage key)', type: 'string', readOnly: true, hidden: ({ parent }) => !parent?.r2Key }),
            defineField({ name: 'r2Size', title: 'Review copy size (bytes)', type: 'number', readOnly: true, hidden: ({ parent }) => !parent?.r2Key }),
            defineField({ name: 'r2Thumb', title: 'Thumbnail (storage key)', type: 'string', readOnly: true, hidden: ({ parent }) => !parent?.r2Thumb, description: 'Grabbed from the video when it was uploaded.' }),
            defineField({ name: 'thumbAt', title: 'Thumbnail picked at (seconds)', type: 'number', readOnly: true, hidden: ({ parent }) => parent?.thumbAt === undefined }),
            defineField({ name: 'playable', title: 'Plays in a browser', type: 'boolean', readOnly: true, hidden: ({ parent }) => parent?.playable !== false, description: 'Off for files a browser can’t play (often ProRes): they’re for download, and the preview comes from the Vimeo copy.' }),
            defineField({ name: 'durationSec', title: 'Duration (seconds)', type: 'number', readOnly: true, hidden: ({ parent }) => !parent?.r2Key }),
            defineField({ name: 'fps', title: 'Frame rate', type: 'number', readOnly: true, hidden: ({ parent }) => !parent?.r2Key }),
            defineField({ name: 'width', type: 'number', readOnly: true, hidden: ({ parent }) => !parent?.r2Key }),
            defineField({ name: 'height', type: 'number', readOnly: true, hidden: ({ parent }) => !parent?.r2Key }),
            defineField({ name: 'vimeoUrl', title: 'Copy on Vimeo', type: 'url', readOnly: true, hidden: ({ parent }) => !parent?.vimeoUrl, description: 'Set automatically when a finished file is uploaded for delivery.' }),
            defineField({ name: 'vimeoUri', title: 'Vimeo API address', type: 'string', readOnly: true, hidden: ({ parent }) => !parent?.vimeoUri }),
            defineField({ name: 'vimeoState', title: 'Vimeo copy', type: 'string', readOnly: true, hidden: ({ parent }) => !parent?.vimeoState, options: { list: ['uploading', 'ready', 'failed'] } }),
            defineField({ name: 'vimeoError', title: 'Vimeo copy problem', type: 'string', readOnly: true, hidden: ({ parent }) => !parent?.vimeoError }),
            defineField({ name: 'thumbnail', type: 'image', options: { hotspot: true } }),
            defineField({ name: 'feedbackDue', title: 'Feedback due', type: 'date' }),
            defineField({ name: 'length', title: 'Length', description: 'e.g. 2:45', type: 'string' }),
            defineField({ name: 'notes', title: 'Note to the client', description: 'What changed and what to look for. Shown in the portal and the email.', type: 'text', rows: 3 }),
            defineField({ name: 'dontEmail', title: 'Don’t send the email for this version', type: 'boolean', initialValue: false }),
            defineField({
              name: 'feedback',
              title: 'Client feedback',
              description: 'Notes and approvals from the portal, saved automatically.',
              type: 'array',
              readOnly: true,
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'feedbackItem',
                  fields: [
                    defineField({ name: 'at', type: 'datetime' }),
                    defineField({ name: 'who', type: 'string' }),
                    defineField({ name: 'action', type: 'string' }),
                    defineField({ name: 'note', type: 'text' }),
                  ],
                  preview: { select: { title: 'note', subtitle: 'who' } },
                }),
              ],
            }),
          ],
          preview: {
            select: { title: 'title', version: 'version', status: 'status', media: 'thumbnail' },
            prepare: ({ title, version, status, media }) => ({
              title: `${title} · v${version ?? 1}`,
              subtitle: DELIVERABLE_STATUSES.find((s) => s.value === status)?.title.replace(/ \(.*\)/, ''),
              media,
            }),
          },
        }),
      ],
    }),
    defineField({ name: 'driveFolderId', title: 'Google Drive folder ID', type: 'string', group: 'links', ...auto }),
    ...officeFields,
  ],
  orderings: [{ title: 'Newest', name: 'newest', by: [{ field: '_createdAt', direction: 'desc' }] }],
  preview: {
    select: { title: 'title', org: 'client.organizationName', status: 'status', media: 'coverImage' },
    prepare: ({ title, org, status, media }) => ({
      title,
      subtitle: [org, PROJECT_STATUSES.find((s) => s.value === status)?.title].filter(Boolean).join(' · '),
      media,
    }),
  },
})

export const portalSettings = defineType({
  name: 'portalSettings',
  title: 'Portal settings',
  type: 'document',
  icon: CogIcon,
  groups: [
    { name: 'signin', title: 'Sign-in', default: true },
    { name: 'pages', title: 'Dashboard & project' },
    { name: 'email', title: 'Emails' },
    { name: 'payments', title: 'Payments' },
  ],
  fields: [
    defineField({ name: 'signInHeadline', title: 'Sign-in headline', type: 'string', group: 'signin' }),
    defineField({ name: 'signInIntro', title: 'Sign-in intro', type: 'string', group: 'signin' }),
    defineField({ name: 'signInImage', title: 'Sign-in image', type: 'image', options: { hotspot: true }, group: 'signin' }),
    defineField({ name: 'checkEmailHeadline', title: 'Check-email headline', type: 'string', group: 'signin' }),
    defineField({ name: 'checkEmailMessage', title: 'Check-email message', type: 'text', rows: 2, group: 'signin' }),
    defineField({ name: 'dashboardGreeting', title: 'Dashboard greeting', description: 'Use {name} for the first name.', type: 'string', group: 'pages' }),
    defineField({ name: 'nothingToReview', title: 'Nothing-to-review message', type: 'string', group: 'pages' }),
    defineField({ name: 'newProjectLine', title: 'New-project line', type: 'string', group: 'pages' }),
    defineField({
      name: 'feedbackSteps',
      title: 'How to leave feedback (steps)',
      type: 'array',
      group: 'pages',
      of: [defineArrayMember({ type: 'string' })],
      validation: (r) => r.max(4),
    }),
    defineField({ name: 'feedbackVideo', title: 'How-to video (optional)', description: 'A short YouTube or Vimeo screen recording.', type: 'url', group: 'pages' }),
    defineField({ name: 'filesIntro', title: 'Files intro', type: 'string', group: 'pages' }),
    defineField({ name: 'producer', title: 'Producer', type: 'object', group: 'pages', fields: producerFields }),
    defineField({ name: 'newVersionSubject', title: 'New-version email subject', description: 'Use {title} and {version}.', type: 'string', group: 'email' }),
    defineField({ name: 'newVersionIntro', title: 'New-version email intro', description: 'Use {name} for the first name.', type: 'text', rows: 2, group: 'email' }),
    defineField({ name: 'reminderSubject', title: 'Reminder subject', description: 'Use {title}, {version} and {due}.', type: 'string', group: 'email' }),
    defineField({ name: 'reminderIntroUnviewed', title: 'Reminder intro (not yet viewed)', type: 'text', rows: 2, group: 'email' }),
    defineField({ name: 'reminderIntroViewed', title: 'Reminder intro (viewed, not approved)', type: 'text', rows: 2, group: 'email' }),
    defineField({ name: 'reminderDays', title: 'Reminder after (days, when there’s no due date)', type: 'number', initialValue: 7, group: 'email' }),
    defineField({ name: 'chatHandoffMinutes', title: 'Chat: assistant answers for Josh after (minutes)', description: 'When a client writes in the Josh tab and nobody replies in Slack in this time, the assistant answers, labelled as such.', type: 'number', initialValue: 10, group: 'email' }),
    defineField({ name: 'chatMonthlyCap', title: 'Chat: assistant replies per client per month', type: 'number', initialValue: 200, group: 'email' }),
    defineField({ name: 'signOff', title: 'Email sign-off', type: 'string', group: 'email' }),
    defineField({ name: 'copyTo', title: 'Send me a copy at', description: 'Gets a copy of every client email.', type: 'string', group: 'email' }),
    defineField({ name: 'gstNumber', title: 'GST number', description: 'When set, portal payments add 5% GST. Leave empty if the company isn’t registered.', type: 'string', group: 'payments' }),
    defineField({ name: 'etransferEmail', title: 'e-Transfer email', description: 'Where clients send Interac e-Transfers. Shown first in Billing. Leave empty to hide e-Transfer.', type: 'string', group: 'payments' }),
    defineField({
      name: 'eftDetails',
      title: 'EFT / direct deposit details',
      description: 'Account name, institution, transit and account numbers, one per line. Only signed-in clients with something due see it. Leave empty to hide EFT.',
      type: 'text',
      rows: 4,
      group: 'payments',
    }),
    defineField({
      name: 'cardFeePercent',
      title: 'Card processing fee (%)',
      description: 'Added when a client chooses to pay by credit card, plus GST on the fee. Our policy is 3%.',
      type: 'number',
      initialValue: 3,
      validation: (r) => r.min(0).max(3),
      group: 'payments',
    }),
  ],
  preview: { prepare: () => ({ title: 'Portal settings' }) },
})

/** A request for money in the portal. Written by the site and Stripe; read-only here. */
export const portalPayment = defineType({
  name: 'portalPayment',
  title: 'Portal payment',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'label', type: 'string' }),
    defineField({ name: 'projectId', type: 'string' }),
    defineField({ name: 'clientId', type: 'string' }),
    defineField({ name: 'kind', type: 'string' }),
    defineField({ name: 'amount', title: 'Amount before GST', type: 'number' }),
    defineField({ name: 'gst', type: 'number' }),
    defineField({ name: 'total', type: 'number' }),
    defineField({ name: 'status', type: 'string' }),
    defineField({ name: 'createdAt', type: 'datetime' }),
    defineField({ name: 'paidAt', type: 'datetime' }),
    defineField({ name: 'method', type: 'string' }),
    defineField({ name: 'receiptUrl', type: 'url' }),
    defineField({ name: 'cardFee', title: 'Card processing fee', type: 'number' }),
    defineField({ name: 'cardFeeGst', title: 'GST on the card fee', type: 'number' }),
    defineField({ name: 'zohoInvoiceId', title: 'Zoho Books invoice', type: 'string' }),
    defineField({ name: 'zohoInvoiceNumber', title: 'Zoho Books invoice number', type: 'string' }),
    defineField({ name: 'sessionId', title: 'Stripe Checkout session', type: 'string' }),
    defineField({ name: 'paymentIntent', title: 'Stripe payment', type: 'string' }),
  ],
  preview: { select: { title: 'label', total: 'total', status: 'status' }, prepare: ({ title, total, status }) => ({ title, subtitle: `$${total ?? 0} · ${status ?? ''}` }) },
})

/** A time-coded note in the review room. Written by the site; read-only here. */
export const reviewComment = defineType({
  name: 'reviewComment',
  title: 'Review comment',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'project', type: 'reference', to: [{ type: 'clientProject' }], weak: true }),
    defineField({ name: 'deliverableKey', title: 'Version entry (key)', type: 'string' }),
    defineField({ name: 'version', type: 'number' }),
    defineField({ name: 't', title: 'At (seconds)', type: 'number' }),
    defineField({ name: 'tOut', title: 'To (seconds)', type: 'number' }),
    defineField({ name: 'text', type: 'text', validation: (r) => r.max(2000) }),
    defineField({
      name: 'author',
      type: 'object',
      fields: [
        defineField({ name: 'kind', type: 'string', options: { list: ['client', 'guest', 'admin'] } }),
        defineField({ name: 'name', type: 'string' }),
        defineField({ name: 'email', type: 'string' }),
        defineField({ name: 'key', title: 'Guest key (hashed)', type: 'string', hidden: true }),
      ],
    }),
    defineField({ name: 'parent', title: 'Reply to (comment id)', type: 'string' }),
    defineField({ name: 'done', type: 'boolean' }),
    defineField({ name: 'doneBy', type: 'string' }),
    defineField({ name: 'doneAt', type: 'datetime' }),
    defineField({
      name: 'drawing',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'shape',
          fields: [
            defineField({ name: 'type', type: 'string' }),
            defineField({ name: 'color', type: 'string' }),
            // Sanity can't nest arrays, so points are stored flat: x1, y1, x2, y2…
            defineField({ name: 'points', title: 'Points (x, y pairs, 0–1)', type: 'array', of: [defineArrayMember({ type: 'number' })] }),
          ],
        }),
      ],
    }),
    defineField({ name: 'createdAt', type: 'datetime' }),
    defineField({ name: 'editedAt', type: 'datetime' }),
  ],
  orderings: [{ title: 'Newest', name: 'newest', by: [{ field: 'createdAt', direction: 'desc' }] }],
  preview: {
    select: { title: 'text', name: 'author.name', version: 'version', t: 't' },
    prepare: ({ title, name, version, t }) => ({ title, subtitle: `${name ?? ''} · v${version ?? 1} · ${Math.floor((t ?? 0) / 60)}:${String(Math.floor((t ?? 0) % 60)).padStart(2, '0')}` }),
  },
})

/** One fill-in on a document template: where it goes ({{key}}) and who fills it in. */
const docField = defineArrayMember({
  type: 'object',
  name: 'docField',
  fields: [
    defineField({ name: 'key', type: 'string' }),
    defineField({ name: 'label', type: 'string' }),
    defineField({ name: 'type', type: 'string', options: { list: ['text', 'date', 'money', 'choice'] } }),
    defineField({ name: 'who', title: 'Filled in by', type: 'string', options: { list: ['owner', 'signer'] } }),
    defineField({ name: 'options', type: 'array', of: [defineArrayMember({ type: 'string' })] }),
    defineField({ name: 'default', type: 'string' }),
    defineField({ name: 'minor', title: 'Only when signing for a minor', type: 'boolean' }),
    defineField({ name: 'optional', type: 'boolean' }),
  ],
  preview: { select: { title: 'label', subtitle: 'key' } },
})

/** A document to sign, kept in the back office's Library (/admin/library). Edited there, read-only here. */
export const docTemplate = defineType({
  name: 'docTemplate',
  title: 'Document template',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'kind', type: 'string' }),
    defineField({ name: 'title', type: 'string' }),
    defineField({ name: 'audience', title: 'Signed by', type: 'string', options: { list: [{ title: 'The client, in their portal', value: 'client' }, { title: 'One person, own link', value: 'person' }] } }),
    defineField({ name: 'body', title: 'Wording', type: 'text', rows: 20 }),
    defineField({ name: 'fields', title: 'Fill-ins', type: 'array', of: [docField] }),
    defineField({ name: 'wordingApproved', title: 'Wording approved', type: 'boolean' }),
    defineField({ name: 'updatedAt', type: 'datetime' }),
  ],
  preview: { select: { title: 'title', ok: 'wordingApproved' }, prepare: ({ title, ok }) => ({ title, subtitle: ok ? 'Wording approved' : 'Needs your check' }) },
})

const pair = defineArrayMember({ type: 'object', name: 'docValue', fields: [defineField({ name: 'key', type: 'string' }), defineField({ name: 'value', type: 'text', rows: 2 })] })

/** One document sent for signing, with its frozen text and the signature record. Written by the site; read-only here. */
export const signRequest = defineType({
  name: 'signRequest',
  title: 'Sign request',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'templateId', type: 'string' }),
    defineField({ name: 'kind', type: 'string' }),
    defineField({ name: 'audience', type: 'string' }),
    defineField({
      name: 'snapshot',
      title: 'Text as sent',
      type: 'object',
      fields: [defineField({ name: 'title', type: 'string' }), defineField({ name: 'body', type: 'text', rows: 12 }), defineField({ name: 'fields', type: 'array', of: [docField] })],
    }),
    defineField({ name: 'projectId', type: 'string' }),
    defineField({ name: 'projectTitle', type: 'string' }),
    defineField({ name: 'projectSlug', type: 'string' }),
    defineField({ name: 'clientId', type: 'string' }),
    defineField({ name: 'org', type: 'string' }),
    defineField({ name: 'recipient', type: 'object', fields: [defineField({ name: 'name', type: 'string' }), defineField({ name: 'email', type: 'string' }), defineField({ name: 'contactKey', type: 'string' })] }),
    defineField({ name: 'values', title: 'Filled in before sending', type: 'array', of: [pair] }),
    defineField({ name: 'token', title: 'Link token', type: 'string', hidden: true }),
    defineField({ name: 'status', type: 'string', options: { list: ['out', 'viewed', 'signed', 'void'] } }),
    defineField({ name: 'createdAt', type: 'datetime' }),
    defineField({ name: 'emailedAt', type: 'datetime' }),
    defineField({ name: 'viewedAt', type: 'datetime' }),
    defineField({ name: 'signedAt', type: 'datetime' }),
    defineField({ name: 'voidedAt', type: 'datetime' }),
    defineField({
      name: 'signature',
      type: 'object',
      fields: [
        defineField({ name: 'name', title: 'Typed name', type: 'string' }),
        defineField({ name: 'at', type: 'datetime' }),
        defineField({ name: 'ip', title: 'IP address', type: 'string' }),
        defineField({ name: 'userAgent', title: 'Device', type: 'string' }),
        defineField({ name: 'consent', title: 'Agreed to', type: 'text', rows: 2 }),
        defineField({ name: 'values', title: 'Filled in by the signer', type: 'array', of: [pair] }),
        defineField({ name: 'forMinor', type: 'boolean' }),
        defineField({ name: 'via', type: 'string' }),
        defineField({ name: 'portalEmail', type: 'string' }),
        defineField({ name: 'docHash', title: 'Fingerprint (SHA-256)', type: 'string' }),
        defineField({ name: 'certificateId', type: 'string' }),
        defineField({ name: 'pdf', title: 'Signed PDF', type: 'file' }),
        defineField({ name: 'driveFileId', title: 'Drive file', type: 'string' }),
      ],
    }),
  ],
  orderings: [{ title: 'Newest', name: 'newest', by: [{ field: 'createdAt', direction: 'desc' }] }],
  preview: { select: { title: 'snapshot.title', name: 'recipient.name', status: 'status' }, prepare: ({ title, name, status }) => ({ title, subtitle: `${name ?? ''} · ${status ?? ''}` }) },
})

export const retainerMonth = defineType({
  name: 'retainerMonth',
  title: 'Retainer month',
  type: 'document',
  icon: CalendarIcon,
  description: 'One per retainer client per month (id retainer-<client id>-<YYYY-MM>). Social posts come from Publer and aren’t stored here.',
  fields: [
    defineField({ name: 'client', type: 'reference', to: [{ type: 'client' }], weak: true, readOnly: true }),
    defineField({ name: 'clientId', title: 'Client ID', type: 'string', ...auto }),
    defineField({ name: 'month', title: 'Month (YYYY-MM)', type: 'string', readOnly: true, validation: (r) => r.required().regex(MONTH_RE, { name: 'YYYY-MM' }) }),
    defineField({
      name: 'items',
      title: 'Items',
      description: 'Planned and hand-made pieces (videos, photos, designs…). Delivered ones count toward the month.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'retainerItem',
          fields: [
            defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
            defineField({
              name: 'type',
              type: 'string',
              initialValue: 'other',
              options: { list: [{ title: 'Social', value: 'social' }, { title: 'Video', value: 'video' }, { title: 'Photo', value: 'photo' }, { title: 'Design', value: 'design' }, { title: 'Other', value: 'other' }] },
            }),
            defineField({
              name: 'status',
              type: 'string',
              initialValue: 'planned',
              options: { list: [{ title: 'Planned', value: 'planned' }, { title: 'In progress', value: 'in-progress' }, { title: 'Scheduled', value: 'scheduled' }, { title: 'Delivered', value: 'delivered' }] },
            }),
            defineField({ name: 'deliveredAt', title: 'Delivered on', type: 'date' }),
            defineField({ name: 'note', type: 'text', rows: 2 }),
            defineField({
              name: 'files',
              description: 'Google Drive files in the client’s Retainer folder. Added from the back office.',
              type: 'array',
              readOnly: true,
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'retainerFile',
                  fields: [
                    defineField({ name: 'id', type: 'string' }),
                    defineField({ name: 'name', type: 'string' }),
                    defineField({ name: 'mimeType', type: 'string' }),
                    defineField({ name: 'size', type: 'number' }),
                  ],
                  preview: { select: { title: 'name', subtitle: 'mimeType' } },
                }),
              ],
            }),
          ],
          preview: { select: { title: 'title', type: 'type', status: 'status' }, prepare: ({ title, type, status }) => ({ title, subtitle: [type, status].filter(Boolean).join(' · ') }) },
        }),
      ],
    }),
    defineField({
      name: 'recap',
      title: 'Month-end recap',
      description: 'Drafted automatically on the 1st for the month before. Sent only when you press Send in the back office.',
      type: 'object',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: 'draftedAt', type: 'datetime', ...auto }),
        defineField({ name: 'subject', type: 'string' }),
        defineField({ name: 'body', type: 'text', rows: 12 }),
        defineField({ name: 'sentAt', type: 'datetime', ...auto }),
        defineField({ name: 'sentTo', type: 'array', of: [{ type: 'string' }], ...auto }),
      ],
    }),
  ],
  orderings: [{ title: 'Month, newest first', name: 'monthDesc', by: [{ field: 'month', direction: 'desc' }] }],
  preview: {
    select: { org: 'client.organizationName', month: 'month', clientId: 'clientId' },
    prepare: ({ org, month, clientId }) => ({ title: `${org ?? clientId ?? 'Client'} · ${month ?? ''}` }),
  },
})

/** One per client (portal-chat-<client id>): the portal chat's messages. Written by the site only. */
export const portalChat = defineType({
  name: 'portalChat',
  title: 'Portal chat',
  type: 'document',
  icon: UsersIcon,
  readOnly: true,
  fields: [
    defineField({ name: 'client', type: 'reference', to: [{ type: 'client' }], weak: true }),
    defineField({ name: 'threadTs', title: 'Current Slack thread', type: 'string' }),
    defineField({ name: 'assistantCount', title: 'Assistant replies this month', type: 'object', fields: [defineField({ name: 'month', type: 'string' }), defineField({ name: 'n', type: 'number' })] }),
    defineField({ name: 'lastSeenAt', title: 'Client last looked', type: 'datetime' }),
    defineField({ name: 'emailedAt', title: 'Last “Josh replied” email', type: 'datetime' }),
    defineField({ name: 'handoffFor', title: 'Assistant answered for Josh (message key)', type: 'string' }),
    defineField({
      name: 'summarizedUpTo',
      title: 'Summarized up to (message keys)',
      type: 'object',
      fields: [defineField({ name: 'assistant', type: 'string' }), defineField({ name: 'josh', type: 'string' })],
    }),
    defineField({
      name: 'summaries',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'chatSummary',
          fields: [
            defineField({ name: 'at', type: 'datetime' }),
            defineField({ name: 'tab', type: 'string' }),
            defineField({ name: 'from', title: 'First message', type: 'datetime' }),
            defineField({ name: 'to', title: 'Last message', type: 'datetime' }),
            defineField({ name: 'count', type: 'number' }),
            defineField({ name: 'text', type: 'text' }),
          ],
          preview: { select: { title: 'text', subtitle: 'at' } },
        }),
      ],
    }),
    defineField({
      name: 'messages',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'chatMessage',
          fields: [
            defineField({ name: 'at', type: 'datetime' }),
            defineField({ name: 'from', type: 'string', options: { list: ['client', 'josh', 'assistant'] } }),
            defineField({ name: 'who', type: 'string' }),
            defineField({ name: 'text', type: 'text' }),
            defineField({ name: 'tab', type: 'string', options: { list: ['josh', 'assistant'] } }),
            defineField({ name: 'slackTs', type: 'string' }),
            defineField({ name: 'handoff', type: 'boolean' }),
            defineField({ name: 'staff', title: 'From Josh (portal preview)', type: 'boolean' }),
            defineField({ name: 'email', type: 'string' }),
          ],
          preview: { select: { title: 'text', subtitle: 'who' } },
        }),
      ],
    }),
  ],
  preview: { select: { title: 'client.organizationName' }, prepare: ({ title }) => ({ title: title ? `Chat · ${title}` : 'Chat' }) },
})

export const portalSchemaTypes = [client, clientProject, portalSettings, portalPayment, reviewComment, docTemplate, signRequest, retainerMonth, portalChat]
