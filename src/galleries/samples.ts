import 'server-only'
import { statSync } from 'node:fs'
import path from 'node:path'
import type { Gallery, GalleryPhoto } from './types'

/**
 * A made-up shoot for local development and the portal's sample preview: painted landscapes
 * (scripts/make-sample-gallery.mjs), three sets, nothing real. It never touches Sanity or R2.
 */

export const SAMPLE_GALLERY_ID = 'sample-gallery-1'
export const SAMPLE_GALLERY_SLUG = 'sample-shoot-demo01'

const sizeOf = (file: string, fallback: number) => {
  try {
    return statSync(path.join(process.cwd(), 'public/samples/gallery', file)).size
  } catch {
    return fallback
  }
}

export function sampleGallery(): Gallery {
  const sets = [
    { _key: 'set-portraits', title: 'Portraits' },
    { _key: 'set-site', title: 'On site' },
    { _key: 'set-event', title: 'Event' },
  ]
  const photos: GalleryPhoto[] = Array.from({ length: 24 }, (_, i) => {
    const n = i + 1
    const key = `s${String(n).padStart(2, '0')}`
    const portrait = n % 4 === 0
    return {
      _key: key,
      set: sets[Math.floor(i / 8)]._key,
      name: `BIP_${String(4120 + n * 3)}.jpg`,
      w: portrait ? 1600 : 2400,
      h: portrait ? 2400 : 1600,
      size: sizeOf(`${key}.jpg`, 120_000),
      webSize: sizeOf(`${key}-web.jpg`, 40_000),
      ext: 'jpg',
      uploadedAt: '2026-11-01T18:00:00.000Z',
    }
  })
  const expires = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)
  return {
    _id: SAMPLE_GALLERY_ID,
    title: 'Sample shoot: Fall site visit',
    slug: SAMPLE_GALLERY_SLUG,
    date: '2026-10-28',
    clientId: 'sample-client',
    clientName: 'Sample Development Corporation',
    status: 'live',
    coverKey: 's05',
    sets,
    photos,
    share: { on: true, version: 1 },
    downloads: { full: true, web: true, all: true },
    expiresOn: expires,
    message: 'Thanks for having us out. Heart your favourites and we’ll retouch those first.',
    createdAt: '2026-11-01T18:00:00.000Z',
    sample: true,
  }
}
