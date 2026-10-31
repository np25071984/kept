import { z } from 'zod'

export const ClientParams = z.object({ client_id: z.string().min(1) })
export const ClientBody = z.object({
  name: z.string().min(1).max(60).describe('The assistant, e.g. "Gemini".'),
  redirect_uri: z.string().min(1).describe('The redirect URI the assistant shows for this connection.'),
})