import { CaseIcon } from '@sanity/icons/Case'
import { CogIcon } from '@sanity/icons/Cog'
import { UsersIcon } from '@sanity/icons/Users'
import { defineArrayMember, defineField, defineType } from 'sanity'

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
              validation: (r) => r.required().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { name: 'email' }),
            }),
            defineField({ name: 'role', type: 'string' }),
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
      name: 'status',
      type: 'string',
      group: 'overview',
      initialValue: 'in-production',
      options: { list: PROJECT_STATUSES, layout: 'radio', direction: 'horizontal' },
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
      title: 'Deliverables',
      description: 'Newest at the top. Setting a version to “Awaiting feedback” emails the client 10 minutes later.',
      type: 'array',
      group: 'review',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'deliverable',
          fields: [
            defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
            defineField({ name: 'version', type: 'number', initialValue: 1, validation: (r) => r.min(1).integer() }),
            defineField({
              name: 'status',
              type: 'string',
              initialValue: 'in-progress',
              options: { list: DELIVERABLE_STATUSES, layout: 'radio' },
            }),
            defineField({
              name: 'shareUrl',
              title: 'Vimeo review link',
              description: 'In Vimeo: the video’s Share → Review page link (vimeo.com/reviews/…). The video’s own link also works. To send a new version, use Replace video in Vimeo: the link stays the same and the version here goes up by itself.',
              type: 'url',
              validation: (r) => r.custom((v?: string) => !v || /vimeo\.com/i.test(v) || 'Paste a Vimeo link.'),
            }),
            defineField({ name: 'thumbnail', type: 'image', options: { hotspot: true } }),
            defineField({ name: 'feedbackDue', title: 'Feedback due', type: 'date' }),
            defineField({ name: 'length', title: 'Length', description: 'e.g. 2:45', type: 'string' }),
            defineField({ name: 'notes', title: 'Note to the client', description: 'What changed and what to look for. Shown in the portal and the email.', type: 'text', rows: 3 }),
            defineField({ name: 'dontEmail', title: 'Don’t send the email for this version', type: 'boolean', initialValue: false }),
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
    defineField({ name: 'signOff', title: 'Email sign-off', type: 'string', group: 'email' }),
    defineField({ name: 'copyTo', title: 'Send me a copy at', description: 'Gets a copy of every client email.', type: 'string', group: 'email' }),
  ],
  preview: { prepare: () => ({ title: 'Portal settings' }) },
})

export const portalSchemaTypes = [client, clientProject, portalSettings]
