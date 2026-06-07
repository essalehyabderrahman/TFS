import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { UploadZone } from "./UploadZone";
import { X, Lock } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newTransferOpen, setNewTransferOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const { isPasswordResetRequired } = useAuth();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-background"
    >
      {/* Sidebar */}
      {!isPasswordResetRequired && (
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewTransfer={() => setNewTransferOpen(true)}
        />
      )}

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        {!isPasswordResetRequired && <Header onMenuClick={() => setSidebarOpen(true)} />}

        {isPasswordResetRequired && (
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-black/20">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lock size={16} className="text-amber-500" />
            </div>
            <div>
              <h1 className="text-white text-sm font-bold">Security Action Required</h1>
              <p className="text-[#6b7fa8] text-[11px] font-medium uppercase tracking-widest">Mandatory Password Update</p>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,210,255,0.2) transparent" }}
        >
          <Outlet />
        </main>
      </div>

      {/* New Secure Transfer overlay */}
      {newTransferOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50"
            onClick={() => setNewTransferOpen(false)}
            aria-hidden
          />
          <div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 w-[80vw] max-w-5xl z-50 max-h-[85vh] overflow-y-auto rounded-2xl p-5"
            style={{
              background: "linear-gradient(180deg, #0d1321 0%, #0b0f20 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(11,127,255,0.2) transparent",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: "16px", color: "var(--foreground)", fontWeight: 600 }}>
                New Secure Transfer
              </h2>
              <button
                onClick={() => setNewTransferOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X size={18} style={{ color: "#6b7fa8" }} />
              </button>
            </div>
            <UploadZone />
          </div>
        </>
      )}

      {/* Global ambient glow effects */}
      <div
        className="fixed pointer-events-none hidden lg:block"
        style={{
          top: "-200px",
          left: "-100px",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,210,255,0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="fixed pointer-events-none hidden lg:block"
        style={{
          bottom: "-200px",
          right: "-100px",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,210,255,0.05) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
