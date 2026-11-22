/**
 * Fallback copy for the offers, the FAQ, and the Home / Services / Contact sections.
 * Every line here shows only while the matching Sanity field is empty: edit it in the Studio,
 * or swap the wording here.
 *
 * Source: Website_Copy_Revision/261120_offer_ladder_copy_draft_v1.md (recommended versions),
 * with Josh's Nov 21 decisions applied.
 *
 * Rules: no prices, no invented numbers, no client contact names.
 * The only approved figures are the North-Wright Airways ones (COPY.home.proofStats / proofBody)
 * and the timelines Josh confirmed (One-off Film about 4 to 8 weeks; Story Kit about 6 to 10 weeks,
 * rollout about three months; Brand Engine 12-month minimum term).
 *
 * Pure data (no Sanity client), so the Studio schema can import from here too.
 */
import type { FaqItem, Offer, Service } from './types'

export const OFFER_SLUGS = ['one-off-film', 'story-kit', 'brand-engine'] as const

/** FAQ categories: the Studio's dropdown and the group headings on /faq, in display order. */
export const FAQ_CATEGORIES = [
  { title: 'General', value: 'general' },
  { title: 'Story Kit', value: 'story-kit' },
  { title: 'Brand Engine', value: 'brand-engine' },
  { title: 'One-off Film', value: 'one-off' },
  { title: 'Working together', value: 'working-together' },
] as const

/** Which FAQ category an offer page borrows questions from when the offer has none of its own. */
export const OFFER_FAQ_CATEGORY: Record<string, string> = {
  'one-off-film': 'one-off',
  'story-kit': 'story-kit',
  'brand-engine': 'brand-engine',
}

const q = (key: string, question: string, answer: string) => ({ _key: key, question, answer })

export const FALLBACK_OFFERS: Offer[] = [
  {
    _id: 'offer-one-off-film',
    name: 'One-off Film',
    slug: 'one-off-film',
    order: 1,
    ladderLine: 'One film for one moment, made with care.',
    ladderBlurb: 'A launch, an event, a brand story or a project you must explain. We plan it, film it and deliver it well.',
    ladderLink: 'More about a single film',
    heroHeadline: 'One film. One moment. Done well.',
    oneLiner: 'When you need one thing done really well.',
    descriptionText: [
      'Some moments need one strong film. It can be a launch, an event, a brand story or a project that you must explain. We plan the film with you, film your real people and edit it with care.',
      'You get one finished film that is ready to share. It looks good, it sounds good and it tells the truth about your work. If you want more from the same shoot later, you can move up to a Story Kit.',
    ],
    includedTitle: 'What you get',
    included: [
      'A first conversation and a written goal for the film',
      'A story plan, a shot plan and interview questions',
      'Filming on location, planned around your day, with drone shots where they help',
      'Edit, colour, sound mix and licensed music',
      'Captions and name titles',
      'Two rounds of review',
      'The finished film, in the formats you need',
    ],
    idealFor: [
      'A launch or an opening',
      'An event you want to share with people who were not there',
      'A brand story that shows who you are',
      'A project or a change that you must explain',
    ],
    timeline: 'About 4 to 8 weeks',
    timelineNote: 'From the first conversation to delivery.',
    faq: [
      q(
        'oo1',
        'Can we add short social clips later?',
        'Yes. We can cut short versions from the same footage. If you think you will want them, tell us early. Then we plan for them during the shoot. If you want a full set of pieces and a plan to use them, look at the Story Kit.',
      ),
      q('oo2', 'What kind of film can this be?', 'It can be a brand film, an event film, a project explainer or a short documentary. Look at “Kinds of film we make” to see examples.'),
      q('oo3', 'How many rounds of changes do we get?', 'Each film includes two rounds of review. Most films are final before the second round ends.'),
    ],
    ctaLabel: 'Start a conversation',
    closingHeadline: 'Have one moment that matters? Let’s make it count.',
    seoTitle: 'A single film, made well',
    seoDescription: 'One film for one moment: a launch, an event, a brand story or a project explainer. Real people, real work, made with care in Alberta and the NWT.',
  },
  {
    _id: 'offer-story-kit',
    name: 'Story Kit',
    slug: 'story-kit',
    order: 2,
    // No badge (Josh, Nov 21). The card is still the emphasised step.
    featured: true,
    ladderLine: 'One shoot, many pieces, and a plan to use them all.',
    ladderBlurb:
      'We plan the story with you, then film it once. A typical kit includes a main film, short cuts, social clips, photos and graphics, plus a schedule that tells you what to post and when.',
    ladderLink: 'More about the Story Kit',
    heroHeadline: 'One shoot. One story. Months of use.',
    oneLiner: 'Everything you need to tell one story everywhere, and a plan to use it.',
    descriptionText: [
      'Most video goes into a folder because nobody planned how to use it. The Story Kit fixes that. Before we film, we sit down with you and agree on your goals, your audience and the story. Then we film once and make many pieces from that one shoot.',
      'Every piece tells the same story, so your brand looks the same everywhere. You also get a schedule that tells you what to post, where to post it and when, for about three months after we deliver. You are never left alone with a folder of files.',
    ],
    includedTitle: 'A typical kit includes',
    included: [
      'A plan first. We agree on your goals, your audience and the story before we film.',
      'One shoot. Real people and real work, filmed once.',
      'A main film. The full story, for your website and your big moments.',
      'Shorter cuts. Short versions for presentations, emails and ads.',
      'Social clips. Short, vertical clips for the platforms your audience uses.',
      'Photos. Photos from the same shoot, ready to publish.',
      'Web banners, posters and graphics. Designs that match the film.',
      'A rollout schedule. What to post, where and when, for about three months.',
    ],
    idealFor: [
      'Organizations that want their brand to look the same everywhere',
      'Teams that need content for months, not one post',
      'Recruiting, tourism or community campaigns',
      'Anyone with a video that sat in a folder last time',
    ],
    timeline: 'About 6 to 10 weeks',
    timelineNote: 'From the first conversation to delivery. The rollout schedule then covers about three months.',
    faq: [
      q(
        'sk1',
        'How many pieces do we get?',
        'Every kit is custom. It depends on your goals and where your audience is. We agree on the list with you before we film, so you know what you get.',
      ),
      q(
        'sk2',
        'Do you post the content for us?',
        'With a Story Kit, we give you the content and the schedule, ready to use. If you want us to make, post and measure content for you every month, look at the Brand Engine.',
      ),
      q(
        'sk3',
        'How is this different from a single film?',
        'A single film is one finished piece. A Story Kit gives you a main film plus many smaller pieces from the same shoot, and a plan to use them.',
      ),
    ],
    ctaLabel: 'Start a conversation',
    closingHeadline: 'Ready to make one story work everywhere?',
    seoTitle: 'Story Kit: one shoot, many assets',
    seoDescription: 'One planned shoot gives you a main film, short cuts, social clips, photos and graphics, plus a schedule for what to post, where and when.',
  },
  {
    _id: 'offer-brand-engine',
    name: 'Brand Engine',
    slug: 'brand-engine',
    order: 3,
    ladderLine: 'A monthly partnership that keeps your story going.',
    ladderBlurb: 'Each month, we make, post and measure new content for you. You see all of it in your own portal.',
    ladderLink: 'More about the Brand Engine',
    heroHeadline: 'The engine keeps running, so you don’t have to.',
    oneLiner: 'A monthly partnership that plans, makes, posts and measures your content.',
    descriptionText: [
      'Good content needs a steady rhythm. Most teams do not have the time to keep it going. With the Brand Engine, we make a set number of pieces for you every month. We plan each piece around your goals. You approve every piece in your portal. Then we schedule it and post it for you.',
      'We tag every piece against the content goals that we agree on with you, and we measure how it does. You get your own portal with your brand on it. It shows what is done, what is coming and how it performs. Each month, you also get a short recap.',
    ],
    includedTitle: 'What you get',
    included: [
      'A set amount each month. An agreed number of pieces, planned around your goals.',
      'Made for you. Real people and real work, filmed and edited by us.',
      'Approved by you. You approve every piece in your portal before we post it.',
      'Posted for you. We schedule and post each piece.',
      'Measured. We tag each piece against agreed content goals and track how it does.',
      'Your own portal. A co-branded portal that shows what is done, what is coming and how it performs.',
      'A monthly recap. A short summary of the month and what comes next.',
    ],
    idealFor: [
      'Organizations that want to post often but do not have the time',
      'Teams that recruit or sell all year',
      'Leaders who want to see what their content does',
      'Clients who already have a Story Kit and want to keep going',
    ],
    timeline: '12-month minimum term',
    descriptionNote: 'Looking for our retainers? They are now the Brand Engine.',
    faq: [
      q(
        'be1',
        'What do we need to do each month?',
        'Not much. We agree on the plan with you, and you approve every piece in your portal before we post it. You can check the portal at any time.',
      ),
      q(
        'be2',
        'Which platforms do you post to?',
        'The ones your audience uses. Often this is Facebook, Instagram and LinkedIn. We agree on the platforms with you at the start.',
      ),
      q(
        'be3',
        'How do we know it is working?',
        'We tag each piece against the goals we agree on, and we measure how it does. You see the results in your portal and in the monthly recap.',
      ),
    ],
    ctaLabel: 'Start a conversation',
    closingHeadline: 'Want your story to keep going without the extra work?',
    seoTitle: 'Brand Engine: monthly video partner',
    seoDescription: 'A monthly partnership. We plan, make, post and measure new content for you, and you see all of it in your own portal with a monthly recap.',
  },
]

export const FALLBACK_FAQ: FaqItem[] = [
  {
    _id: 'faq-story-kit',
    category: 'story-kit',
    order: 1,
    question: 'What is included in a Story Kit?',
    answer:
      'A Story Kit starts with a plan. We agree on your goals, your audience and the story. Then we film once and make many pieces. A typical kit includes a main film, shorter cuts, social clips, photos, web banners, posters and graphics. You also get a schedule that tells you what to post, where and when, for about three months.',
  },
  {
    _id: 'faq-brand-engine',
    category: 'brand-engine',
    order: 1,
    question: 'How does the Brand Engine work?',
    answer:
      'It is a monthly partnership, with a 12-month minimum term. Each month, we make an agreed number of pieces around your goals. You approve every piece in your portal. Then we schedule it, post it and measure how it does. You see everything in your portal, and you get a recap each month.',
  },
  {
    _id: 'faq-which',
    category: 'general',
    order: 1,
    question: 'Which option is right for us?',
    answer:
      'If you need one strong film for one moment, a single film is a good fit. If you want one story to work across many places for months, start with a Story Kit. If you want us to keep your content going every month, the Brand Engine is for you. If you are not sure, tell us your goals. We will help you choose.',
  },
  {
    _id: 'faq-how-long',
    category: 'working-together',
    order: 1,
    question: 'How long does a project take?',
    answer:
      'It depends on the project. A single film usually takes about 4 to 8 weeks, from the first conversation to delivery. A Story Kit usually takes about 6 to 10 weeks. In the North, shifts, weather and seasons can change the schedule, so we plan for them from the start.',
  },
  {
    _id: 'faq-where',
    category: 'general',
    order: 2,
    question: 'Where do you work?',
    answer:
      'We work from Stony Plain, Alberta, near Edmonton, and from Norman Wells in the Northwest Territories. We make films across Alberta and the NWT, and we travel for the right project, in Canada and beyond.',
  },
  {
    _id: 'faq-travel',
    category: 'general',
    order: 3,
    question: 'Do you travel?',
    answer:
      'Yes. We travel across Alberta and to fly-in communities in the North, and we travel for the right project, in Canada and beyond. We add travel to the proposal when the dates are set, and we bill travel at cost.',
  },
  {
    _id: 'faq-cost',
    category: 'general',
    order: 4,
    question: 'What does it cost to get started?',
    answer:
      'Every project is different, so we do not list prices. Tell us your goals and your timing. We will talk it through with you, and then send a clear written proposal with options. There is no cost to talk, and no pressure.',
  },
  {
    _id: 'faq-script',
    category: 'working-together',
    order: 2,
    question: 'Do we need a script?',
    answer:
      'No. We do not start with a script. We start with your goals and your people. We plan the story together, and then real people tell it in their own words. If a film needs a voice-over or a set message, we write it with you.',
  },
  {
    _id: 'faq-rights',
    category: 'working-together',
    order: 3,
    question: 'Who owns the footage?',
    answer:
      'You get full rights to all that we deliver. We can show some work in our portfolio. We never sell it or use it as stock. You can also add the raw footage, or a sorted, colour-corrected archive of all that we filmed. Brand Engine content follows the same rights as any film.',
  },
  {
    _id: 'faq-camera',
    category: 'working-together',
    order: 4,
    question: 'What if some of our people do not want to be on camera?',
    answer:
      'That is usual, and it is fine. Interviews are optional. We can record a person’s voice and show photos of them at work. Or they can stay in the background. We never push anyone.',
  },
]

/** The quotable who-we-are line (Home, About and the Organization structured data). */
export const WHO_WE_ARE =
  'Breaking Ice Productions is a video production company making brand and organizational films for companies, communities and public bodies across Alberta and the Northwest Territories.'

export const COPY = {
  home: {
    heroTitle: 'Films that move revenue, funding and enrolment.',
    problemEyebrow: 'Sound familiar?',
    problemTitle: 'Most videos end up in a folder.',
    problemBody:
      'You pay for a good video. It goes on your website once, and then it sits in a folder. Nobody made a plan to use it. If that’s you, that’s okay. It happens to most organizations, and it is not your fault.',
    beliefEyebrow: 'What we believe',
    beliefTitle: 'Real people. Real work. Nothing staged.',
    beliefBody:
      'Everything we film is real. We film your real people doing their real work. When a customer sees the film and then walks through your door, they find what they saw. That is how a film builds trust.',
    ladderEyebrow: 'How we can help',
    ladderTitle: 'Start where you are.',
    ladderIntro: 'Some clients need one great film. Others need a story that keeps working all year. Here is how we help, one step at a time.',
    proofEyebrow: 'Proof it works',
    proofTitle: 'A story that kept working.',
    proofBody:
      'North-Wright Airways is our longest-running partner. We have worked together for about five years. Here is what changed in that time.',
    proofStats: [
      { value: 'About 9,000', label: 'Instagram followers, up from about 600 over about five years' },
      { value: 'Most', label: 'of their job applicants now find them through social media' },
    ],
    /** Link under the proof: to the North-Wright story when one exists, else to all stories. */
    proofStoryLink: 'See the North-Wright story',
    proofAllLink: 'See our stories',
    closingLine: 'Tell us about your goals and your timing. We’ll help you find the right place to start.',
    // ── Wireframe sections (Nov 21). Source: Website_Copy_Revision/261121_wireframe_sections_copy_v1.md, with Josh's answers. ──
    /** Logo splash: the scroll cue under the logo (the small line under the logo is heroEyebrow). */
    splashCue: 'Discover more',
    /** Hero buttons under the reel (the first two come from Site settings). */
    reelButton: 'Watch the full reel',
    /** Featured stories carousel. */
    storiesTitle: 'People trust what they can see for themselves.',
    storiesLine: 'So we show them the real work.',
    storiesJobLabel: 'The job',
    /** “The job” line per featured story, keyed by project slug. A project's own “The job” field in Sanity wins. */
    storyJobs: {
      'keele-river-with-canoe-north-adventures': 'Sell remote river trips through real guests.',
      'imperial-oil-northern-development-program': 'Help Sahtú residents see themselves in the job.',
      // The alt line (Josh, Nov 21): no “road-ready”, the highway is not built yet.
      'this-is-the-sahtu': 'Make the Sahtú proud, not sorry.',
      'fly-north-pilot-recruitment': 'Find pilots who want real bush flying.',
      'growing-through-the-sahtu': 'Honour graduates in every Sahtú community.',
      'ten-stone-mountain-lodge-into-the-mackenzie-mountains': 'Show why people go, and what it takes.',
    } as Record<string, string>,
    /** “Is this you?” checklist. */
    fitEyebrow: 'Is this you?',
    fitTitle: 'This is a good fit if…',
    fitHelper: 'Tick the ones that sound like you.',
    fitItems: [
      { line: 'Something big is coming.', subline: 'A launch, a rebrand, a funding drive, an enrolment push or an anniversary.' },
      { line: 'You want a crew that stays.', subline: 'Not a file and a goodbye. We plan it, film it and help you use it.' },
      { line: 'Your film has a job to do.', subline: 'Win customers, earn funding, enrol students or hire people.' },
      { line: 'One shoot has to cover a lot.', subline: 'Your website, social media, events, recruiting and your board.' },
      { line: 'Your work is better than people know.', subline: 'We show what really happens inside.' },
    ],
    fitClosing: 'Ticked two or more? Let’s talk.',
    /** On site (Home and About). Josh, Nov 21: no crew size in this section. */
    crewEyebrow: 'How we film',
    crewTitle: 'Full production. Light footprint.',
    crewBody:
      'You get professional cameras, sound and lighting, without a film set taking over your floor. We plan around your schedule and work quietly, so your people keep doing their jobs. That is how we capture the work as it really happens.',
  },
  /** Story Kit filmstrip (Home and the Story Kit page). */
  // (Frame mockup kinds and their labels: FILMSTRIP_KINDS / FILMSTRIP_MOCK below.)
  filmstrip: {
    title: 'One shoot. A whole kit of stories.',
    intro: 'We plan the story with you, film it once and turn it into everything below.',
    // “One shoot”, not “1 shoot day”: no single-day promise.
    lead: 'One shoot',
    note: 'A typical kit includes these pieces. We build each kit around your goals.',
    frames: [
      { title: 'The main film', line: 'The full story, for your biggest moments.' },
      { title: 'Short cuts', line: 'Shorter versions for talks, emails and ads.' },
      { title: 'Social clips', line: 'Vertical clips for the feeds you use.' },
      { title: 'Photos', line: 'Stills from the same shoot, ready to publish.' },
      { title: 'Website banner', line: 'A short loop for the top of your site.' },
      { title: 'The rollout plan', line: 'What to post, where and when.' },
    ],
  },
  services: {
    intro: 'We make films about real people and real work. We also plan how you use each film after we deliver it. That way, your story keeps working long after the shoot.',
    metaDescription: 'A single film, a Story Kit or a monthly Brand Engine. Real stories for organizations in Alberta and the Northwest Territories.',
    ladderEyebrow: 'Ways to work with us',
    ladderTitle: 'Start where you are.',
    ladderIntro: 'Pick the step that fits your goals today. You can move up when you are ready.',
    kindsEyebrow: 'Kinds of film we make',
    kindsTitle: 'The films inside every plan',
    kindsIntro: 'Each plan can use any of these. Pick one to see how we make it.',
  },
  offer: {
    includedTitle: 'What you get',
    idealForTitle: 'Ideal for',
    timelineTitle: 'Usual timeline',
    storiesTitle: 'Stories like this',
    faqTitle: 'Questions',
    hookTitle: 'Watch',
    otherOffersTitle: 'Other ways to work with us',
    kindsTitle: 'Kinds of film this can include',
  },
  locations: {
    eyebrow: 'Locations',
    headline: 'Where we work',
    intro: 'We are based in Stony Plain, Alberta, and Norman Wells, Northwest Territories. We travel for the right project, in Canada and beyond.',
    seoTitle: 'Locations: Alberta and the Northwest Territories',
    seoDescription: 'Video production from Stony Plain, Alberta, and Norman Wells, NWT. We film across Alberta and the Northwest Territories, and we travel for the right project.',
    /** Link on each region card: “See Alberta”. */
    cardLink: 'See',
  },
  faq: {
    eyebrow: 'Questions',
    headline: 'Questions we hear often',
    intro: 'Here are plain answers to the questions clients ask most. If your question is not here, ask us.',
    seoTitle: 'Questions about working with us',
    seoDescription: 'What a Story Kit includes, how the Brand Engine works, where we work, who owns the footage and how to start. Plain answers from Breaking Ice.',
    closingHeadline: 'Still have a question? Ask us. We’ll give you a straight answer.',
  },
  contact: {
    intro: 'No sales pitch and no pressure. Tell us what you want to do and when you need it. We will help you find the right place to start.',
    offerLabel: 'Which offer interests you?',
    offerHelp: 'Not sure yet? That is fine. Pick “Not sure yet” and we will help you choose.',
    storyLabel: 'What is your story, and what do you want it to do?',
    storyPlaceholder: 'For example: we want more people to apply for jobs, and we need content by spring.',
  },
}

/** Service slugs that no longer show on the site (/services/retainers redirects to the Brand Engine in next.config.ts). */
export const RETIRED_SERVICE_SLUGS = ['retainers']

/** Plain paragraphs as Portable Text blocks, for code fallbacks of rich-text fields. */
const blocks = (key: string, lines: string[], bullet = false) =>
  lines.map((text, n) => ({
    _type: 'block',
    _key: `${key}${n}`,
    style: 'normal',
    ...(bullet ? { listItem: 'bullet', level: 1 } : {}),
    markDefs: [],
    children: [{ _type: 'span', _key: `${key}${n}s`, text, marks: [] }],
  }))

/**
 * Training videos, a kind of film with no Sanity document yet. Approved copy (261121 draft + Josh's answers).
 * Shows at /services/training-videos and in “Kinds of film” until a Sanity service with the slug
 * `training-videos` is published; that document then replaces this one entirely.
 * Target search phrase: “training videos Alberta” (secondary: safety training video production, onboarding video NWT).
 */
export const FALLBACK_TRAINING_SERVICE: Service = {
  _id: 'service-training-videos-fallback',
  slug: 'training-videos',
  title: 'Training videos',
  summary: 'Clear training videos, filmed on your site with your own people.',
  heroHeadline: 'Show the job the way it is really done.',
  showAsFullCard: true,
  description: blocks('tvd', [
    'New people learn best when they see the real job. We film your own team doing the work, on your site, in the way that your organization does it. Then we cut it into clear, short videos that are easy to follow.',
    'We plan around your schedule and keep out of the way, so the work carries on while we film. On an industrial site, we do your orientation, wear your PPE and film only where your safety team approves. We plan each video with the people who teach the job, so the steps are correct before we film.',
  ]),
  whoItsFor: blocks('tvw', [
    'Energy and industry operators with safety and site orientation needs',
    'Airlines and other teams with set procedures to teach',
    'Schools, health and community organizations that onboard new staff',
    'Any organization that teaches the same job again and again',
  ], true),
  included: [
    'A first conversation and a written goal for each video',
    'A plan for each video, made with the people who teach the job',
    'Planning with your safety and operations teams',
    'Filming on your site, planned around your work',
    'Edit, captions and on-screen titles for key steps',
    'Two rounds of review for each video',
    'MP4 video files, ready for any platform or learning system',
  ],
  timeline: 'About 4 to 8 weeks',
  timelineNote: 'From the first conversation to delivery.',
  faq: [
    {
      _key: 'tv1',
      question: 'Can you film on an active industrial site?',
      answer: 'Yes. We do your site orientation and wear the PPE you require. We film in live areas only when your safety team approves. We fit around your operations.',
    },
    {
      _key: 'tv2',
      question: 'What if some of our people do not want to be on camera?',
      answer: 'That is usual, and it is fine. Interviews are optional. We can record a person’s voice and show photos of them at work. Or they can stay in the background. We never push anyone.',
    },
    {
      _key: 'tv3',
      question: 'Who owns the training videos?',
      answer: 'You get full rights to all that we deliver. You can use the videos in your training as often as you need. You can also add the raw footage, or a sorted, colour-corrected archive of all that we filmed.',
    },
    {
      _key: 'tv4',
      question: 'Can you update the videos when a procedure changes?',
      answer: 'Yes. When a step changes, we can update that part of the video at a reduced rate.',
    },
  ],
  closingHeadline: 'Have a job that people need to learn? Let’s film it.',
  seo: {
    title: 'Training videos in Alberta and the NWT | Breaking Ice',
    description: 'Training, safety and onboarding videos filmed on your site with your own people. Clear, plain and made to be watched. Alberta and the NWT.',
  },
}

/** Filmstrip frame mockups, in the default order of the six frames. */
export const FILMSTRIP_KINDS = ['film', 'cuts', 'social', 'photos', 'web', 'plan'] as const

/**
 * Labels drawn inside the filmstrip mockups. Format labels only (clip lengths, a sample timecode, a generic web address
 * and a sample schedule), not claims about any client.
 */
export const FILMSTRIP_MOCK = {
  timecode: '0:48 / 2:30',
  cutLengths: ['0:30', '1:00'],
  url: 'yourwebsite.com',
  plan: [
    { piece: 'Main film', where: 'Website', when: 'Week 1' },
    { piece: 'Social clip', where: 'Instagram', when: 'Week 2' },
    { piece: 'Short cut', where: 'Email', when: 'Week 3' },
    { piece: 'Photos', where: 'LinkedIn', when: 'Week 4' },
  ],
}
