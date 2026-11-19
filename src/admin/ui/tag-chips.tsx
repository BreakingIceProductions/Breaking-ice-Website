/** A person's tags as plain text chips. Renders nothing when there are none. */
export function TagChips({ tags, label = 'Tags' }: { tags?: string[]; label?: string }) {
  if (!tags?.length) return null
  return (
    <ul className="pp-tags" aria-label={label}>
      {tags.map((t) => <li key={t} className="pp-tag">{t}</li>)}
    </ul>
  )
}
