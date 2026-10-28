import type { Mailer } from './ledger/households.js'

// Logs invite links instead of sending them; no email provider is set up yet (docs/ROADMAP.md).
export function logMailer(log: (message: string) => void = console.log): Mailer {
  return {
    async sendInvite({ to, link, inviter, household }) {
      log(`Invite for ${to} from ${inviter} to join ${household}: ${link}`)
    },
  }
}
