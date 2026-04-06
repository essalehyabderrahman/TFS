import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/app/context/AuthContext"

/**
 * Protège toutes les routes enfants sous /app/*.
 * Attend la fin de l'hydratation de session avant de décider si
 * l'utilisateur doit être redirigé vers /signin.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isInitializing } = useAuth()

  // While we're checking localStorage token → don't redirect yet
  if (isInitializing) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f20",
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

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />
  }

  return <Outlet />
}
