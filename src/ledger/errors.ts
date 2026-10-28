export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found.`)
export const forbidden = (message: string) => new ApiError(403, 'forbidden', message)
export const invalid = (code: string, message: string, details?: Record<string, unknown>) => new ApiError(422, code, message, details)
export const conflict = (code: string, message: string) => new ApiError(409, code, message)

export function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string; message: string }): T {
  if (!result.ok) throw invalid(result.error, result.message)
  return result.value
}