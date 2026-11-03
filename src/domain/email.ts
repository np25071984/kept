// Whether a typed address has the shape of a deliverable email, checked before the sign-in page touches the database
// (IMPLEMENTATION.md §5.4): a local part, and a host name with a top-level domain of letters.
const LOCAL = /^[^\s@"(),:;<>[\\\]]{1,64}$/u
const LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u
const TOP = /^\p{L}{2,63}$/u

// Whether sending a code to `email` needs the human check: always, unless this sign-in already sent a code to the same
// address. The code page's "Send a new code" then works without one, and reaches no address the check didn't pass.
export function humanCheckNeeded(sentTo: string | null, email: string): boolean {
  return sentTo === null || sentTo !== email.trim().toLowerCase()
}

export function validEmail(value: string): boolean {
  if (value.length > 254) return false
  const at = value.lastIndexOf('@')
  if (at < 0) return false
  const local = value.slice(0, at)
  const labels = value.slice(at + 1).split('.')
  if (!LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  return labels.length >= 2 && labels.every((label) => LABEL.test(label)) && TOP.test(labels.at(-1)!)
}
