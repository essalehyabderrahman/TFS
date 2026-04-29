import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import { useAuth } from "./hooks/useAuth"
import { SessionExpiredModal } from "./components/SessionExpiredModal"

function SessionExpiredOverlay() {
  const { sessionExpiredReason, dismissExpiredSession } = useAuth()
  if (!sessionExpiredReason) return null
  return (
    <SessionExpiredModal
      reason={sessionExpiredReason}
      onClose={dismissExpiredSession}
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <SessionExpiredOverlay />
      <Toaster position="top-center" />
    </AuthProvider>
  );
}