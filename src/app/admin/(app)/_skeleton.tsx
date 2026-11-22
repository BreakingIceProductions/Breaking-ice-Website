import '../../css/admin-pages.css'

/** A light loading outline in the page's own shape: a heading, then tiles, columns or cards. No text beyond one status line for screen readers. */
export function Skeleton({ label, tiles = 0, cols = 0, cards = 2, wide = false }: { label: string; tiles?: number; cols?: number; cards?: number; wide?: boolean }) {
  return (
    <div className={`a-page${wide ? ' a-page-wide' : ''} ap-skel ap-skel-shimmer`} aria-busy="true">
      <p className="sr-only" role="status">Loading {label}…</p>
      <div className="stack ap-gap-3" aria-hidden="true">
        <span className="ap-skel-bar ap-skel-h1" />
        <span className="ap-skel-bar ap-skel-sub" />
      </div>
      {tiles > 0 && (
        <div className="ap-skel-tiles" aria-hidden="true">
          {Array.from({ length: tiles }, (_, i) => <div key={i} className="ap-skel-card"><span className="ap-skel-bar ap-skel-w40" /><span className="ap-skel-bar ap-skel-num" /></div>)}
        </div>
      )}
      {cols > 0 && (
        <div className="ap-skel-cols" aria-hidden="true">
          {Array.from({ length: cols }, (_, i) => <div key={i} className="ap-skel-card"><span className="ap-skel-bar" /><span className="ap-skel-bar" /><span className="ap-skel-bar" /></div>)}
        </div>
      )}
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="ap-skel-card" aria-hidden="true"><span className="ap-skel-bar ap-skel-w30" /><span className="ap-skel-bar" /><span className="ap-skel-bar" /></div>
      ))}
    </div>
  )
}
