import { createDb } from './db/db.js'
import { loadConfig } from './config.js'
import { buildApp } from './http/app.js'
import { runDueRepeats } from './ledger/repeats.js'
import { logMailer } from './mail/log.js'
import { resendMailer } from './mail/resend.js'
import { pruneExpired } from './oauth/prune.js'

const config = loadConfig()
const db = createDb(config.databaseUrl)
const mailer = config.resendApiKey ? resendMailer({ apiKey: config.resendApiKey, from: config.mailFrom }) : logMailer()
const app = await buildApp({ db, mailer, publicUrl: config.publicUrl, logger: true })

// Repeats come due at midnight in each owner's time zone, so the scheduler runs often and creates whatever is due.
// It also deletes expired sign-in state.
async function tick() {
  try {
    const created = await runDueRepeats(db)
    if (created > 0) app.log.info({ created }, 'repeats registered')
  } catch (error) {
    app.log.error(error, 'repeat scheduler failed')
  }
  try {
    const pruned = await pruneExpired(db)
    if (pruned > 0) app.log.info({ pruned }, 'expired sign-in state deleted')
  } catch (error) {
    app.log.error(error, 'pruning expired sign-in state failed')
  }
}
const timer = setInterval(tick, config.schedulerIntervalMs)
void tick()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    clearInterval(timer)
    await app.close()
    await db.destroy()
    process.exit(0)
  })
}

await app.listen({ port: config.port, host: '0.0.0.0' })
