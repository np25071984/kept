import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { openApiSpec } from '../../src/cli/openapi.js'

// The committed spec shows every API change as a diff in review.
it('matches the committed OpenAPI spec; run `npm run openapi` after changing the API', async () => {
  expect(await openApiSpec()).toBe(await readFile(new URL('../../docs/openapi.json', import.meta.url), 'utf8'))
})
