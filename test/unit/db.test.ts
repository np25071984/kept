import { describe, expect, it } from 'vitest'
import { roleProblem } from '../../src/db/db.js'

describe('roleProblem', () => {
  const app = { name: 'kept_app', superuser: false, bypassrls: false, ownsTables: false }
  it('accepts only a role that row-level security binds', () => {
    expect(roleProblem(app)).toBeNull()
    expect(roleProblem({ ...app, name: 'kept', ownsTables: true })).toContain('connects as kept')
    expect(roleProblem({ ...app, bypassrls: true })).not.toBeNull()
    expect(roleProblem({ ...app, superuser: true })).not.toBeNull()
  })
})
