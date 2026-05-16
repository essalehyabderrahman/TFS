import { createContext, useState, useCallback, useEffect } from "react"
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
    await apiSignOut()
    setUser(null)
    setIsMfaPending(false)
    setSessionExpiredReason(null)
  }, [])

  // [Security] expireSession: clears the server-side HttpOnly cookie immediately,
  // wipes all local auth state, then surfaces the modal with the correct reason.
  // The cookie is destroyed before the modal renders — the user has no valid session
  // during the modal window regardless of how they interact with it.
  const expireSession = useCallback(async (reason: SessionExpiredReason) => {
    await apiSignOut()          // nuke HttpOnly cookie server-side first
    setUser(null)
    setIsMfaPending(false)
    setIsGroupAdmin(false)
    setSessionExpiredReason(reason)
  }, [])

  const dismissExpiredSession = useCallback(() => {
    setSessionExpiredReason(null)
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
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}



