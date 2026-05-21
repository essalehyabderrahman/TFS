import React from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { SessionExpiredModal } from "./components/SessionExpiredModal";
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
import { Contacts } from "./pages/Contacts";
import { GroupWorkspace } from "./pages/GroupWorkspace";
import { Welcome } from "./pages/Welcome";
import { SignIn } from "./pages/SignIn";
import { SignUp } from "./pages/SignUp";
import { Mfa } from "./pages/Mfa";
import { MfaSetup } from "./pages/MfaSetup";
import { ForgotPassword } from "./pages/ForgotPassword";
import { FileExplorer } from "./pages/FileExplorer";
import { RecoveryManagement } from "./pages/RecoveryManagement";
import { QuotaRequests } from "./pages/QuotaRequests";


function RootLayout() {
  const { sessionExpiredReason, dismissExpiredSession } = useAuth()
  return (
    <>
      <Outlet />
      {sessionExpiredReason && (
        <SessionExpiredModal reason={sessionExpiredReason} onClose={dismissExpiredSession} />
      )}
    </>
  )
}

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

function AdminOrGroupAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAppAdmin, isGroupAdmin, isInitializing } = useAuth()
  if (isInitializing) return null
  if (!isAppAdmin && !isGroupAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isMfaPending, isInitializing, user } = useAuth();
  if (isInitializing) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  // MFA onboarding in progress — block access to all public pages so the
  // user cannot escape the setup flow by navigating to /signin or /
  if (isMfaPending) {
    const target = user?.mfaEnabled ? "/mfa-verify" : "/dashboard/mfa-setup"
    return <Navigate to={target} replace />
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      // Public landing page
      { index: true, Component: Welcome },
      // Authentication pages
      {
        path: "signin",
        element: <PublicOnlyRoute><SignIn /></PublicOnlyRoute>,
      },
      {
        path: "signup",
        element: <PublicOnlyRoute><SignUp /></PublicOnlyRoute>,
      },
      {
        path: "forgot-password",
        element: <PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>,
      },
      {
        path: "mfa-verify",
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
              {
                path: "audit",
                element: (
                  <AdminOrGroupAdminRoute>
                    <AuditLogs />
                  </AdminOrGroupAdminRoute>
                ),
              },
              { path: "users", Component: UserManagement },
              { path: "team", Component: TeamManagement },
              { path: "groups", Component: GroupWorkspace },
              { path: "security", Component: SecuritySettings },
              { path: "account", Component: AccountManagement },
              { path: "contacts", Component: Contacts },
              { path: "explorer", Component: FileExplorer },
              { path: "recovery-management", Component: RecoveryManagement },
              {
                path: "quota-requests",
                element: (
                  <AdminOrGroupAdminRoute>
                    <QuotaRequests />
                  </AdminOrGroupAdminRoute>
                ),
              },
            ],
          },
        ],
      },
      // Catch-all
      { path: "*", element: <SmartRedirect /> },
    ],
  },
]);

