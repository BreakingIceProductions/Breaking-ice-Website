/** Turn a YouTube or Vimeo link into an embed URL. Loops are silent, chromeless and privacy-enhanced. */
export function embedUrl(url: string | undefined, mode: 'loop' | 'play'): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    let yt: string | null = null
    if (host === 'youtu.be') yt = u.pathname.slice(1)
    if (host === 'youtube.com') yt = u.searchParams.get('v') || u.pathname.split('/').pop() || null
    if (yt) {
      const p = mode === 'loop'
        ? `autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&playsinline=1&rel=0&modestbranding=1`
        : 'autoplay=1&rel=0&modestbranding=1'
      return `https://www.youtube-nocookie.com/embed/${yt}?${p}`
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).find((s) => /^\d+$/.test(s))
      if (!id) return null
      const p = mode === 'loop' ? 'background=1&autoplay=1&muted=1&loop=1&dnt=1' : 'autoplay=1&dnt=1'
      return `https://player.vimeo.com/video/${id}?${p}`
    }
  } catch {
    return null
  }
  return null
}

export const CATEGORY_LABELS: Record<string, string> = {
  'energy-industry': 'Energy & industry',
  aviation: 'Aviation',
  'indigenous-governments': 'Indigenous governments',
  'nonprofits-communities': 'Nonprofits & communities',
}
