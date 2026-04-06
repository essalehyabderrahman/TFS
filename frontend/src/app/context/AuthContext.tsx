import { createContext, useContext, useState, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import type { AuthUser } from "@/types"
import { apiGetMe, getToken, clearToken } from "@/app/api/auth"

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  isBackendReachable: boolean
  signIn: (user: AuthUser) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isBackendReachable, setIsBackendReachable] = useState(true)

  // On mount: attempt to restore session from localStorage token
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsInitializing(false)
      setIsBackendReachable(!!import.meta.env.VITE_API_BASE_URL)
      return
    }

    apiGetMe()
      .then((result) => {
        if (result.ok && result.user) {
          setUser(result.user)
          setIsBackendReachable(true)
        } else if (result.error === "NETWORK_ERROR") {
          // If it's a network error, don't clear the token!
          // We keep whatever we had (or null if it's the first load)
          setIsBackendReachable(false)
        } else {
          // Token is truly stale / invalid
          clearToken()
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

  const signIn = useCallback((u: AuthUser) => {
    setUser(u)
    setIsBackendReachable(true)
  }, [])

  const signOut = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isInitializing,
        isBackendReachable,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>")
  return ctx
}
