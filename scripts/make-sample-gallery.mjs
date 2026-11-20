// Makes the made-up sample shoot in public/samples/gallery (plain painted landscapes, no real photos).
// Run once: node scripts/make-sample-gallery.mjs
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const out = path.join(process.cwd(), 'public/samples/gallery')
await mkdir(out, { recursive: true })

const palettes = [
  ['#0b1d3a', '#3e6a9e', '#f2b880', '#1b2b3f', '#2e4a63'],
  ['#1a1033', '#6b3fa0', '#f78f6b', '#22183a', '#40305e'],
  ['#08202a', '#2f7f8f', '#c9e4de', '#0f2e36', '#1d4a52'],
  ['#2a1608', '#a35a2a', '#f4d29c', '#3a2414', '#5e3a20'],
  ['#0d1117', '#33415c', '#9bb1d4', '#151b26', '#252f44'],
  ['#102a12', '#4f8a4b', '#e9f0c9', '#173619', '#2c5a2d'],
]

function scene(i, w, h) {
  const [sky1, sky2, glow, far, near] = palettes[i % palettes.length]
  const r = (n) => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2)
  const ridge = (base, amp, seed) => {
    let d = `M0 ${h}`
    for (let x = 0; x <= w; x += w / 12) d += ` L${x.toFixed(0)} ${(h * base - amp * h * r(seed + x / w * 7)).toFixed(0)}`
    return `${d} L${w} ${h} Z`
  }
  const sunX = (0.2 + 0.6 * r(1)) * w
  const sunY = (0.25 + 0.2 * r(2)) * h
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset=".7" stop-color="${sky2}"/><stop offset="1" stop-color="${glow}"/></linearGradient>
  <radialGradient id="g"><stop offset="0" stop-color="${glow}" stop-opacity=".95"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#s)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${Math.min(w, h) * 0.22}" fill="url(#g)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${Math.min(w, h) * 0.04}" fill="${glow}"/>
  <path d="${ridge(0.62, 0.16, 3)}" fill="${far}" opacity=".85"/>
  <path d="${ridge(0.78, 0.12, 9)}" fill="${near}"/>
  <rect y="${h * 0.86}" width="${w}" height="${h * 0.14}" fill="${sky1}" opacity=".9"/>
  </svg>`
}

for (let i = 1; i <= 24; i++) {
  const portrait = i % 4 === 0
  const [w, h] = portrait ? [1600, 2400] : [2400, 1600]
  const name = `s${String(i).padStart(2, '0')}`
  const img = sharp(Buffer.from(scene(i, w, h)))
  await img.clone().jpeg({ quality: 78 }).toFile(path.join(out, `${name}.jpg`))
  await img.clone().resize({ width: portrait ? 1365 : 2048 }).jpeg({ quality: 76 }).toFile(path.join(out, `${name}-web.jpg`))
  await img.clone().resize({ width: portrait ? 533 : 800 }).jpeg({ quality: 72 }).toFile(path.join(out, `${name}-thumb.jpg`))
}
console.log('done', out)
