import { z } from 'zod'
import { ResponseId, Timestamp } from './common.js'

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

const Step = SetupPatch.shape.steps.unwrap().valueType
export const Setup = z.object({
  household: z.object({
    name: z.string(),
    currency: z.string(),
    currency_locked: z.boolean().describe('Fixed once the household has a purchase.'),
    timezone: z.string(),
    steps: z.object({ basics: Step, cost_centers: Step, categories: Step, watch: Step, invite: Step }),
    next_step: z.enum(['basics', 'cost_centers', 'categories', 'watch', 'invite']).nullable(),
  }),
  you: z.object({ name: z.string(), email: z.string(), introduced: z.boolean(), role: MemberPatch.shape.role, language: MePatch.shape.language.unwrap() }),
  start: z.enum(['first_member', 'new_member', 'resume', 'done']).describe('Where the agent\'s conversation begins.'),
  today: z.string().describe('The household\'s local date.'),
})

export const Members = z.object({
  members: z.array(z.object({ id: ResponseId, name: z.string(), email: z.string(), role: MemberPatch.shape.role, you: z.boolean(), joined_at: Timestamp })),
  invites: z.array(z.object({ id: ResponseId, email: z.string(), sent_at: Timestamp, expires_at: Timestamp })),
})
export const Invite = z.object({ id: ResponseId, email: z.string(), expires_at: Timestamp })
export const Accepted = z.object({ user_id: ResponseId, api_key: z.string().describe('The member\'s first API key, shown once.') })

export const ApiKey = z.object({ id: ResponseId, name: z.string(), created_at: Timestamp, last_used_at: Timestamp.nullable() })
export const IssuedKey = z.object({ id: ResponseId, key: z.string().describe('Shown once.') })
