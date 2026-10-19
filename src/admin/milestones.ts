import type { Milestones } from './types'

/**
 * The five milestone dates. "doneFrom" is the stage at which each one counts as done;
 * "yours" marks the ones that are Josh's deadlines (the others are the client's).
 */
export const MILESTONE_LIST: { key: keyof Milestones; label: string; doneFrom: string; yours: boolean }[] = [
  { key: 'roughCutDue', label: 'Rough cut due', doneFrom: 'roughcut', yours: true },
  { key: 'round1Due', label: 'Round 1 feedback due', doneFrom: 'finalcut', yours: false },
  { key: 'finalCutDue', label: 'Final cut due', doneFrom: 'finalcut', yours: true },
  { key: 'round2Due', label: 'Round 2 feedback due', doneFrom: 'delivered', yours: false },
  { key: 'deliveryDue', label: 'Final delivery', doneFrom: 'delivered', yours: true },
]
