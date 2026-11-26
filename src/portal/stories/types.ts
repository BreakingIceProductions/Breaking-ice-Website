/**
 * A walkthrough shown before a quote's PDF: a scrolling story in a few kinds of section.
 * Configs live in code for now (one file per story); the shape is plain data so it can move to Sanity later.
 */

export type StoryImage = { src: string; alt: string; /** CSS object-position, e.g. "50% 30%". */ focus?: string }

export type StoryStat = { value: string; label: string }

export type StoryFilm = { title: string; year?: string; blurb: string; poster: StoryImage; /** Plain Vimeo link (vimeo.com/ID/hash). */ url: string }

export type StoryOption = {
  name: string
  monthly: number
  annual: number
  pieceByPiece: number
  save: number
  /** Rows of the comparison, in the same order as `rows` on the section. */
  counts: (number | string)[]
  buyoutMonthly: number
  buyoutAnnual: number
  buyoutLater: number
  note?: string
}

export type StorySection =
  | { kind: 'hero'; eyebrow: string; title: string; subtitle: string; image: StoryImage; opener: string; from?: string }
  | { kind: 'stats'; eyebrow: string; title: string; stats: StoryStat[]; body?: string; image?: StoryImage }
  | { kind: 'films'; eyebrow: string; title: string; body?: string; films: StoryFilm[] }
  | { kind: 'text-image'; eyebrow: string; title: string; paragraphs: string[]; image: StoryImage; side?: 'left' | 'right'; quote?: string }
  | { kind: 'kinds'; eyebrow: string; title: string; body?: string; kinds: { name: string; detail: string; image: StoryImage }[]; footnote?: string }
  | { kind: 'gallery'; images: StoryImage[]; caption?: string }
  | { kind: 'options'; eyebrow: string; title: string; body?: string; rows: string[]; options: StoryOption[]; recommended?: number; footnote?: string }
  | { kind: 'buyout'; eyebrow: string; title: string; paragraphs: string[]; prices?: { name: string; now: string; later: string }[]; archive: { title: string; body: string; price: number; later: number }; image?: StoryImage }
  | { kind: 'billing'; eyebrow: string; title: string; points: { title: string; detail: string }[]; image?: StoryImage }
  | { kind: 'close'; title: string; note: string; from: string; cta: string; image: StoryImage }

export type QuoteStoryConfig = {
  key: string
  /** For the page's accessible name. */
  title: string
  sections: StorySection[]
}
