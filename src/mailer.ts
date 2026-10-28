import type { Mailer } from './ledger/households.js'

// Logs invite links instead of sending them; no email provider is set up yet (docs/ROADMAP.md).
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
