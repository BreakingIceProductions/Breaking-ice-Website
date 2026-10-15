import type { Metadata } from 'next'
import { urlFor } from '@/sanity/client'
import type { Seo } from './types'

/** Build page metadata from a document's SEO tab, with sensible fallbacks. */
export function seoMeta(seo: Seo | undefined, fallbackTitle: string, fallbackDescription?: string): Metadata {
  const title = seo?.title || fallbackTitle
  const description = seo?.description || fallbackDescription
  const image = seo?.image?.asset ? urlFor(seo.image).width(1200).height(630).fit('crop').url() : undefined
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [{ url: image, width: 1200, height: 630 }] : undefined },
  }
}
