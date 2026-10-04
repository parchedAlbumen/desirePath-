// Turns a failed fetch into an Error whose message says what actually went wrong, and logs the details
// to the browser console (open DevTools > Console) so we can debug without guessing from a status code.

export class ApiError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const BACKEND_HINT = "Can't reach the backend. Is it running on port 8000?"

/** FastAPI sends "detail" as a string (our own errors) or a list of field errors (422 validation). */
function readDetail(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((item: { loc?: unknown[]; msg?: string }) => {
      const field = item.loc?.filter((part) => part !== 'body').join('.')
      return field ? `${field}: ${item.msg}` : item.msg
    })
    return messages.filter(Boolean).join('; ') || null
  }
  return null
}

function hintForStatus(status: number): string {
  if (status === 502 || status === 503 || status === 504) return `${BACKEND_HINT} (HTTP ${status})`
  if (status === 404) return 'Endpoint not found (HTTP 404). Is the backend up to date?'
  if (status === 429) return 'Too many requests (HTTP 429). Wait a bit and try again.'
  if (status >= 500) return `Server error (HTTP ${status}). Check the backend terminal for the traceback.`
  return `Request failed (HTTP ${status})`
}

/** Call when `response.ok` is false. `what` is a short label like "Sign up" or "POST /routes/generate". */
export async function errorFromResponse(response: Response, what: string): Promise<ApiError> {
  const text = await response.text().catch(() => '')
  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // Not JSON: a proxy error page or plain text. Logged below.
  }
  const message = readDetail(body) ?? hintForStatus(response.status)
  console.error(`[api] ${what} failed: HTTP ${response.status} ${response.url}`, text.slice(0, 500) || '(empty body)')
  return new ApiError(message, response.status)
}

/** Call when fetch itself threw (backend down, DNS, offline). */
export function errorFromNetwork(what: string, cause: unknown): ApiError {
  console.error(`[api] ${what} failed before getting a response:`, cause)
  return new ApiError(BACKEND_HINT, null)
}
