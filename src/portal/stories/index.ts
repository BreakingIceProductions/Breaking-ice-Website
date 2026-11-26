import { imperial2027 } from './imperial-2027'
import type { QuoteStoryConfig } from './types'

const STORIES: Record<string, QuoteStoryConfig> = { [imperial2027.key]: imperial2027 }

/**
 * The walkthrough for a quote: named on the quote record (`story`), or matched by project slug
 * until the back office can set it.
 */
const BY_SLUG: Record<string, string> = {
  'sample-imperial-2027-retainer': 'imperial-2027',
  'imperial-2027-storytelling-retainer': 'imperial-2027',
}

export const storyFor = (q: { story?: string; slug: string }) => STORIES[q.story ?? ''] ?? STORIES[BY_SLUG[q.slug] ?? '']

export type { QuoteStoryConfig } from './types'
