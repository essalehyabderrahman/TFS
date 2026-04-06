import { createBrowserRouter } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ActiveTransfers } from "./pages/ActiveTransfers";
import { ReceivedFiles } from "./pages/ReceivedFiles";
import { AuditLogs } from "./pages/AuditLogs";
import { TeamManagement } from "./pages/TeamManagement";
import { SecuritySettings } from "./pages/SecuritySettings";
import { AccountManagement } from "./pages/AccountManagement";
import { Welcome } from "./pages/Welcome";
import { SignIn } from "./pages/SignIn";
import { SignUp } from "./pages/SignUp";

export const router = createBrowserRouter([
  // Public landing page at the root
  {
    path: "/",
    Component: Welcome,
  },
  // Authentication pages
  {
    path: "/signin",
    Component: SignIn,
  },
  {
    path: "/signup",
    Component: SignUp,
  },
  // Authenticated dashboard under /app
  {
    path: "/app",
    Component: ProtectedRoute,
    children: [
      {
        path: "",
        Component: MainLayout,
        children: [
          { index: true, Component: ActiveTransfers },
          { path: "active", Component: ActiveTransfers },
          { path: "received", Component: ReceivedFiles },
          { path: "audit", Component: AuditLogs },
          { path: "team", Component: TeamManagement },
          { path: "security", Component: SecuritySettings },
          { path: "account", Component: AccountManagement },
        ],
      },
    ],
  },
]);
