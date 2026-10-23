'use client'

import { useId, useState } from 'react'
import { Btn } from './brand'

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`

/** An illustration, not a forecast: what a stronger film could be worth over a year, at the visitor's own numbers. */
export function ReturnCalculator({ cta }: { cta: string }) {
  const id = useId()
  const [value, setValue] = useState(5000)
  const [count, setCount] = useState(4)
  const monthly = value * count
  const yearly = monthly * 12
  const pct = (v: number, min: number, max: number) => `${((v - min) / (max - min)) * 100}%`

  return (
    <div className="calc">
      <div className="calc-row">
        <label htmlFor={`${id}-v`} className="calc-q">What is one new customer, recruit or supporter worth to you?</label>
        <output className="calc-val" htmlFor={`${id}-v`}>{money(value)}</output>
      </div>
      <input
        id={`${id}-v`}
        className="calc-range"
        type="range"
        min={500}
        max={20000}
        step={250}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-valuetext={money(value)}
        style={{ ['--pct' as string]: pct(value, 500, 20000) }}
      />
      <div className="calc-ends"><span>$500</span><span>$20,000</span></div>

      <div className="calc-row" style={{ marginTop: 'var(--space-8)' }}>
        <label htmlFor={`${id}-c`} className="calc-q">How many more could a stronger film bring in, each month?</label>
        <output className="calc-val" htmlFor={`${id}-c`}>{count}</output>
      </div>
      <input
        id={`${id}-c`}
        className="calc-range"
        type="range"
        min={1}
        max={15}
        step={1}
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        aria-valuetext={`${count} per month`}
        style={{ ['--pct' as string]: pct(count, 1, 15) }}
      />
      <div className="calc-ends"><span>1</span><span>15</span></div>

      <div className="calc-result" aria-live="polite">
        <div className="calc-big">{money(yearly)}<span>/year</span></div>
        <div className="calc-month">{money(monthly)} a month</div>
        <p>
          That is the twelve-month value of {count} more {count === 1 ? 'person' : 'people'} a month at {money(value)} each. One film, doing that work again and again.
        </p>
        <p className="calc-note">An illustration to make the idea concrete, not a forecast or a promise. Use your own numbers.</p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
          <Btn href="/contact">{cta}</Btn>
        </div>
      </div>
    </div>
  )
}
