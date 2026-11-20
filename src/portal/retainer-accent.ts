/**
 * Turns a client's brand colour into accent values for their retainer page that stay readable:
 * text colours reach 4.5:1 on the page in light and dark, fills reach 3:1 against the page, and the
 * text on a fill reaches 4.5:1. A missing or invalid colour falls back to Breaking Ice copper.
 */

type RGB = [number, number, number]

const COPPER = {
  '--rt-ink': '#a85f2e',
  '--rt-ink-d': '#e2a273',
  '--rt-fill': '#c9773f',
  '--rt-on': '#18202f',
  '--rt-fill-d': '#c9773f',
  '--rt-on-d': '#18202f',
}

const WHITE: RGB = [255, 255, 255]
const NAVY: RGB = [24, 32, 47]
const BLACK: RGB = [0, 0, 0]
const LIGHT_BGS: RGB[] = [[255, 255, 255], [250, 247, 242]]
const DARK_BGS: RGB[] = [[24, 32, 47], [33, 42, 60]]

function parse(hex?: string): RGB | null {
  const m = hex?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function lum([r, g, b]: RGB) {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

export function contrast(a: RGB, b: RGB) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB

/** Moves the colour toward `target` just far enough to reach `min` contrast against every background. */
function reach(c: RGB, target: RGB, bgs: RGB[], min: number): RGB {
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const m = mix(c, target, t)
    if (bgs.every((bg) => contrast(m, bg) >= min)) return m
  }
  return target
}

/** A fill colour plus the text colour that sits on it (white or navy), both readable. */
function fillPair(c: RGB, bgs: RGB[], towardBg: RGB): { fill: RGB; on: RGB } {
  const fill = reach(c, towardBg, bgs, 3)
  const on = contrast(fill, WHITE) >= contrast(fill, NAVY) ? WHITE : NAVY
  // Push the fill away from its text colour until the text passes.
  const away = on === WHITE ? BLACK : WHITE
  return { fill: reach(fill, away, [on], 4.5), on }
}

/** CSS custom properties for the page wrapper's style attribute. */
export function accentVars(accent?: string): Record<string, string> {
  const c = parse(accent)
  if (!c) return COPPER
  const light = fillPair(c, LIGHT_BGS, BLACK)
  const dark = fillPair(c, DARK_BGS, WHITE)
  return {
    '--rt-ink': toHex(reach(c, BLACK, LIGHT_BGS, 4.5)),
    '--rt-ink-d': toHex(reach(c, WHITE, DARK_BGS, 4.5)),
    '--rt-fill': toHex(light.fill),
    '--rt-on': toHex(light.on),
    '--rt-fill-d': toHex(dark.fill),
    '--rt-on-d': toHex(dark.on),
  }
}

/* ── Client brand (design system) ───────────────────────── */

type BrandColours = { primary?: string; accent?: string; accentText?: string; ink?: string; muted?: string; surfaceAlt?: string; border?: string }

/**
 * CSS custom properties for a client's own design system (the `.rt-brand` page). Missing colours are
 * derived from the ones given, and every text colour is nudged until it reads: primary carries white
 * text (4.5:1), ink / muted / accent-as-text reach 4.5:1 on white and on surface-alt, the accent fill
 * reaches 3:1 on white.
 */
export function brandVars(b: BrandColours, fallbackAccent?: string): Record<string, string> {
  const primary = reach(parse(b.primary) ?? parse(fallbackAccent) ?? NAVY, BLACK, [WHITE], 4.5)
  const surfaceAlt = parse(b.surfaceAlt) ?? mix(primary, WHITE, 0.9)
  const grounds = [WHITE, surfaceAlt]
  const ink = reach(parse(b.ink) ?? mix(primary, BLACK, 0.55), BLACK, grounds, 4.5)
  const muted = reach(parse(b.muted) ?? mix(ink, WHITE, 0.35), BLACK, grounds, 4.5)
  const accent = reach(parse(b.accent) ?? parse(fallbackAccent) ?? primary, BLACK, [WHITE], 3)
  const accentText = reach(parse(b.accentText) ?? accent, BLACK, grounds, 4.5)
  const border = parse(b.border) ?? mix(primary, WHITE, 0.85)
  const onAccent = contrast(accent, ink) >= contrast(accent, WHITE) ? ink : WHITE
  return {
    '--nb-primary': toHex(primary),
    '--nb-primary-rgb': primary.map((v) => Math.round(v)).join(' '),
    '--nb-accent': toHex(accent),
    '--nb-on-accent': toHex(onAccent),
    '--nb-accent-text': toHex(accentText),
    '--nb-ink': toHex(ink),
    '--nb-muted': toHex(muted),
    '--nb-surface-alt': toHex(surfaceAlt),
    '--nb-border': toHex(border),
  }
}
