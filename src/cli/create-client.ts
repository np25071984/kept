import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { createDb } from '../db/db.js'
import { loadConfig } from '../config.js'

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

const secret = randomBytes(32).toString('hex')
const payload = {
  client_id: values.id,
  client_secret: secret,
  client_name: values.name ?? values.id,
  client_id_issued_at: Math.floor(Date.now() / 1000),
  redirect_uris: values['redirect-uri'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_post',
}
const db = createDb(loadConfig().databaseOwnerUrl)
try {
  await db
    .insertInto('oauth_models')
    .values({ name: 'Client', id: values.id, payload: JSON.stringify(payload) })
    .onConflict((oc) => oc.columns(['name', 'id']).doUpdateSet({ payload: JSON.stringify(payload) }))
    .execute()
  console.log(`Client ID: ${values.id}`)
  console.log(`Client secret (shown once): ${secret}`)
} finally {
  await db.destroy()
}
