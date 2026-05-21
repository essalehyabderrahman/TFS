import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/app/hooks/useAuth"

/**
 * Protège toutes les routes enfants sous /app/*.
 * Attend la fin de l'hydratation de session avant de décider si
 * l'utilisateur doit être redirigé vers /signin.
 */
export function ProtectedRoute() {
  const { user, isAuthenticated, isMfaPending, isInitializing, sessionExpiredReason, isPasswordResetRequired } = useAuth()
  const location = useLocation()

  // While we're checking localStorage token → don't redirect yet
  if (isInitializing) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--popover)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "3px solid rgba(11,127,255,0.2)",
            borderTopColor: "#0B7FFF",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Mandatory Login check
  // [Session] Do NOT redirect if we are currently showing a session expiration modal.
  // This allows the user to see the explanation before being jumped to the sign-in page.
  if (!isAuthenticated && !isMfaPending && !sessionExpiredReason) {
    return <Navigate to="/signin" replace />
  }

  // [Security] Force password change if required by admin
  // This takes precedence over MFA setup if the admin just reset the account.
  if (isPasswordResetRequired) {
    if (location.pathname !== "/dashboard/account") {
      return <Navigate to="/dashboard/account" replace />
    }
  }

  // MFA Flow Enforcement: If session is partial, only allow /mfa-verify or /dashboard/mfa-setup
  if (isMfaPending) {
    const allowedFlows = ["/mfa-verify", "/dashboard/mfa-setup"]
    if (!allowedFlows.includes(location.pathname)) {
      const targetFlow = user?.mfaEnabled ? "/mfa-verify" : "/dashboard/mfa-setup"
      return <Navigate to={targetFlow} replace />
    }
  }

  if (!isAuthenticated && !sessionExpiredReason) {
    return <Navigate to="/signin" replace />
  }

  return <Outlet />
}
