import { buildApp } from '../http/app.js'
import { createDb } from '../db/db.js'
import { logMailer } from '../mail/log.js'
import { newKeys } from '../oauth/keys.js'

// Prints the OpenAPI spec without a database; the server also serves it at /api/v1/openapi.json.
export async function openApiSpec(): Promise<string> {
  const db = createDb('postgres://unused@localhost/unused')
  const app = await buildApp({ db, mailer: logMailer(), publicUrl: 'http://localhost', oauthKeys: newKeys() })
  await app.ready()
  const spec = `${JSON.stringify(app.swagger(), null, 2)}\n`
  await app.close()
  await db.destroy()
  return spec
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(await openApiSpec())
