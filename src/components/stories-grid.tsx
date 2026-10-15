'use client'

import { useEffect } from 'react'
import type { ProjectCard } from '@/lib/types'
import { StoryCard } from './cards'
import { CategoryChips, useCategoryFilter } from './interactive'

export function StoriesGrid({ projects }: { projects: ProjectCard[] }) {
  // Render every story on the server; apply ?category= after load.
  const { cat, select, list, setCat } = useCategoryFilter(projects, null)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('category')
    if (c) setCat(c)
  }, [setCat])
  return (
    <>
      <CategoryChips cat={cat} select={select} count={list.length} />
      {list.length ? (
        <div className="grid-3">
          {list.map((p, i) => <StoryCard key={p._id} p={p} priority={i < 3} />)}
        </div>
      ) : (
        <p className="muted">No stories in this category yet.</p>
      )}
    </>
  )
}
