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

// A code expires after 10 minutes or 5 tries, right or wrong. A verified email has 15 minutes to join or create a household.
export const CODE_MINUTES = 10
export const MAX_ATTEMPTS = 5
export const JOIN_MINUTES = 15

// Whether a code may be checked, given its row after this try was counted: the count is raised before the code is
// compared, so tries sent at once each see their own number.
export function codeUsable(code: { expires_at: Date; attempts: number; verified_at: Date | null }, now: Date): boolean {
  return code.verified_at === null && code.expires_at.getTime() > now.getTime() && code.attempts <= MAX_ATTEMPTS
}

// Whether a verified email may still join or create a household.
export function withinJoinWindow(verifiedAt: Date | null, now: Date): boolean {
  return verifiedAt !== null && now.getTime() - verifiedAt.getTime() <= JOIN_MINUTES * 60_000
}

// How many invites a household may send in an hour and in a day: each one is an email from Kept with the household's name
// in it (IMPLEMENTATION.md §4).
export const INVITE_WINDOW_MS = 24 * 60 * 60_000
export const INVITES_PER_HOUR = 10
export const INVITES_PER_DAY = 30

// Whether the household may send another invite, given when its earlier ones went out.
export function inviteAllowed(sent: readonly Date[], now: Date): boolean {
  const within = (ms: number) => sent.filter((t) => t.getTime() > now.getTime() - ms).length
  return within(60 * 60_000) < INVITES_PER_HOUR && within(INVITE_WINDOW_MS) < INVITES_PER_DAY
}
