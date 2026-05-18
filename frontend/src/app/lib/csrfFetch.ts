// src/app/lib/csrfFetch.ts
//
// Drop-in replacement for fetch() that automatically reads the
// csrf_token cookie set by the backend and injects it as the
// X-CSRF-Token header on every non-safe request.
//
// Special handling: if the request body is FormData, Content-Type is
// explicitly removed so the browser can generate the correct
// "multipart/form-data; boundary=..." header automatically.
// Manually setting Content-Type on a FormData request corrupts the
// boundary and causes Flask's request.files to appear empty (→ 400).

const CSRF_COOKIE  = "csrf_token"
const CSRF_HEADER  = "X-CSRF-Token"
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

function getCsrfToken(): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CSRF_COOKIE}=`))
  return match ? decodeURIComponent(match.split("=")[1]) : null
}

/**
 * Normalises an incoming headers value into a plain Record<string,string>
 * regardless of whether it was passed as a Headers instance, a plain object,
 * or a [string, string][] array.
 */
function normaliseHeaders(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const out: Record<string, string> = {}
    headers.forEach((v, k) => { out[k] = v })
    return out
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...(headers as Record<string, string>) }
}

/**
 * Wraps fetch() and injects the CSRF header on mutating requests.
 *
 * For FormData bodies the Content-Type header is stripped so the browser
 * can supply the multipart boundary automatically.
 *
 * Always pass `credentials: "include"` in init so the session cookie
 * travels with the request — e.g.:
 *   csrfFetch("/auth/signin", { method: "POST", credentials: "include", ... })
 */
export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase()

  if (!SAFE_METHODS.has(method)) {
    const token = getCsrfToken()
    if (!token) {
      throw new Error(
        "[csrfFetch] csrf_token cookie not found. " +
        "Ensure the backend has responded at least once before making " +
        "a mutating request."
      )
    }

    const headers = normaliseHeaders(init.headers)

    // Strip Content-Type for FormData — the browser MUST set this itself
    // so it can embed the correct multipart boundary string.
    if (init.body instanceof FormData) {
      delete headers["Content-Type"]
      delete headers["content-type"] // handle any lowercase variant
    }

    init.headers = {
      ...headers,
      [CSRF_HEADER]: token,
    }
  }

  return fetch(input, init)
}
