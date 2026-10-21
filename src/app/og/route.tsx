import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

/**
 * Branded share card (1200×630) for links posted to texts, Slack, LinkedIn, Facebook.
 * Used whenever a page has no share image set in the Studio.
 *   /og?title=…&eyebrow=…
 */
export const runtime = 'nodejs'

const NAVY = '#18202F'
const RAISED = '#222B3D'
const COPPER = '#C9773F'
const COPPER_LIGHT = '#E2A273'
const WARM = '#FAF7F2'
const MUTED = '#AEB6C3'

const load = (f: string) => readFile(join(process.cwd(), 'src/assets/og', f))
let logo: Promise<string> | undefined
const logoData = () =>
  (logo ??= readFile(join(process.cwd(), 'public/brand/bi-horizontal-dark.svg')).then(
    (b) => `data:image/svg+xml;base64,${b.toString('base64')}`,
  ))

/** The two-shard mark as an SVG data URL. */
const mark = (left: string, right: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 43.9"><polygon points="0,0 20,0 20,29.9 0,43.9" fill="${left}"/><polygon points="28,0 48,0 48,29.9 28,43.9" fill="${right}"/></svg>`,
  ).toString('base64')}`

const EYEBROWS = /^(Story( · [A-Za-z &]+)?|About|Contact|Services|Stories|Alberta|Northwest Territories|Legal|Video production · Alberta & the NWT)$/

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const title = (searchParams.get('title') || 'We tell the human stories inside organizations.').slice(0, 110)
  // Only the labels the site itself uses, so the card can't be made to say anything else up top.
  const askedEyebrow = searchParams.get('eyebrow') ?? ''
  const eyebrow = EYEBROWS.test(askedEyebrow) ? askedEyebrow : 'Video production · Alberta & the NWT'
  const size = title.length > 70 ? 58 : title.length > 40 ? 68 : 80

  const [bold, semi, logoSrc] = await Promise.all([load('archivo-expanded-bold.ttf'), load('archivo-semibold.ttf'), logoData()])

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: NAVY, position: 'relative', fontFamily: 'Archivo' }}>
        {/* One large, quiet mark on the right: the pattern, used sparingly */}
        <img src={mark(RAISED, RAISED)} width={520} height={476} style={{ position: 'absolute', right: -90, bottom: -70 }} alt="" />
        <img src={mark(COPPER, WARM)} width={64} height={59} style={{ position: 'absolute', right: 72, top: 64 }} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900 }}>
            <div style={{ fontFamily: 'Archivo SemiBold', fontSize: 22, letterSpacing: 5, textTransform: 'uppercase', color: COPPER_LIGHT }}>
              {eyebrow}
            </div>
            <div style={{ fontSize: size, lineHeight: 1.06, color: WARM }}>{title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <img src={logoSrc} height={44} width={Math.round((44 * 12666) / 1551.5)} alt="" />
            <div style={{ fontFamily: 'Archivo SemiBold', fontSize: 22, color: MUTED }}>breakingiceproductions.com</div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, background: COPPER }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Archivo', data: bold, weight: 700, style: 'normal' },
        { name: 'Archivo SemiBold', data: semi, weight: 600, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' },
    },
  )
}
