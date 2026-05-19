import type { HttpMethod, RequestOptions } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function getCsrfToken(): string {
  return document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] ?? ""
}


let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing) return refreshPromise!;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        }
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
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
  if (response.status === 401) {
    let errorCode: string | null = null
    try {
      const cloned = response.clone()
      const errorData = await cloned.json()
      errorCode = errorData.error ?? null
    } catch { /* ignore */ }

    if (errorCode === "TOKEN_EXPIRED" && !path.includes("/auth/refresh") && !path.includes("/auth/signin") && !path.includes("/auth/signup")) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        response = await makeRequest();
        if (response.ok) {
          if (response.status === 204) return {} as T;
          return (await response.json()) as T;
        }
        try {
          const clonedRetry = response.clone()
          const retryData = await clonedRetry.json()
          errorCode = retryData.error ?? null
        } catch { /* ignore */ }
      }
    }

    if (errorCode === "TOKEN_EXPIRED" || errorCode === "SESSION_EXPIRED") {
      const { getExpireSession, getIsAuthenticated } = await import("@/app/context/AuthContext")
      const expireSession = getExpireSession()
      const isAuthenticated = getIsAuthenticated()
      if (expireSession && isAuthenticated) await expireSession("inactivity")
      throw new Error("SESSION_EXPIRED")
    } else if (errorCode === "SESSION_REVOKED") {
      const { getExpireSession, getIsAuthenticated } = await import("@/app/context/AuthContext")
      const expireSession = getExpireSession()
      const isAuthenticated = getIsAuthenticated()
      if (expireSession && isAuthenticated) await expireSession("revoked")
      throw new Error("SESSION_REVOKED")
    } else {
      // General 401 (invalid credentials, missing token, deleted user, etc.)
      const { getExpireSession, getIsAuthenticated } = await import("@/app/context/AuthContext")
      const expireSession = getExpireSession()
      const isAuthenticated = getIsAuthenticated()
      if (!path.includes("/auth/signin") && !path.includes("/auth/signup")) {
        if (expireSession && isAuthenticated) await expireSession("unauthorized")
      }
      throw new Error("UNAUTHORIZED")
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
