import type { AuthUser } from "@/types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignInPayload {
  email: string
  password: string
}

interface SignUpPayload {
  name: string
  email: string
  password: string
}

interface AuthResponse {
  ok: boolean
  user?: AuthUser
  token?: string
  mfaRequired?: boolean
  tempToken?: string
  error?: string
}

// ── Token helpers ─────────────────────────────────────────────────────────────

const TOKEN_KEY = "tfs_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function apiSignIn(payload: SignInPayload): Promise<AuthResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (!API_BASE_URL) {
    // Mock mode — simulate a successful sign-in
    await new Promise((r) => setTimeout(r, 800))
    const mockUser: AuthUser = {
      id: "mock-1",
      name: "Admin User",
      email: payload.email,
      role: "admin",
    }
    return { ok: true, user: mockUser, token: "mock-token" }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiSignUp(payload: SignUpPayload): Promise<AuthResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 800))
    return { ok: true }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiGetMe(): Promise<AuthResponse> {
  const token = getToken()
  if (!token) return { ok: false, error: "NO_TOKEN" }

  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
    if (!API_BASE_URL) return { ok: false, error: "NO_BACKEND" }

    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error }
    return { ok: true, user: data.user }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiSignOut(): Promise<void> {
  clearToken()
}
