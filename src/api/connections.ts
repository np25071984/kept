import { z } from 'zod'
import { Timestamp } from './common.js'

export const ClientParams = z.object({ client_id: z.string().min(1) })
export const ClientBody = z.object({
  name: z.string().min(1).max(60).describe('The assistant, e.g. "Gemini".'),
  redirect_uri: z.string().min(1).describe('The redirect URI the assistant shows for this connection.'),
})

export const Connection = z.object({
  client_id: z.string(),
  name: z.string(),
  web: z.boolean().describe('Kept\'s own web UI.'),
  connected_at: Timestamp,
  last_used_at: Timestamp,
})
export const CreatedClient = z.object({ client_id: z.string(), client_secret: z.string().describe('Shown once.') })
