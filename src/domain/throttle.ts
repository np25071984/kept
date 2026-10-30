// How many sign-in codes may be sent in an hour, to one email and from one IP address (IMPLEMENTATION.md §5.4).
export const CODE_WINDOW_MS = 60 * 60_000
export const CODES_PER_EMAIL = 5
export const CODES_PER_IP = 30

// Whether another code may be sent, given when earlier codes went to the same email and from the same IP address.
export function codeAllowed(toEmail: readonly Date[], fromIp: readonly Date[], now: Date): boolean {
  const since = now.getTime() - CODE_WINDOW_MS
  const recent = (times: readonly Date[]) => times.filter((t) => t.getTime() > since).length
  return recent(toEmail) < CODES_PER_EMAIL && recent(fromIp) < CODES_PER_IP
}
