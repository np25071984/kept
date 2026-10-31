import { describe, expect, it } from 'vitest'
import { initialSetup, isValidCategoryPath, nextStep, parentPath, startPath } from '../../src/domain/setup.js'

describe('nextStep', () => {
  it('is the first pending step, skipping ones put off for later', () => {
    expect(nextStep(initialSetup())).toBe('basics')
    expect(nextStep({ ...initialSetup(), basics: 'done', cost_centers: 'later' })).toBe('categories')
    expect(nextStep({ basics: 'done', cost_centers: 'done', categories: 'later', watch: 'done', invite: 'later' })).toBeNull()
  })
})

describe('startPath', () => {
  it('starts an owner with setup left on the first conversation, then resumes it', () => {
    expect(startPath({ introduced: false, role: 'owner' }, 'basics')).toBe('first_member')
    expect(startPath({ introduced: true, role: 'owner' }, 'categories')).toBe('resume')
    expect(startPath({ introduced: true, role: 'owner' }, null)).toBe('done')
  })

  it('introduces a member, or an owner joining a set-up household, without setting it up again', () => {
    expect(startPath({ introduced: false, role: 'member' }, 'basics')).toBe('new_member')
    expect(startPath({ introduced: false, role: 'owner' }, null)).toBe('new_member')
    expect(startPath({ introduced: true, role: 'member' }, 'watch')).toBe('done')
  })
})

describe('category paths', () => {
  it('allows up to three trimmed, non-empty levels', () => {
    expect(isValidCategoryPath('Car/Fuel/Diesel')).toBe(true)
    expect(isValidCategoryPath('A/B/C/D')).toBe(false)
    expect(isValidCategoryPath('Car//Fuel')).toBe(false)
    expect(isValidCategoryPath('Car/ Fuel')).toBe(false)
  })

  it('finds the parent', () => {
    expect(parentPath('Car/Fuel')).toBe('Car')
    expect(parentPath('Car')).toBeNull()
  })
})
