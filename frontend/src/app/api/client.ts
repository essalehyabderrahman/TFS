import type { HttpMethod, RequestOptions } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Enhanced API request helper.
 * Strictly communicates with the configured backend and throws on error.
 * Automatically transmits strictly-enforced HttpOnly session cookies.
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

  // Attach CSRF header for mutation methods
  const csrfHeader: Record<string, string> = ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase())
    ? { "X-TFS-CSRF": "true" }
    : {};

  const response = await fetch(url, {
    method,
    credentials: "include", // Important: ensures session cookies are transmitted on all calls
    headers: {
      "Content-Type": "application/json",
      ...csrfHeader,
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

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
