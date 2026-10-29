// PKCE for the web UI's sign-in (RFC 7636): a random verifier, and its SHA-256 challenge.

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomString(byteCount = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteCount)))
}

export async function challengeFor(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}
