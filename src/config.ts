export interface Config {
  databaseUrl: string
  databaseOwnerUrl: string
  port: number
  publicUrl: string
  schedulerIntervalMs: number
  // Without a Resend key, emails are written to the log.
  resendApiKey: string | null
  mailFrom: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string) => {
    const value = env[name]
    if (!value) throw new Error(`${name} is not set; see .env.example.`)
    return value
  }
  return {
    databaseUrl: required('DATABASE_URL'),
    databaseOwnerUrl: env.DATABASE_OWNER_URL ?? required('DATABASE_URL'),
    port: Number(env.PORT ?? 3000),
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`,
    schedulerIntervalMs: Number(env.SCHEDULER_INTERVAL_MS ?? 15 * 60_000),
    resendApiKey: env.RESEND_API_KEY || null,
    mailFrom: env.MAIL_FROM || `Kept <noreply@${new URL(env.PUBLIC_URL ?? 'http://localhost').hostname}>`,
  }
}
