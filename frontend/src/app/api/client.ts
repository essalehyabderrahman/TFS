import type { HttpMethod, RequestOptions } from "@/types";
import { getToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Generic helper that will try to talk to a real backend first.
 * If no API base URL is configured or the request fails, it falls
 * back to the provided mock data so the UI keeps working.
 * Automatically attaches the JWT Bearer token if one is stored.
 */
export async function fetchWithFallback<T>(
  path: string,
  fallback: T,
  options: RequestOptions = {},
): Promise<T> {
  // No backend configured – just use the fallback.
  if (!API_BASE_URL) {
    return Promise.resolve(fallback);
  }

  const url = `${API_BASE_URL}${path}`;

  try {
    const { method = "GET" as HttpMethod, body, headers = {} } = options;

    // Attach JWT token if available
    const token = getToken();
    const authHeader: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
        ...headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Request to ${url} failed with status ${response.status}`);
    }

    // If the backend returns no body for some operations, just return fallback.
    if (response.status === 204) {
      return fallback;
    }

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    console.warn("[api] Falling back to mock data for", path, error);
    return fallback;
  }
}
