import { z } from 'zod'

// The REST API's schemas. Request schemas validate requests, generate the OpenAPI spec (IMPLEMENTATION.md §6) and are
// the MCP tools' input schemas (§5.1), so a description is written for both a developer and a model. The ledger and the
// web UI take their types from them.

// Limits the MCP tools share, so a tool never accepts what the API refuses.
export const MIN_AMOUNT = 0.01
export const MIN_SHARE = 0.000001
export const MAX_BATCH = 500
export const MAX_PAGE = 500

export const localDate = (description: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe(description)
export const LocalDate = localDate('Local date, YYYY-MM-DD.')
export const Amount = z.number().min(MIN_AMOUNT).describe('In the household currency.')
export const Id = z.uuid()

// A query string carries text: one value of a repeatable key arrives bare, and numbers and booleans as strings.
// JSON from an MCP tool passes through unchanged.
export const many = (description: string) => z.preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(z.string())).describe(description)
export const flag = (description: string) => z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).describe(description)

export const IdParams = z.object({ id: Id })

// Responses. The ledger returns these shapes (z.infer) and the web UI reads them, so a field missing here is a type
// error on both sides; the serializer drops anything else. The server makes these values, so a format names them
// without Zod's validation patterns.
export const Timestamp = z.string().meta({ format: 'date-time', description: 'ISO 8601, UTC.' })
export const ResponseId = z.string().meta({ format: 'uuid' })

export const ErrorBody = z.object({
  error: z.object({
    code: z.string().describe('E.g. "unknown_category".'),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional().describe('E.g. the known categories for an unknown one.'),
  }),
}).meta({ id: 'Error' })