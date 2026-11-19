/**
 * Frames and SMPTE timecode for the review room. Pure functions, used in the browser.
 * NTSC rates (23.976, 29.97, 59.94) run at n×1000/1001 frames a second; 29.97 and 59.94
 * count in drop-frame (frame numbers 0–1, or 0–3, skipped each minute except every tenth).
 * 23.976 is never drop-frame: it counts 24 to the second, like the edit does.
 */

const NTSC = [23.976, 29.97, 59.94]

/** The real frame rate: 23.976 is 24000/1001. */
export const exactFps = (fps: number) => (NTSC.some((x) => Math.abs(x - fps) < 0.01) ? (Math.round(fps) * 1000) / 1001 : fps)
export const nominalFps = (fps: number) => Math.round(fps)
export const isDropFrame = (fps: number) => Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01

/** The frame showing at a time (seconds). */
export const frameAt = (t: number, fps: number) => Math.max(0, Math.floor(t * exactFps(fps) + 1e-4))
/** Where a frame starts, in seconds (what a comment stores). */
export const frameStart = (frame: number, fps: number) => Math.round((frame / exactFps(fps)) * 1000) / 1000
/** The middle of a frame: seeking here always lands on that frame. */
export const frameMiddle = (frame: number, fps: number) => (frame + 0.5) / exactFps(fps)
/** A stored time back to its frame. */
export const frameOf = (t: number, fps: number) => Math.max(0, Math.round(t * exactFps(fps)))

const two = (n: number) => String(n).padStart(2, '0')

/** HH:MM:SS:FF (HH:MM:SS;FF for drop-frame). */
export function timecode(frame: number, fps: number) {
  const n = nominalFps(fps)
  let f = Math.max(0, Math.floor(frame))
  if (isDropFrame(fps)) {
    const drop = n === 60 ? 4 : 2
    const per10 = Math.round(exactFps(fps) * 600)
    const perMin = n * 60 - drop
    const d = Math.floor(f / per10)
    const m = f % per10
    f += drop * 9 * d + (m > drop ? drop * Math.floor((m - drop) / perMin) : 0)
  }
  const ff = f % n
  const s = Math.floor(f / n)
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}${isDropFrame(fps) ? ';' : ':'}${two(ff)}`
}

/** Plain time: 1:12.34 */
export function clockTime(t: number) {
  const s = Math.max(0, t)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`
}

/** Spoken form for screen readers: "1 minute 12 seconds, frame 8". */
export function spokenTime(t: number, fps: number) {
  const frame = frameAt(t, fps)
  const tc = timecode(frame, fps).split(/[:;]/).map(Number)
  const parts = [tc[0] && `${tc[0]} hour${tc[0] === 1 ? '' : 's'}`, tc[1] && `${tc[1]} minute${tc[1] === 1 ? '' : 's'}`, `${tc[2]} second${tc[2] === 1 ? '' : 's'}`].filter(Boolean)
  return `${parts.join(' ')}, frame ${tc[3]}`
}
