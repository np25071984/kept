import { parseArgs } from 'node:util'
import { createDb } from '../db/db.js'
import { loadConfig } from '../config.js'
import { createHousehold } from '../ledger/households.js'

// Creates a household and its owner, and prints the owner's first API key. Sign-up arrives with the web UI.
const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    currency: { type: 'string', default: 'USD' },
    owner: { type: 'string' },
    email: { type: 'string' },
    timezone: { type: 'string', default: Intl.DateTimeFormat().resolvedOptions().timeZone },
  },
})
if (!values.name || !values.owner || !values.email) {
  console.error('Usage: npm run create-household -- --name "The Smiths" --owner "Sam" --email sam@example.com [--currency USD] [--timezone America/New_York]')
  process.exit(1)
}

const db = createDb(loadConfig().databaseOwnerUrl)
try {
  const created = await createHousehold(db, { name: values.name, currency: values.currency!, owner_name: values.owner, owner_email: values.email, timezone: values.timezone! })
  console.log(`Household ${created.household_id}, owner ${created.user_id}.`)
  console.log(`API key (shown once): ${created.api_key}`)
} finally {
  await db.destroy()
}
