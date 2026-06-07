import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeProvider";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </AuthProvider>
    </ThemeProvider>
  );
}