import { createDb, migrateToLatest } from '../db/db.js'
import { loadConfig } from '../config.js'

const db = createDb(loadConfig().databaseOwnerUrl)
try {
  await migrateToLatest(db)
  console.log('Migrations applied.')
} finally {
  await db.destroy()
}
