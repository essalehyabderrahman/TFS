import type { HttpMethod, RequestOptions } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function getCsrfToken(): string {
  return document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] ?? ""
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

  // [Session] Intercept expired/invalidated sessions.
  // TOKEN_EXPIRED   → natural 15-min JWT expiry    → attempt silent refresh; if refresh
  //                   returns SESSION_EXPIRED (idle grace exceeded) show inactivity modal
  // UNAUTHORIZED    → invalid/missing token         → attempt silent refresh; show modal if fails
  // SESSION_EXPIRED → 8-hour absolute wall OR idle  → show modal immediately (no refresh)
  // SESSION_REVOKED → password changed elsewhere    → show modal immediately (no refresh)
  // All other 401s (INVALID_CREDENTIALS etc.) pass through untouched.
  if (response.status === 401) {
    let errorCode: string | null = null
    try {
      const cloned = response.clone()
      const errorData = await cloned.json()
      errorCode = errorData.error ?? null
    } catch { /* ignore */ }

    if (errorCode === "UNAUTHORIZED") {
      // Token has expired — show the inactivity modal immediately.
      // Do NOT attempt a silent refresh here: the 15-min idle timeout
      // is intentional and the user must re-authenticate.
      // Silent refresh is only valid from the /auth/refresh polling path,
      // not from mid-flight API call failures.
      const { getExpireSession } = await import("@/app/context/AuthContext")
      const expireSession = getExpireSession()
      if (expireSession) await expireSession("inactivity")
      throw new Error("SESSION_EXPIRED")
    } else if (errorCode === "SESSION_EXPIRED") {
      // Returned directly by the refresh endpoint when the 8-hr absolute wall
      // is hit, or by middleware when session_created_at is too old.
      const { getExpireSession } = await import("@/app/context/AuthContext")
      const expireSession = getExpireSession()
      if (expireSession) await expireSession("absolute")
      throw new Error("SESSION_EXPIRED")
    } else if (errorCode === "SESSION_REVOKED") {
      const { getExpireSession } = await import("@/app/context/AuthContext")
      const expireSession = getExpireSession()
      if (expireSession) await expireSession("revoked")
      throw new Error("SESSION_REVOKED")
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
