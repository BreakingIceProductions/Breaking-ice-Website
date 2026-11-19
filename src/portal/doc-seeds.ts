import { DOC_KINDS, KIND, type DocField, type DocKind, type DocTemplate } from './sign-docs'

/**
 * The Library's starting templates, made the first time the Library is opened.
 *
 * Only the media release has wording: the owner's own 2025 May Queen form, word for word,
 * with the event-specific names turned into fill-ins ({{parties}}, {{event}}) and the
 * underscores and tick boxes turned into fields. It starts marked "Needs your check".
 * Every other template starts empty: the owner pastes his own wording.
 */

export const MEDIA_RELEASE_BODY = `Media release: {{event}}

I, {{signer_name}}, hereby grant {{parties}}, their representatives, and assigns the irrevocable and unrestricted right to use, reproduce, publish, and distribute photographs, video recordings, audio recordings, and other media (collectively, "Media") of me, including my image, likeness, and voice, captured during {{event}}, for promotional, educational, or other purposes deemed appropriate by {{parties}}.

This permission includes, but is not limited to, the use of Media in print, online, social media, advertisements, and other public platforms without further consent or compensation.

I understand that I will not have any ownership rights to the Media and waive any right to inspect or approve the finished product in which my likeness appears.

I confirm that I am at least 18 years of age and have the legal capacity to enter into this agreement. A parent or legal guardian must complete the section below if the participant is a minor.

I understand that I have the right to decline participation in this media release. If I choose to decline, my images, likeness, or voice will not be published or used, even if captured, and will then be deleted, and {{parties}} will take reasonable steps to ensure my media is not shared publicly.

Please indicate your choice: {{choice}}

[For Minors] I, {{guardian_name}}, as the parent or legal guardian of {{minor_name}}, grant or decline the permissions described above on behalf of the minor for {{event}}.

Please indicate your choice for the minor: {{minor_choice}}`

export const MEDIA_RELEASE_FIELDS: DocField[] = [
  { _key: 'f-event', key: 'event', label: 'Event (e.g. the May Queen 2025 event)', type: 'text', who: 'owner' },
  { _key: 'f-parties', key: 'parties', label: 'Who gets the rights', type: 'text', who: 'owner', default: 'Breaking Ice Productions' },
  {
    _key: 'f-choice',
    key: 'choice',
    label: 'Your choice',
    type: 'choice',
    who: 'signer',
    options: ['I consent to the use of my Media as described above.', 'I decline, and my Media should not be used or published.'],
  },
  { _key: 'f-guardian', key: 'guardian_name', label: 'Parent or legal guardian’s name', type: 'text', who: 'signer', minor: true },
  { _key: 'f-minor', key: 'minor_name', label: 'Minor’s name', type: 'text', who: 'signer', minor: true },
  {
    _key: 'f-minor-choice',
    key: 'minor_choice',
    label: 'Choice for the minor',
    type: 'choice',
    who: 'signer',
    minor: true,
    options: ["I consent to the use of the minor's Media as described above.", "I decline, and the minor's Media should not be used or published."],
  },
]

export const templateId = (kind: DocKind) => `doc-template-${kind}`

export function seedTemplates(at = new Date().toISOString()): DocTemplate[] {
  return DOC_KINDS.map((kind) => ({
    _id: templateId(kind),
    kind,
    title: KIND[kind].title,
    audience: KIND[kind].audience,
    body: kind === 'media-release' ? MEDIA_RELEASE_BODY : '',
    fields: kind === 'media-release' ? MEDIA_RELEASE_FIELDS : [],
    wordingApproved: false,
    updatedAt: at,
  }))
}
