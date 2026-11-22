import { Skeleton } from './_skeleton'

/** Shown for any back-office page without its own outline (Today, Settings, Clients, Library and so on), so it names no page. */
export default function Loading() {
  return <Skeleton label="the page" cards={1} tiles={4} cols={2} />
}
