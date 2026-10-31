import { z } from 'zod'

const Name = z.string().min(1)

export const SetupPatch = z.object({
  name: Name.optional(),
  currency: z.string().length(3).optional().describe('ISO 4217, e.g. "USD". Owners only, before the first purchase.'),
  timezone: z.string().optional().describe('The household\'s IANA time zone. Owners only.'),
  steps: z.record(z.string(), z.enum(['pending', 'done', 'later'])).optional().describe('basics, cost_centers, categories, watch, invite.'),
  introduced: z.literal(true).optional().describe('The caller has been introduced to Kept.'),
})

export const MePatch = z.object({ name: Name.optional(), language: z.enum(['en', 'ru']).nullish() })
export const MemberPatch = z.object({ role: z.enum(['owner', 'member']) })
export const InviteBody = z.object({ email: z.email() })
export const AcceptBody = z.object({ token: z.string().min(10), name: Name })
export const ApiKeyBody = z.object({ name: Name })