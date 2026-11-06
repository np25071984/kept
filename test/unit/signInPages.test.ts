import { describe, expect, it } from 'vitest'
import { codePage } from '../../src/oauth/pages.js'

describe('codePage', () => {
  it('says where a code that never arrived may be, in both languages', () => {
    expect(codePage('en', 'uid', 'sam@example.com')).toContain("Can't find it? Check your spam or junk folder.")
    expect(codePage('ru', 'uid', 'sam@example.com')).toContain('Не можете найти письмо?')
  })
})
