import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowUpDown,
  Download,
  ClipboardList,
  Users,
  UserCog,
  ShieldCheck,
  Plus,
  ChevronRight,
  X,
} from "lucide-react";

const allNavItems = [
  { icon: ArrowUpDown,   label: "Active Transfers",        id: "active",    path: "/dashboard/active",    adminOnly: false, hideForAdmin: false },
  { icon: Download,      label: "Received Files",          id: "received",  path: "/dashboard/received",  adminOnly: false, hideForAdmin: true  },
  { icon: ClipboardList, label: "Audit & Compliance Logs", id: "audit",     path: "/dashboard/audit",     adminOnly: false, hideForAdmin: false },
  { icon: UserCog,       label: "User Management",         id: "users",     path: "/dashboard/users",     adminOnly: true,  hideForAdmin: false },
  { icon: Users,         label: "Team Management",         id: "team",      path: "/dashboard/team",      adminOnly: true,  hideForAdmin: false },
  { icon: ShieldCheck,   label: "Security Settings",       id: "security",  path: "/dashboard/security",  adminOnly: false, hideForAdmin: false },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewTransfer?: () => void;
}

export function Sidebar({ isOpen, onClose, onNewTransfer }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAppAdmin } = useAuth();

  const navItems = allNavItems.filter(item =>
    (!item.adminOnly || isAppAdmin) && (!item.hideForAdmin || !isAppAdmin)
  );

  
  // Determine active state from current location
  const getActiveFromPath = (path: string) => {
    if (path === "/dashboard" || path === "/dashboard/active") return "active";
    if (path.startsWith("/dashboard/")) {
      return path.replace("/dashboard/", "");
    }
    return "";
  };
  
  const [active, setActive] = useState(getActiveFromPath(location.pathname));

  useEffect(() => {
    setActive(getActiveFromPath(location.pathname));
  }, [location.pathname]);

  const handleNavigation = (id: string, path: string) => {
    setActive(id);
    navigate(path);
    onClose();
  };

  return (
    <>
      <aside
        className={`flex flex-col h-full w-64 shrink-0 fixed lg:relative z-40 transition-transform duration-300 lg:translate-x-0 overflow-y-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "linear-gradient(180deg, #0b0f20 0%, #0d1228 100%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(11,127,255,0.2) transparent",
        }}
      >
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="absolute top-6 right-4 lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={18} style={{ color: "#6b7fa8" }} />
        </button>

        {/* Logo */}
        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-lg"
              style={{
                background: "#00d2ff",
                color: "#000",
                boxShadow: "0 0 20px rgba(0,210,255,0.3)",
              }}
            >
              T
            </div>
            <div className="flex flex-col">
              <span
                className="text-white tracking-widest"
                style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "0.15em" }}
              >
                TFS
              </span>
              <span style={{ fontSize: "9px", color: "#6b7fa8", letterSpacing: "0.12em", fontWeight: 500 }}>
                SECURE TRANSFER
              </span>
            </div>
          </div>
        </div>

        {/* New Transfer Button */}
        <div className="px-4 pb-5">
          <button
            onClick={() => onNewTransfer?.()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-black font-black uppercase tracking-widest transition-all duration-200 hover:opacity-90 active:scale-95"
            style={{
              background: "#00D2FF",
              boxShadow: "0 4px 20px rgba(0,210,255,0.25)",
              fontSize: "12px",
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            New Secure Transfer
          </button>
        </div>

        {/* Divider */}
        <div className="mx-4 mb-4" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />

        {/* Nav Label */}
        <div className="px-5 mb-2">
          <span style={{ fontSize: "10px", color: "#4a5578", fontWeight: 700, letterSpacing: "0.12em" }}>
            NAVIGATION
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3">
          {navItems.map(({ icon: Icon, label, id, path }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => handleNavigation(id, path)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-all duration-200 group"
                style={{
                  background: isActive
                    ? "rgba(0,210,255,0.08)"
                    : "transparent",
                  borderLeft: isActive ? "2px solid #00d2ff" : "2px solid transparent",
                }}
              >
                <Icon
                  size={16}
                  style={{ color: isActive ? "#00d2ff" : "#4a5578" }}
                  className="transition-colors duration-200 group-hover:text-slate-300 shrink-0"
                />
                <span
                  style={{
                    fontSize: "13.5px",
                    color: isActive ? "#e2e8f0" : "#6b7fa8",
                    fontWeight: isActive ? 600 : 400,
                  }}
                  className="transition-colors duration-200 group-hover:text-slate-300 flex-1"
                >
                  {label}
                </span>
                {isActive && (
                  <ChevronRight size={13} style={{ color: "#00d2ff" }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Divider */}
        <div className="mx-4 mt-2 mb-4" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />

        {/* User Profile */}
        <div
          className="mx-3 mb-5 p-3 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          onClick={() => handleNavigation("account", "/dashboard/account")}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
              fontSize: "13px",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {user?.avatar || "TFS"}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 600 }} className="truncate">
              {user?.name || "Loading..."}
            </p>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded mt-0.5 uppercase"
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#00d2ff",
                background: "rgba(0,210,255,0.1)",
              }}
            >
              {user?.plan ? `${user.plan} PLAN` : "FREE PLAN"}
            </span>
          </div>

        </div>
      </aside>
    </>
  );
}