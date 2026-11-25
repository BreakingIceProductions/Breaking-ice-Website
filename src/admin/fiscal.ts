import { daysBetween } from './dates'

/**
 * Breaking Ice's fiscal year runs November 1 to October 31, named for the year it ends in
 * (Nov 2026 – Oct 2027 is FY2027). Every yearly figure on the Money page (goals, the year chart,
 * collected by month, top clients, how clients pay, the recurring projection) uses these helpers.
 * Monthly figures (new leads this month, collected this month) stay calendar months.
 */
export const FISCAL_START_MONTH: number = 11

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM" plus n months. */
export function shiftMonth(month: string, n: number) {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export type FiscalYear = {
  /** "FY2027" */
  name: string
  /** "Nov 2026 – Oct 2027" */
  range: string
  /** First and last day, "YYYY-MM-DD". */
  start: string
  end: string
  /** The twelve months in order, "YYYY-MM". */
  months: string[]
  days: number
}

/** The fiscal year a day falls in; `offset` -1 is the one before. */
export function fiscalYear(day: string, offset = 0): FiscalYear {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  const startYear = (m >= FISCAL_START_MONTH ? y : y - 1) + offset
  const first = `${startYear}-${pad(FISCAL_START_MONTH)}`
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(first, i))
  const last = months[11]
  const next = `${shiftMonth(first, 12)}-01`
  const start = `${first}-01`
  const endYear = Number(last.slice(0, 4))
  const endDay = new Date(Date.UTC(endYear, Number(last.slice(5, 7)), 0)).getUTCDate()
  const label = (mm: string) => `${MON[Number(mm.slice(5, 7)) - 1]} ${mm.slice(0, 4)}`
  return {
    name: `FY${endYear}`,
    range: FISCAL_START_MONTH === 1 ? String(endYear) : `${label(first)} – ${label(last)}`,
    start,
    end: `${last}-${pad(endDay)}`,
    months,
    days: daysBetween(start, next),
  }
}

/** Where a day sits in its fiscal year, counting that day: 1/365 on the first day, 1 on the last. */
export const fiscalShare = (fy: FiscalYear, day: string) => (daysBetween(fy.start, day) + 1) / fy.days
