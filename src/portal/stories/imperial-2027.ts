import type { QuoteStoryConfig } from './types'

const img = (name: string) => `/proposals/imperial-2027/${name}.jpg`

/** Imperial Oil · The 2027 Storytelling Retainer (quote BI-261124). Wording from the approved proposal text. */
export const imperial2027: QuoteStoryConfig = {
  key: 'imperial-2027',
  title: 'The 2027 Storytelling Retainer',
  sections: [
    {
      kind: 'hero',
      eyebrow: 'Imperial Oil · Proposal for 2027',
      title: 'The 2027 Storytelling Retainer',
      subtitle: 'One year of plain-language films about the work at Norman Wells, and the people around it.',
      image: { src: img('aerial-river'), alt: 'Norman Wells from the air in autumn, the Mackenzie River beyond the town', focus: '50% 60%' },
      opener: 'This is our plan for working together through 2027. It comes out of a good year. Your team trusted us with real stories on the islands, along the river and in the communities, and we’d like to keep telling them.',
      from: 'Josh Ferguson',
    },
    {
      kind: 'stats',
      eyebrow: '2026 at a glance',
      title: 'A year of real stories',
      stats: [
        { value: '20+', label: 'finished pieces, from two-minute shorts to the AEMP film' },
        { value: '~$100K', label: 'of work, each piece quoted and approved on its own' },
        { value: '−$10K', label: 'Option 2 makes more pieces than 2026, counting cuts, for about $10,000 less' },
      ],
      body: 'The Closing a Century series, the management plan explainer and its cuts, the AEMP film, the Mackenzie River Classic and the end of production video. Communities have asked to see more of what is happening on the islands and along the river.',
      image: { src: img('aerial-town'), alt: 'Norman Wells from the air, streets and the river in autumn colour' },
    },
    {
      kind: 'films',
      eyebrow: 'What we’ve made together',
      title: 'Stories we’ve already told',
      body: 'A few of the films behind this plan. Each opens on Vimeo in a new tab.',
      films: [
        {
          title: 'A Century at Norman Wells',
          blurb: 'The end of production film: more than a hundred years in Norman Wells, told through the people, the families and the land. Production has ended; the story hasn’t.',
          poster: { src: img('poster-closing-a-century'), alt: 'Still from the end of production film' },
          url: 'https://vimeo.com/1237728771/bdb0d1a321',
        },
        {
          title: 'Northern Development Program',
          blurb: 'A Northern pathway into oil and gas: Sahtu participants, in their own words, on learning while they work.',
          poster: { src: img('poster-ndp'), alt: 'Still from the Northern Development Program film' },
          url: 'https://vimeo.com/1237728973/5d7544a61d',
        },
        {
          title: 'Mackenzie River Classic',
          blurb: 'Hockey on the frozen Mackenzie, hosted by Imperial, and what the game means to the people who came out to play.',
          poster: { src: img('poster-mackenzie-classic'), alt: 'Still from the Mackenzie River Classic film' },
          url: 'https://vimeo.com/1237728556/f6072fbb38',
        },
      ],
    },
    {
      kind: 'text-image',
      eyebrow: 'Why a retainer',
      title: 'One price for a year that won’t sit still',
      paragraphs: [
        'Quoting each piece one at a time doesn’t fit the year ahead. What a video costs depends on what else we film on the same trip, and some stories, like the community monitors or the Cuso partnership, won’t be ready for months.',
        'A retainer gives Imperial one monthly price, a set number of shoot days to use when the work is happening, and a slate of finished pieces. Work can be added or swapped as priorities change.',
      ],
      quote: 'Plain language, real people, and animation where a camera can’t go.',
      image: { src: img('ops-sunset'), alt: 'Pumpjacks silhouetted against an orange winter sunset at Norman Wells' },
      side: 'right',
    },
    {
      kind: 'kinds',
      eyebrow: 'What the retainer covers',
      title: 'Three kinds of work, plus photos',
      body: 'Every option includes all of it. The options differ in how much of each.',
      kinds: [
        { name: 'Closing a Century shorts', detail: 'One site activity, explained in plain language in 2–3 minutes, with footage and animated diagrams or maps.', image: { src: img('ops-plant'), alt: 'Snow-covered plant at Norman Wells from directly above, lights on at dusk' } },
        { name: 'Closure explainers', detail: 'A 4–6 minute version for meetings and working groups, and up to three short cuts for the website. Built like the management plan explainer.', image: { src: img('ops-aerial'), alt: 'Facilities and a flare stack at dusk under a pink winter sky' } },
        { name: 'Community films', detail: 'A 3–5 minute human story with up to three shorter cutdowns for social media, in the style of the NDP film.', image: { src: img('community-drum'), alt: 'A drummer singing at the community gathering' } },
        { name: 'Photo days', detail: 'Two in every option, editing and delivery included. Stills are also captured along the way on each project.', image: { src: img('river-hockey'), alt: 'Players on the ice at the Mackenzie River Classic' } },
      ],
      footnote: 'Planning calls, scripts, regulatory review and the client portal are included in every option.',
    },
    {
      kind: 'gallery',
      images: [
        { src: img('community-dancers'), alt: 'Dancers in ribbon skirts with children at the community gathering' },
        { src: img('community-fiddle'), alt: 'A fiddler playing at the community gathering' },
        { src: img('aerial-autumn'), alt: 'Rooftops and yellow trees in Norman Wells from directly above' },
      ],
      caption: 'Sahtu people telling their own stories: the monitors, the students, the families the food banks serve.',
    },
    {
      kind: 'options',
      eyebrow: 'Three ways to set up the year',
      title: 'Choose how much we make together',
      body: 'Each is one monthly price for 12 months, about 15% below the same work quoted piece by piece. All prices before tax.',
      rows: ['Closing a Century shorts', 'Closure explainers', 'Community films', 'Shoot days', 'Photo days, editing included', 'Editing and animation days', 'Planning, scripts, portal'],
      options: [
        { name: 'Option 1', monthly: 5300, annual: 63600, pieceByPiece: 75000, save: 11400, counts: [5, 1, 2, 12, 2, 35, 'Included'], buyoutMonthly: 2650, buyoutAnnual: 31800, buyoutLater: 47700, note: 'The pieces your team ranks first' },
        { name: 'Option 2', monthly: 7500, annual: 90000, pieceByPiece: 105800, save: 15800, counts: [10, 2, 2, 16, 2, 54, 'Included'], buyoutMonthly: 3750, buyoutAnnual: 45000, buyoutLater: 67500, note: 'More pieces than 2026, for less' },
        { name: 'Option 3', monthly: 10550, annual: 126600, pieceByPiece: 148600, save: 22000, counts: [15, 2, 4, 26, 2, 73, 'Included'], buyoutMonthly: 5275, buyoutAnnual: 63300, buyoutLater: 94950, note: 'The whole 2027 slate, with room for more' },
      ],
      recommended: 1,
      footnote: 'If your team adds or swaps pieces, the proposal has a price list at the retainer rate.',
    },
    {
      kind: 'buyout',
      eyebrow: 'Optional · decided at signing',
      title: 'Keep every frame',
      paragraphs: [
        'Imperial already owns every finished piece. The media buyout adds the raw footage from the year’s shoot days: a general colour grade, interview audio synced, organized by piece and delivered on a drive. It’s a perpetual licence with no further fees.',
        'Booked with the retainer, it’s 50% of the retainer price, spread across the monthly invoices. That price is a one-time chance: added later in the year, it’s 75%.',
      ],
      prices: [
        { name: 'Option 1', now: '+$2,650/mo · $31,800', later: '$47,700' },
        { name: 'Option 2', now: '+$3,750/mo · $45,000', later: '$67,500' },
        { name: 'Option 3', now: '+$5,275/mo · $63,300', later: '$94,950' },
      ],
      archive: {
        title: 'Past footage at the same deal',
        body: 'In August we proposed a licence to the full archive from our past Imperial projects for $27,000, which was 75% of project cost. If Imperial books the 2027 buyout with the retainer, the archive is offered at the same 50%. Your team would hold every frame we’ve shot for Imperial, past and present. If not, it can still be licensed later at the original price.',
        price: 18000,
        later: 27000,
      },
      image: { src: img('community-drum'), alt: 'A drummer singing at the community gathering' },
    },
    {
      kind: 'billing',
      eyebrow: 'How billing works',
      title: 'Nothing is due today',
      points: [
        { title: 'January to December 2027', detail: 'Twelve equal monthly invoices. No deposit.' },
        { title: 'The buyout, if chosen', detail: 'Spread across the twelve monthly invoices.' },
        { title: 'The archive, if chosen', detail: 'Invoiced once, with the first monthly invoice.' },
        { title: 'Travel and extras', detail: 'Travel at cost, itemized and approved in advance. Extra days at the retainer rate on the next invoice.' },
        { title: 'How to pay', detail: 'e-Transfer or EFT preferred. Credit card adds 3%. All prices before GST.' },
      ],
      image: { src: img('aerial-autumn'), alt: 'Rooftops and yellow trees in Norman Wells from directly above' },
    },
    {
      kind: 'close',
      title: 'A note before you read on',
      note: 'A retainer lets us plan this work instead of chasing it, and spend more of every trip filming instead of quoting. The way we work together stays the same: quick calls, honest feedback, and stories told with care. Whatever your team decides, thank you for 2026. We’d be glad to keep going.',
      from: 'Josh',
      cta: 'Read the full proposal',
      image: { src: img('aerial-river'), alt: 'Norman Wells from the air in autumn', focus: '50% 70%' },
    },
  ],
}
