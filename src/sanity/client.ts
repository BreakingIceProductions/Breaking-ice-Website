import { createClient, type QueryParams } from 'next-sanity'
import { createImageUrlBuilder } from '@sanity/image-url'
import { apiVersion, dataset, projectId } from './env'

export const client = createClient({ projectId, dataset, apiVersion, useCdn: true, perspective: 'published' })

const builder = createImageUrlBuilder({ projectId, dataset })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const urlFor = (source: any) => builder.image(source).auto('format')

/** Fetch published content; pages re-check Sanity at most once a minute. Never throws. */
export async function sanityFetch<T>(query: string, params: QueryParams = {}): Promise<T | null> {
  try {
    return await client.fetch<T>(query, params, { next: { revalidate: 60 } })
  } catch (err) {
    console.error('[sanity] fetch failed', err)
    return null
  }
}
