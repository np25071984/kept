import { parseArgs } from 'node:util'
import { createDb } from '../db/db.js'
import { loadConfig } from '../config.js'
import { saveClient } from '../oauth/connections.js'

// Registers an OAuth client ahead of time, for assistants that ask for a client ID and secret instead of registering
// themselves (IMPLEMENTATION.md §5.4). Run again with the same --id to replace its redirect URIs and secret.
const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    'redirect-uri': { type: 'string', multiple: true },
  },
})
if (!values.id || !values['redirect-uri']?.length) {
  console.error('Usage: npm run create-client -- --id gemini --name Gemini --redirect-uri https://… [--redirect-uri …]')
  process.exit(1)
}

const db = createDb(loadConfig().databaseOwnerUrl)
try {
  const client = await saveClient(db, { id: values.id, name: values.name ?? values.id, redirectUris: values['redirect-uri'] })
  console.log(`Client ID: ${client.client_id}`)
  console.log(`Client secret (shown once): ${client.client_secret}`)
} finally {
  await db.destroy()
}
