import { Jost, Montserrat } from 'next/font/google'
import type { BrandFonts } from '@/retainer/types'

/*
 * The "geometric" client type: Jost (the web stand-in for Futura PT) for the wordmark, headings and
 * eyebrows, Montserrat for running text. Imported only by the retainer page, so the files load only
 * there. Exposed as CSS variables that are used only under .rt-brand (see retainer.css).
 */

const jost = Jost({ subsets: ['latin'], variable: '--rt-font-jost', display: 'swap' })
const montserrat = Montserrat({ subsets: ['latin'], variable: '--rt-font-montserrat', display: 'swap' })

/** Class names for the brand wrapper: the font variables plus a hook for the CSS. Empty for Breaking Ice type. */
export const brandFontClass = (fonts?: BrandFonts) => (fonts === 'geometric' ? `${jost.variable} ${montserrat.variable} rt-geo` : '')
