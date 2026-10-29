import { buildApp } from '../http/app.js'
import { createDb } from '../db/db.js'
import { logMailer } from '../mail/log.js'

// Prints the OpenAPI spec without a database; the server also serves it at /api/v1/openapi.json.
const db = createDb('postgres://unused@localhost/unused')
const app = await buildApp({ db, mailer: logMailer(), publicUrl: 'http://localhost' })
await app.ready()
process.stdout.write(`${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
await db.destroy()
