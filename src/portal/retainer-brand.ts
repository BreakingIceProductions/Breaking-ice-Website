import 'server-only'
import { portalImage } from './data'
import { brandVars } from './retainer-accent'
import type { SanityImage } from './types'
import type { BrandFonts, BrandImage, RetainerSettings } from '@/retainer/types'

/** A client's brand, ready for the page: display name, CSS variables and image urls. */
export type ResolvedBrand = {
  name: string
  vars: Record<string, string>
  fonts: BrandFonts
  pattern?: string
  mark?: string
  markSmall?: string
}

/**
 * The url for a brand image. SVGs (and plain `{ url }` sample files) are used as they are, never
 * rasterized; PNGs from Sanity go through the image pipeline at the width asked for.
 */
export function brandImageUrl(img: BrandImage | undefined, w: number): string | undefined {
  if (!img) return undefined
  const svg = img.mimeType === 'image/svg+xml' || /\.svg$/i.test(img.url ?? '')
  if (img.url && (svg || !img.asset?._ref)) return img.url
  return portalImage(img as SanityImage, w) ?? img.url
}

/** Null when the client has no brand set: the page keeps the Breaking Ice look. */
export function resolveBrand(c: { organizationName: string; retainer: RetainerSettings }): ResolvedBrand | null {
  const b = c.retainer.brand
  if (!b) return null
  return {
    name: b.displayName || c.organizationName,
    vars: brandVars(b, c.retainer.accent),
    fonts: b.fonts ?? 'breaking-ice',
    pattern: brandImageUrl(b.pattern, 1600),
    mark: brandImageUrl(b.mark, 192),
    markSmall: brandImageUrl(b.markSmall ?? b.mark, 96),
  }
}
