'use client'

import { useSearchParams } from 'next/navigation'
import type { ProjectCard } from '@/lib/types'
import { StoryCard } from './cards'
import { CategoryChips, useCategoryFilter } from './interactive'

export function StoriesGrid({ projects }: { projects: ProjectCard[] }) {
  const params = useSearchParams()
  const { cat, select, list } = useCategoryFilter(projects, params.get('category'))
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
