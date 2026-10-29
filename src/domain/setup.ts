// The first conversation (VISION.md §3.6).

export const SEED_CATEGORIES = ['Groceries', 'Eating out', 'Car', 'Housing', 'Health', 'Clothing', 'Travel', 'Other'] as const

export const SETUP_STEPS = ['basics', 'cost_centers', 'categories', 'watch', 'invite'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

export const STEP_STATES = ['pending', 'done', 'later'] as const
export type StepState = (typeof STEP_STATES)[number]

export type SetupState = Record<SetupStep, StepState>

export function initialSetup(): SetupState {
  return Object.fromEntries(SETUP_STEPS.map((step) => [step, 'pending'])) as SetupState
}

export function nextStep(setup: SetupState): SetupStep | null {
  return SETUP_STEPS.find((step) => setup[step] === 'pending') ?? null
}

export function isValidCategoryPath(path: string): boolean {
  const parts = path.split('/')
  return parts.length <= 3 && parts.every((part) => part.trim().length > 0 && part === part.trim())
}

export function parentPath(path: string): string | null {
  const index = path.lastIndexOf('/')
  return index === -1 ? null : path.slice(0, index)
}