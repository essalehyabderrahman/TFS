import { createContext, useState, useCallback, useEffect, useRef } from "react"
import type { ReactNode } from "react"
import type { AuthUser } from "@/types"
import { apiGetMe, apiSignOut } from "@/app/api/auth"

export type SessionExpiredReason = "inactivity" | "absolute" | "revoked" | "unauthorized"

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isMfaPending: boolean
  isPasswordResetRequired: boolean
  isInitializing: boolean
  isBackendReachable: boolean
  isAppAdmin: boolean
  isRootAdmin: boolean    // true only for the seeded superadmin (root-like account)
  isGroupAdmin: boolean   // true if user is admin in at least one group
  sessionExpiredReason: SessionExpiredReason | null
  setIsGroupAdmin: (value: boolean) => void
  signIn: (user: AuthUser, mfaPending?: boolean) => void
  clearSession: () => void
  signOut: () => void
  expireSession: (reason: SessionExpiredReason) => void
  dismissExpiredSession: () => void
  // [Security] Called after a successful forced-password-change so the restricted
  // layout is unlocked without requiring a full page reload or re-login.
  clearPasswordResetRequired: () => void
}

// Module-level refs so apiRequest interceptor can trigger signout / session expiry
// without needing to be inside the React tree
let _signOutRef: (() => void) | null = null
let _expireSessionRef: ((reason: SessionExpiredReason) => void) | null = null

export function getSignOut(): (() => void) | null {
  return _signOutRef
}
export function getExpireSession(): ((reason: SessionExpiredReason) => void) | null {
  return _expireSessionRef
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const userRef = useRef<AuthUser | null>(null)
  
  useEffect(() => {
    userRef.current = user
  }, [user])

  const [isMfaPending, setIsMfaPending] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isPasswordResetRequired, setIsPasswordResetRequired] = useState(false)
  const [isBackendReachable, setIsBackendReachable] = useState(true)
  const [isGroupAdmin, setIsGroupAdmin] = useState(false)
  const [sessionExpiredReason, setSessionExpiredReason] = useState<SessionExpiredReason | null>(null)

  // On mount: attempt to restore session by hitting /auth/me
  // If the browser holds a valid HttpOnly session cookie, this will succeed.
  useEffect(() => {

    apiGetMe()
      .then((result) => {
        if (result.ok && result.user) {
          setUser(result.user)
          setIsMfaPending(Boolean(result.mfaPending))
          setIsPasswordResetRequired(Boolean(result.user.passwordResetRequired))
          setIsBackendReachable(true)
          
          // [FIX 18] Restore isGroupAdmin status on reload
          if (result.user?.role === "admin") {
            setIsGroupAdmin(true)
          } else {
            import("@/app/api/groups").then(({ fetchGroups }) => {
              fetchGroups().then(({ data }) => {
                const isAdmin = data.some(g => g.myRole === "admin")
                setIsGroupAdmin(isAdmin)
              }).catch(() => {})
            })
          }
        } else if (result.error === "MFA_REQUIRED") {
          // Stale MFA-pending cookie on load — treat as unauthenticated.
          // The cookie will expire naturally (5 min). Don't set isMfaPending
          // here because no active MFA flow is in progress.
          setIsBackendReachable(true)
        } else if (result.error === "NETWORK_ERROR") {
          setIsBackendReachable(false)
        } else {
          // 401 Unauthorized or other → no valid session
          setIsBackendReachable(true)
        }
      })
      .catch(() => {
        // Fallback for unexpected errors (still could be network)
        setIsBackendReachable(false)
      })
      .finally(() => {
        setIsInitializing(false)
      })
  }, [])

  // [Session] Track user activity to proactively refresh the token
  const lastActivityRef = useRef<number>(Date.now())

  // [Fix] Guard against race condition: in-flight requests returning 401
  // after an intentional sign-out would trigger expireSession and show the
  // "session expired" modal even though the user already signed out.
  const isSigningOutRef = useRef(false)
  useEffect(() => {
    const updateActivity = () => { lastActivityRef.current = Date.now() }
    window.addEventListener("mousemove", updateActivity, { passive: true })
    window.addEventListener("keydown", updateActivity, { passive: true })
    window.addEventListener("click", updateActivity, { passive: true })
    window.addEventListener("scroll", updateActivity, { passive: true })
    return () => {
      window.removeEventListener("mousemove", updateActivity)
      window.removeEventListener("keydown", updateActivity)
      window.removeEventListener("click", updateActivity)
      window.removeEventListener("scroll", updateActivity)
    }
  }, [])

  // [Session] Proactive token refresh based on activity
  useEffect(() => {
    // Only proactively refresh if we have a fully authenticated user
    if (!user || isMfaPending) return

    // Token expires in 15 minutes. We check every 4 minutes.
    const REFRESH_INTERVAL_MS = 4 * 60 * 1000
    const interval = setInterval(async () => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current
      // If user was active within the last refresh interval
      if (timeSinceLastActivity < REFRESH_INTERVAL_MS) {
        try {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
          const { csrfFetch } = await import("@/app/lib/csrfFetch")
          await csrfFetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          })
        } catch (e) {
          // Silent catch — if it fails, the apiRequest interceptor will handle
          // the expiration when the user makes a real request.
        }
      }
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [user, isMfaPending])

  const signIn = useCallback((u: AuthUser, mfaPending = false) => {
    setUser(u)
    setIsMfaPending(mfaPending)
    setIsPasswordResetRequired(Boolean(u.passwordResetRequired))
    setIsBackendReachable(true)
  }, [])

  const clearSession = useCallback(() => {
    setUser(null)
    setIsMfaPending(false)
    setIsGroupAdmin(false)
  }, [])

  const signOut = useCallback(async () => {
    // [Fix] Set guard BEFORE the async call so any 401s from in-flight
    // background requests that resolve during sign-out don't trigger expireSession.
    isSigningOutRef.current = true
    try {
      await apiSignOut()
    } catch {
      // Ignore — cookie may already be invalid if the token expired at the
      // exact moment the user clicked sign-out. The session is being terminated
      // intentionally regardless.
    } finally {
      setUser(null)
      setIsMfaPending(false)
      setIsGroupAdmin(false)
      setSessionExpiredReason(null)
      isSigningOutRef.current = false
    }
  }, [])

  // [Security] expireSession: clears the server-side HttpOnly cookie immediately,
  // wipes all local auth state, then surfaces the modal with the correct reason.
  // The cookie is destroyed before the modal renders — the user has no valid session
  // during the modal window regardless of how they interact with it.
  const expireSession = useCallback(async (reason: SessionExpiredReason) => {
    // [Fix] Suppress modal if an intentional sign-out is already in progress.
    // This prevents in-flight 401 responses from background requests showing
    // a spurious "session terminated" popup after the user has already signed out.
    if (isSigningOutRef.current) return

    // [Fix] Do not show a session expired modal if the user is already logged out.
    // This handles cases where a delayed 401 response from a background request
    // arrives after the sign-out process has completely finished.
    if (userRef.current === null) return

    await apiSignOut()          // nuke HttpOnly cookie server-side first
    setUser(null)
    setIsMfaPending(false)
    setIsGroupAdmin(false)
    setSessionExpiredReason(reason)
  }, [])

  const dismissExpiredSession = useCallback(() => {
    setSessionExpiredReason(null)
  }, [])

  const clearPasswordResetRequired = useCallback(() => {
    setIsPasswordResetRequired(false)
  }, [])

  // Keep module-level refs in sync so apiRequest interceptor can call them
  useEffect(() => {
    _signOutRef = signOut
    _expireSessionRef = expireSession
    return () => {
      _signOutRef = null
      _expireSessionRef = null
    }
  }, [signOut, expireSession])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isMfaPending,
        isPasswordResetRequired,
        isInitializing,
        isBackendReachable,
        isAppAdmin: user?.role === "admin",
        isRootAdmin: user?.role === "admin" && user?.isRoot === true,
        isGroupAdmin,
        sessionExpiredReason,
        setIsGroupAdmin,
        signIn,
        signOut,
        clearSession,
        expireSession,
        dismissExpiredSession,
        clearPasswordResetRequired,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}



