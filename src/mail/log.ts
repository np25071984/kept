import type { Mailer } from '../ledger/households.js'

// Writes emails to the log instead of sending them, when no email provider is configured (DEVELOPMENT.md).
export function logMailer(log: (message: string) => void = console.log): Mailer {
  return {
    async sendInvite({ to, connect, inviter, household }) {
      log(`Invite for ${to}: ${inviter} invited you to ${household} on Kept. Add ${connect} to your AI assistant and sign in with this email.`)
    },
    async sendSignInCode({ to, code, link }) {
      log(`Sign-in code for ${to}: ${code} (or open ${link} in the same browser)`)
    },
  }
}
