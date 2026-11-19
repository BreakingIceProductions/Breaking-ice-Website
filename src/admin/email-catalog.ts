import 'server-only'
import { SITE_URL } from '@/lib/site'
import { getPortalSettings } from '@/portal/data'
import { deliveryEmail, fill, paidEmail, quoteEmail, reviewBatchEmail, signedEmail, signInEmail, toSignEmail, versionEmail } from '@/portal/email'

/**
 * Every email the portal sends to clients and signers, rendered from the real templates in
 * src/portal/email.ts with made-up sample data, for the Library's read-only previews.
 * Nothing here sends anything.
 */

export type EmailPreview = { key: string; name: string; when: string; subject: string; html: string; text: string }

export async function emailCatalog(): Promise<EmailPreview[]> {
  const s = await getPortalSettings()
  const portalUrl = `${SITE_URL}/portal`
  const sample = { projectTitle: 'Sample project', org: 'Sample Organization', signOff: s.signOff, producerPhone: '780-555-0100' }
  const version = (kind: 'new' | 'reminder') =>
    versionEmail({
      kind,
      subject: fill(kind === 'new' ? s.newVersionSubject : s.reminderSubject, { title: 'Sample film', version: 2, due: 'Fri, Nov 28' }),
      intro: fill(kind === 'new' ? s.newVersionIntro : s.reminderIntroUnviewed, { name: 'Alex' }),
      ...sample,
      title: 'Sample film',
      version: 2,
      notes: 'Sample note about what changed in this version.',
      length: '2:30',
      due: 'Fri, Nov 28',
      portalUrl,
      shareUrl: 'https://vimeo.com/',
    })

  const list: (Omit<EmailPreview, 'subject' | 'html' | 'text'> & { mail: { subject: string; html: string; text: string } })[] = [
    { key: 'sign-in', name: 'Sign-in code', when: 'When someone asks to sign in to the client portal.', mail: signInEmail({ link: portalUrl, code: '123456' }) },
    { key: 'version', name: 'New version ready', when: 'About 10 minutes after a new version is marked “With the client”, to contacts who get emails (unless switched off for that version).', mail: version('new') },
    { key: 'reminder', name: 'Reminder about a version', when: `When a version has waited ${s.reminderDays} days with no feedback. Once per version.`, mail: version('reminder') },
    {
      key: 'review-batch',
      name: 'Ready for review (sent together)',
      when: 'When you press Send on the project’s Portal tab for one or more versions.',
      mail: reviewBatchEmail({ name: 'Alex', ...sample, items: [{ title: 'Sample film', length: '2:30' }, { title: 'Sample cut-down', length: '0:30' }], portalUrl }),
    },
    { key: 'delivery', name: 'Final files ready', when: 'Once, when a project is marked Delivered, unless switched off for the project in the Studio.', mail: deliveryEmail({ name: 'Alex', ...sample, films: ['Sample film · Final', 'Sample cut-down · Final'], portalUrl }) },
    { key: 'quote', name: 'Quote ready', when: 'When you send a quote from the project’s Documents tab.', mail: quoteEmail({ name: 'Alex', ...sample, total: 12500, validUntil: 'December 31, 2026', again: false, portalUrl }) },
    { key: 'quote-again', name: 'Updated quote', when: 'When you send a quote again after changing it.', mail: quoteEmail({ name: 'Alex', ...sample, total: 12500, again: true, portalUrl }) },
    { key: 'signed-quote', name: 'Quote signed', when: 'Right after a client signs a quote, with the signed PDF attached.', mail: signedEmail({ name: 'Alex', ...sample, at: 'November 19, 2026 at 2:15 p.m. MST', deposit: 6250, booked: true, portalUrl }) },
    { key: 'paid', name: 'Payment received', when: 'When a portal payment clears (card or bank transfer).', mail: paidEmail({ name: 'Alex', ...sample, label: 'Deposit', total: 6562.5, processing: false, portalUrl }) },
    { key: 'paid-processing', name: 'Payment started', when: 'When a bank payment starts and hasn’t cleared yet.', mail: paidEmail({ name: 'Alex', ...sample, label: 'Deposit', total: 6562.5, processing: true, portalUrl }) },
    {
      key: 'to-sign-client',
      name: 'To sign (client document)',
      when: 'Only when you press “Create and email” or “Email again” on a client’s document. Never automatic.',
      mail: toSignEmail({ name: 'Alex', title: 'Sample document', ...sample, url: portalUrl, portal: true }),
    },
    {
      key: 'to-sign-person',
      name: 'To sign (release or crew document)',
      when: 'Only when you press “Create and email” or “Email again” on a person’s document. Never automatic.',
      mail: toSignEmail({ name: 'Sam', title: 'Sample release', url: `${SITE_URL}/sign/sample-link`, portal: false, signOff: s.signOff, producerPhone: sample.producerPhone }),
    },
  ]
  return list.map(({ mail, ...e }) => ({ ...e, subject: mail.subject, html: mail.html, text: mail.text }))
}
