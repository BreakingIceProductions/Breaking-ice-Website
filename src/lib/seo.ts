import type { Metadata } from 'next'
import { urlFor } from '@/sanity/client'
import type { Img, Seo } from './types'

type Opts = {
  /** Page path, e.g. '/stories/slug': sets the canonical URL. */
  path?: string
  /** Small label above the title on the generated share image. */
  eyebrow?: string
  /** A picture to share when the SEO tab has none (e.g. a story's thumbnail). */
  image?: Img
}

/**
 * Page metadata from a document's SEO tab, with fallbacks.
 * Share image priority: SEO tab image → opts.image → a branded card generated at /og.
 */
export function seoMeta(seo: Seo | undefined, fallbackTitle: string, fallbackDescription?: string, opts: Opts = {}): Metadata {
  const title = seo?.title || fallbackTitle
  const description = seo?.description || fallbackDescription
  const picked = seo?.image?.asset ? seo.image : opts.image?.asset ? opts.image : undefined
  const image = picked
    ? urlFor(picked).width(1200).height(630).fit('crop').url()
    : `/og?${new URLSearchParams({ title, ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}) })}`
  return {
    title,
    description,
    alternates: opts.path ? { canonical: opts.path } : undefined,
    openGraph: {
      type: 'website',
      siteName: 'Breaking Ice Productions',
      locale: 'en_CA',
      title,
      description,
      url: opts.path,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}
