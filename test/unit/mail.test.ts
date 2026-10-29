import { describe, expect, it } from 'vitest'
import { resendMailer } from '../../src/mail/resend.js'
import { inviteEmail, signInCodeEmail } from '../../src/mail/templates.js'

describe('emails', () => {
  it('puts the sign-in code in the subject and body', () => {
    const email = signInCodeEmail('042917')
    expect(email.subject).toBe('042 917 is your Kept code')
    expect(email.text).toContain('Your Kept sign-in code is 042 917.')
    expect(email.html).toContain('042 917')
  })

  it('tells an invitee what to add to their assistant, and escapes names', () => {
    const email = inviteEmail({ connect: 'https://kept-ledger.com/mcp', inviter: 'Alex', household: 'The <Carters>' })
    expect(email.subject).toBe('Alex invited you to The <Carters> on Kept')
    expect(email.text).toContain('https://kept-ledger.com/mcp')
    expect(email.text).toContain('https://kept-ledger.com/app/')
    expect(email.html).toContain('The &lt;Carters&gt;')
    expect(email.html).not.toContain('people & things')
  })
})

describe('resendMailer', () => {
  it('posts the email to Resend and reports a refusal', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const ok = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{"id":"1"}') }) as typeof fetch
    await resendMailer({ apiKey: 're_test', from: 'Kept <noreply@kept-ledger.com>', fetch: ok }).sendSignInCode({ to: 'sam@example.com', code: '123456', link: 'https://x' })
    expect(calls[0]!.url).toBe('https://api.resend.com/emails')
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer re_test')
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ from: 'Kept <noreply@kept-ledger.com>', to: ['sam@example.com'], subject: '123 456 is your Kept code' })

    const refused = (async () => new Response('domain not verified', { status: 403 })) as typeof fetch
    await expect(resendMailer({ apiKey: 're_test', from: 'x', fetch: refused }).sendSignInCode({ to: 'a@b.c', code: '1', link: '' })).rejects.toThrow('Resend refused the email (403)')
  })
})
