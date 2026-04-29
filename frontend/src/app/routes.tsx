import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { useAuth } from "./hooks/useAuth";
import { MainLayout } from "./components/MainLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ActiveTransfers } from "./pages/ActiveTransfers";
import { ReceivedFiles } from "./pages/ReceivedFiles";
import { AuditLogs } from "./pages/AuditLogs";
import { TeamManagement } from "./pages/TeamManagement";
import { UserManagement } from "./pages/UserManagement";
import { SecuritySettings } from "./pages/SecuritySettings";
import { AccountManagement } from "./pages/AccountManagement";
import { Welcome } from "./pages/Welcome";
import { SignIn } from "./pages/SignIn";
import { SignUp } from "./pages/SignUp";
import { Mfa } from "./pages/Mfa";
import { MfaSetup } from "./pages/MfaSetup";


function SmartRedirect() {
  const { isAuthenticated, isMfaPending, isInitializing, user } = useAuth();
  if (isInitializing) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  
  if (isMfaPending && user) {
    // [Security] Resume correct MFA state
    return <Navigate to={user.mfaEnabled ? "/mfa-verify" : "/dashboard/mfa-setup"} replace />;
  }
  
  return <Navigate to="/signin" replace />;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  // Public landing page at the root
  {
    path: "/",
    Component: Welcome,
  },
  // Authentication pages
  {
    path: "/signin",
    element: <PublicOnlyRoute><SignIn /></PublicOnlyRoute>,
  },
  {
    path: "/signup",
    element: <PublicOnlyRoute><SignUp /></PublicOnlyRoute>,
  },
  {
    path: "/mfa-verify",
    Component: Mfa,
  },
  // Protected dashboard structure
  {
    path: "/dashboard",
    Component: ProtectedRoute,
    children: [
      {
        path: "mfa-setup",
        Component: MfaSetup,
      },
      {
        path: "",
        Component: MainLayout,
        children: [
          { index: true, Component: ActiveTransfers },
          { path: "active", Component: ActiveTransfers },
          { path: "received", Component: ReceivedFiles },
          { path: "audit", Component: AuditLogs },
          { path: "users", Component: UserManagement },
          { path: "team", Component: TeamManagement },
          { path: "security", Component: SecuritySettings },
          { path: "account", Component: AccountManagement },
        ],
      },
    ],
  },
  // Catch-all
  {
    path: "*",
    element: <SmartRedirect />,
  },
]);

