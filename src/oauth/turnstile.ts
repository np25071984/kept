// Cloudflare Turnstile on the sign-in email page: a code is sent only for a browser Cloudflare judges to be a person
// (IMPLEMENTATION.md §5.4).
export interface HumanCheck {
  siteKey: string
  verify(token: string, ip: string): Promise<boolean>
}

export const TURNSTILE_FIELD = 'cf-turnstile-response'
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Cloudflare's answer, or null when it couldn't be reached. An outage lets sign-in through, still under the code limits.
export function turnstilePassed(answer: { success?: unknown } | null): boolean {
  return answer === null || answer.success === true
}

export function turnstile(siteKey: string, secretKey: string, fetcher: typeof fetch = fetch): HumanCheck {
  return {
    siteKey,
    async verify(token, ip) {
      if (!token) return false
      let answer: { success?: unknown } | null = null
      try {
        const response = await fetcher(SITEVERIFY, { method: 'POST', body: new URLSearchParams({ secret: secretKey, response: token, remoteip: ip }), signal: AbortSignal.timeout(5000) })
        if (response.ok) answer = (await response.json()) as { success?: unknown }
      } catch {
        answer = null
      }
      return turnstilePassed(answer)
    },
  }
}
