import { createContext, useState, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import type { AuthUser } from "@/types"
import { apiGetMe, apiSignOut } from "@/app/api/auth"

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isMfaPending: boolean
  isInitializing: boolean
  isBackendReachable: boolean
  isAppAdmin: boolean
  isGroupAdmin: boolean   // true if user is admin in at least one group
  signIn: (user: AuthUser, mfaPending?: boolean) => void
  clearSession: () => void
  signOut: () => void
}

// Module-level ref so apiRequest interceptor can trigger signout
// without needing to be inside the React tree
let _signOutRef: (() => void) | null = null
export function getSignOut(): (() => void) | null {
  return _signOutRef
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isMfaPending, setIsMfaPending] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isBackendReachable, setIsBackendReachable] = useState(true)

  // On mount: attempt to restore session by hitting /auth/me
  // If the browser holds a valid HttpOnly session cookie, this will succeed.
  useEffect(() => {

    apiGetMe()
      .then((result) => {
        if (result.ok && result.user) {
          setUser(result.user)
          setIsMfaPending(false)
          setIsBackendReachable(true)
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
    setIsBackendReachable(true)
  }, [])

  const clearSession = useCallback(() => {
    setUser(null)
    setIsMfaPending(false)
  }, [])

  const signOut = useCallback(async () => {
    // Explicitly call the backend to nuke the HttpOnly cookie
    await apiSignOut()
    setUser(null)
    setIsMfaPending(false)
  }, [])

  // Keep module-level ref in sync so apiRequest interceptor can call it
  useEffect(() => {
    _signOutRef = signOut
    return () => { _signOutRef = null }
  }, [signOut])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isMfaPending,
        isInitializing,
        isBackendReachable,
        isAppAdmin: user?.role === "admin",
        isGroupAdmin: false, // resolved per-page via fetchGroups — set true if any group has myRole==="admin"
        signIn,
        signOut,
        clearSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}



