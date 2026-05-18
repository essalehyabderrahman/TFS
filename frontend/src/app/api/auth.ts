import { csrfFetch } from "@/app/lib/csrfFetch"
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

interface MfaPayload {
  code: string
}

interface AuthResponse {
  ok: boolean
  user?: AuthUser
  mfaRequired?: boolean
  mfaPending?: boolean
  error?: string
}

interface MfaSetupResponse {
  ok: boolean
  secret?: string
  qrCode?: string
  backupCode?: string
  error?: string
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function apiSignIn(payload: SignInPayload): Promise<AuthResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) throw new Error("API_BASE_URL not configured")

  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/signin`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      const csrfErrors: Record<string, string> = {
        CSRF_TOKEN_MISSING: "Session error. Please refresh the page.",
        CSRF_TOKEN_INVALID: "Session error. Please refresh the page.",
      }
      if (csrfErrors[data.error]) return { ok: false, error: data.error }
      return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiSignUp(payload: SignUpPayload): Promise<AuthResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) throw new Error("API_BASE_URL not configured")

  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.error === "CSRF_TOKEN_MISSING" || data.error === "CSRF_TOKEN_INVALID")
        return { ok: false, error: data.error }
      return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiVerifyMfa(payload: MfaPayload): Promise<AuthResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) throw new Error("API_BASE_URL not configured")

  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/mfa/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.error === "CSRF_TOKEN_MISSING" || data.error === "CSRF_TOKEN_INVALID")
        return { ok: false, error: data.error }
      if (data.error === "MFA_CODE_ALREADY_USED")
        return { ok: false, error: "This code has already been used. Please wait for a new code." }
      return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiSetupMfa(): Promise<MfaSetupResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) throw new Error("API_BASE_URL not configured")

  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/mfa/setup`, {
      method: "POST",
      credentials: "include",
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.error === "CSRF_TOKEN_MISSING" || data.error === "CSRF_TOKEN_INVALID")
        return { ok: false, error: data.error }
      return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiEnableMfa(code: string): Promise<AuthResponse> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) throw new Error("API_BASE_URL not configured")

  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/mfa/enable`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.error === "CSRF_TOKEN_MISSING" || data.error === "CSRF_TOKEN_INVALID")
        return { ok: false, error: data.error }
      return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    }
    return { ok: true, ...data }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiGetMe(): Promise<AuthResponse> {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
    if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }

    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      credentials: "include",
    })
    const data = await res.json()

    if (!res.ok) {
      return { ok: false, error: data.error }
    }
    return { ok: true, user: data.user, mfaPending: Boolean(data.mfaPending) }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiGetAccount(): Promise<any> {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
      if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }
  
      const res = await fetch(`${API_BASE_URL}/account`, {
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "NETWORK_ERROR" }
    }
}

export async function apiSignOut(): Promise<void> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL) {
    try {
      await csrfFetch(`${API_BASE_URL}/auth/signout`, { 
        method: "POST", 
        credentials: "include",
      })
    } catch (e) {
      console.warn("Failed to signout on backend", e)
    }
  }
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<any> {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
      if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }
  
      const res = await csrfFetch(`${API_BASE_URL}/account/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === "CSRF_TOKEN_MISSING" || data.error === "CSRF_TOKEN_INVALID")
          return { ok: false, error: data.error }
        return { ok: false, error: data.error }
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "NETWORK_ERROR" }
    }
}

export async function apiDeleteAccount(): Promise<any> {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
      if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }
  
      const res = await csrfFetch(`${API_BASE_URL}/account`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) {
        return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "NETWORK_ERROR" }
    }
}

export async function apiRegenerateBackupCode(totpCode: string): Promise<{ ok: boolean; backupCode?: string; error?: string }> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }
  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/mfa/backup-code/regenerate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.error === "CSRF_TOKEN_MISSING" || data.error === "CSRF_TOKEN_INVALID")
        return { ok: false, error: data.error }
      return { ok: false, error: data.error ?? "UNKNOWN_ERROR" }
    }
    return { ok: true, backupCode: data.backupCode }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}


export async function apiForgotPassword(email: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }
  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error }
    return { ok: true, message: data.message }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

export async function apiResetPassword(payload: { token: string; password: string }): Promise<{ ok: boolean; message?: string; error?: string }> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  if (API_BASE_URL === undefined) return { ok: false, error: "NO_BACKEND" }
  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error }
    return { ok: true, message: data.message }
  } catch {
    return { ok: false, error: "NETWORK_ERROR" }
  }
}

// ── Recovery requests (admin) ────────────────────────────────────────────────
export async function apiListRecoveryRequests(status = "pending") {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  const res = await csrfFetch(`${API_BASE_URL}/auth/recovery-requests?status=${status}`);
  if (!res.ok) return [];
  return res.json();
}

export async function apiRejectRecoveryRequest(id: string) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  const res = await csrfFetch(`${API_BASE_URL}/auth/recovery-requests/${id}/reject`, { method: "POST" });
  return res.json();
}

/**
 * Admin sets a temporary password for the user behind a recovery request.
 * Pass `auto: true` to let the backend generate one, or provide `password` manually.
 * Returns `{ ok, password, userEmail, userName }`.
 */
export async function apiSetRecoveryPassword(
  id: string,
  opts: { password?: string; auto?: boolean }
): Promise<{ ok: boolean; password?: string; userEmail?: string; userName?: string; error?: string }> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/recovery-requests/${id}/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "UNKNOWN_ERROR" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

/**
 * Admin sends a fully custom email and marks the request as approved.
 * Returns `{ ok, emailSent }`.
 */
export async function apiSendRecoveryEmail(
  id: string,
  payload: { to: string; subject: string; body: string }
): Promise<{ ok: boolean; emailSent?: boolean; error?: string }> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  try {
    const res = await csrfFetch(`${API_BASE_URL}/auth/recovery-requests/${id}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "UNKNOWN_ERROR" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

export async function apiSubmitRecoveryRequest(payload: {
  email: string;
  fullName: string;
  message?: string;
  mfaCode?: string;
}) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  const res = await csrfFetch(`${API_BASE_URL}/auth/recovery-request`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, ...data };
}
