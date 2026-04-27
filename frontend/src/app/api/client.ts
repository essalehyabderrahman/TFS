import type { HttpMethod, RequestOptions } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Tracks whether a refresh is already in flight to avoid parallel refresh storms
let _refreshPromise: Promise<boolean> | null = null

function getCsrfToken(): string {
  return document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] ?? ""
}

async function attemptRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
      })
      if (!res.ok) {
        // Refresh failed — session truly expired or revoked
        const { getSignOut } = await import("@/app/context/AuthContext")
        const signOut = getSignOut()
        if (signOut) await signOut()
        // Redirect to signin with expired notice
        window.location.href = "/signin?reason=session_expired"
        return false
      }
      return true
    } catch {
      return false
    } finally {
      _refreshPromise = null
    }
  })()
  return _refreshPromise
}

/**
 * Enhanced API request helper.
 * Strictly communicates with the configured backend and throws on error.
 * Automatically transmits strictly-enforced HttpOnly session cookies.
 * Intercepts TOKEN_EXPIRED 401 → attempts silent refresh → retries once.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured. Please check your .env file.");
  }

  const url = `${API_BASE_URL}${path}`;
  const { method = "GET" as HttpMethod, body, headers = {} } = options;

  const csrfHeader: Record<string, string> = ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase())
    ? { "X-CSRF-Token": getCsrfToken() }
    : {};

  const makeRequest = () => fetch(url, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeader,
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  let response = await makeRequest()

  // [Session] Intercept TOKEN_EXPIRED — attempt silent refresh then retry once
  if (response.status === 401) {
    let errorCode: string | null = null
    try {
      const cloned = response.clone()
      const errorData = await cloned.json()
      errorCode = errorData.error ?? null
    } catch { /* ignore */ }

    if (errorCode === "TOKEN_EXPIRED") {
      const refreshed = await attemptRefresh()
      if (refreshed) {
        // Update CSRF header with potentially new cookie after refresh
        if (csrfHeader["X-CSRF-Token"] !== undefined) {
          csrfHeader["X-CSRF-Token"] = getCsrfToken()
        }
        response = await makeRequest()
      } else {
        // attemptRefresh already signed out and redirected
        throw new Error("SESSION_EXPIRED")
      }
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // JSON parsing failed, use default message
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = (await response.json()) as T;
  return data;
}
