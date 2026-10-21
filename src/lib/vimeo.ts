/**
 * A still for a Vimeo link, so a clip box shows a picture while its player loads.
 * Uses Vimeo's public oEmbed endpoint (all site films are public). Cached for a day; never throws.
 */
export async function vimeoPoster(url?: string, width = 960): Promise<string | null> {
  if (!url) return null
  const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1]
  if (!id) return null
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}&width=${width}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { thumbnail_url?: string }
    return data.thumbnail_url ?? null
  } catch {
    return null
  }
}
