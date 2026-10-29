import { describe, expect, it } from 'vitest'
import { similarNames } from '../../src/domain/names.js'

describe('similarNames', () => {
  const people = ['Maya', 'Ellen', 'Ivy', 'Kia Carnival', 'Hyundai Venue', 'Rex']

  it('finds a likely typo', () => {
    expect(similarNames('Iva', people)).toEqual(['Ivy'])
    expect(similarNames('Elen', people)).toEqual(['Ellen'])
    expect(similarNames('Maia', people)).toEqual(['Maya'])
    expect(similarNames('Kai', ['Kia', 'Ivy'])).toEqual(['Kia'])
  })

  it('finds a shorter form of a name', () => {
    expect(similarNames('kia', people)).toEqual(['Kia Carnival'])
    expect(similarNames('Hyundai', people)).toEqual(['Hyundai Venue'])
  })

  it('returns nothing for a name unlike any other', () => {
    expect(similarNames('Iva', ['Maya', 'Ellen'])).toEqual([])
    expect(similarNames('Grandma', people)).toEqual([])
  })

  it('compares a category by its last part', () => {
    expect(similarNames('Fuel', ['Car/Fuel', 'Groceries'])).toEqual(['Car/Fuel'])
    expect(similarNames('Grocery', ['Car/Fuel', 'Groceries'])).toEqual(['Groceries'])
  })
})
