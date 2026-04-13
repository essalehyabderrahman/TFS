// src/app/lib/csrfFetch.ts
//
// Drop-in replacement for fetch() that automatically reads the
// csrf_token cookie set by the backend and injects it as the
// X-CSRF-Token header on every non-safe request.

const CSRF_COOKIE  = "csrf_token";
const CSRF_HEADER  = "X-CSRF-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getCsrfToken(): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * Wraps fetch() and injects the CSRF header on mutating requests.
 * All other behaviour (credentials, headers, body) is passed through
 * unchanged.
 *
 * Always pass `credentials: "include"` in init so the session cookie
 * travels with the request — e.g.:
 *   csrfFetch("/auth/signin", { method: "POST", credentials: "include", ... })
 */
export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();

  if (!SAFE_METHODS.has(method)) {
    const token = getCsrfToken();
    if (!token) {
      throw new Error(
        "[csrfFetch] csrf_token cookie not found. " +
        "Ensure the backend has responded at least once before making " +
        "a mutating request."
      );
    }
    init.headers = {
      ...init.headers,
      [CSRF_HEADER]: token,
    };
  }

  return fetch(input, init);
}
