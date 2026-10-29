import type { Mailer } from '../ledger/households.js'
import { inviteEmail, signInCodeEmail, type Email } from './templates.js'

// Sends Kept's email through Resend's HTTP API (IMPLEMENTATION.md §6).

export function resendMailer(input: { apiKey: string; from: string; fetch?: typeof fetch }): Mailer {
  const send = async (to: string, email: Email) => {
    const response = await (input.fetch ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: input.from, to: [to], subject: email.subject, text: email.text, html: email.html }),
    })
    if (!response.ok) throw new Error(`Resend refused the email (${response.status}): ${(await response.text()).slice(0, 200)}`)
  }
  return {
    sendInvite: (invite) => send(invite.to, inviteEmail(invite)),
    sendSignInCode: ({ to, code }) => send(to, signInCodeEmail(code)),
  }
}
