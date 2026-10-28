export function normalizeMerchant(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export type MerchantRelation = 'same' | 'unknown' | 'different'

// Card statements show descriptors such as "SQ *BLUE BTL 0423" that rarely spell the merchant out, so two names that don't
// match are "different" only when neither looks like a descriptor.
export function relateMerchants(a: string | null | undefined, b: string | null | undefined): MerchantRelation {
  if (!a || !b) return 'unknown'
  const na = normalizeMerchant(a)
  const nb = normalizeMerchant(b)
  if (na === nb) return 'same'
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return 'same'
  const tokensA = significantTokens(na)
  if (significantTokens(nb).some((token) => tokensA.includes(token))) return 'same'
  return looksLikeDescriptor(a) || looksLikeDescriptor(b) ? 'unknown' : 'different'
}

export function looksLikeDescriptor(merchant: string): boolean {
  return /[*#]/.test(merchant) || /\d{3,}/.test(merchant) || (merchant === merchant.toUpperCase() && /[A-Z]{2,}/.test(merchant))
}

function significantTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token.length >= 4)
}