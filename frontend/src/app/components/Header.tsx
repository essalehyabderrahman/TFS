import { useMemo, useRef, useState } from "react";
import { Search, Bell, ShieldCheck, Menu, ArrowRight, Zap, ZapOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { isBackendReachable } = useAuth();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/app" || path === "/app/active") return "Welcome back, Admin.";
    if (path === "/app/received") return "Received Files";
    if (path === "/app/audit") return "Audit & Compliance";
    if (path === "/app/team") return "Team Management";
    if (path === "/app/security") return "Security Settings";
    if (path === "/app/account") return "Account Management";
    return "TFS Dashboard";
  };

  const searchItems = useMemo(
    () => [
      {
        type: "section",
        label: "Active Transfers",
        description: "View and manage ongoing secure transfers",
        path: "/app/active",
      },
      {
        type: "section",
        label: "Received Files",
        description: "Files that have been shared with you",
        path: "/app/received",
      },
      {
        type: "section",
        label: "Audit & Compliance Logs",
        description: "Security and compliance activity history",
        path: "/app/audit",
      },
      {
        type: "section",
        label: "Team Management",
        description: "Manage team members and roles",
        path: "/app/team",
      },
      {
        type: "section",
        label: "Security Settings",
        description: "Authentication and file security controls",
        path: "/app/security",
      },
      {
        type: "section",
        label: "Account Management",
        description: "Profile, subscription, and organization settings",
        path: "/app/account",
      },
      {
        type: "file",
        label: "Q4_Financial_Report_2025.pdf",
        description: "Recent transfer in Active Transfers",
        path: "/app/active",
      },
      {
        type: "file",
        label: "Q1_Financial_Report.pdf",
        description: "Received financial report",
        path: "/app/received",
      },
      {
        type: "option",
        label: "New Secure Transfer",
        description: "Open Active Transfers to start a new upload",
        path: "/app/active",
      },
      {
        type: "option",
        label: "Edit Organization Details",
        description: "Organization settings in Account Management",
        path: "/app/account",
      },
    ],
    [],
  );

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchItems.filter((item) => {
      const label = item.label.toLowerCase();
      const desc = item.description.toLowerCase();
      return q.split(/\s+/).every((word) => label.includes(word) || desc.includes(word));
    });
  }, [query, searchItems]);

  const showSearchResults = searchFocused && filteredResults.length > 0;

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4 shrink-0 relative"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Background with blur separated to prevent containing block trap for fixed elements */}
      <div 
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          background: "rgba(8, 12, 26, 0.95)",
          backdropFilter: "blur(12px)",
        }}
      />
      {/* Left: Menu + Greeting */}
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl transition-colors duration-200 hover:bg-white/5"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Menu size={18} style={{ color: "#6b7fa8" }} />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h1
              className="hidden sm:block"
              style={{ fontSize: "17px", color: "#f1f5f9", fontWeight: 600, lineHeight: 1.3 }}
            >
              {getPageTitle()}
            </h1>
            {isBackendReachable ? (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <Zap size={10} className="text-emerald-500 fill-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Live</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                <ZapOff size={10} className="text-amber-500" />
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-tight">Mock Mode</span>
              </div>
            )}
          </div>
          <h1
            className="sm:hidden"
            style={{ fontSize: "15px", color: "#f1f5f9", fontWeight: 600, lineHeight: 1.3 }}
          >
            TFS Dashboard
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ShieldCheck size={12} style={{ color: "#00E5A0" }} />
            <p className="hidden sm:block" style={{ fontSize: "12px", color: "#64748b", fontWeight: 400 }}>
              Your transfers are{" "}
              <span style={{ color: "#00E5A0", fontWeight: 600 }}>E2E Encrypted</span>
            </p>
            <p className="sm:hidden" style={{ fontSize: "11px", color: "#00E5A0", fontWeight: 600 }}>
              Encrypted
            </p>
          </div>
        </div>
      </div>

      {/* Right: Search + Bell */}
      <div className="flex items-center gap-2 sm:gap-3 relative">
        {/* Search */}
        <div className="relative max-w-[180px] sm:max-w-xs flex-1">
          <div
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Search size={14} style={{ color: "#4a5578" }} />
            <input
              type="text"
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                // allow click on results via timeout
                setTimeout(() => setSearchFocused(false), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = filteredResults[0];
                  if (first) {
                    navigate(first.path);
                    setQuery("");
                    setSearchFocused(false);
                  }
                }
              }}
              placeholder={window.innerWidth < 640 ? "Search" : "Search"}
              className="bg-transparent outline-none w-full"
              style={{ fontSize: "12px", color: "#94a3b8" }}
            />
          </div>

          {showSearchResults && (
            <div
              className="absolute mt-2 w-full rounded-xl overflow-hidden z-40"
              style={{
                background: "#0b0f20",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              {filteredResults.slice(0, 6).map((item) => (
                <button
                  key={`${item.type}-${item.label}`}
                  onClick={() => {
                    navigate(item.path);
                    setQuery("");
                    setSearchFocused(false);
                  }}
                  className="w-full flex items-start gap-2 px-3.5 py-2.5 hover:bg-white/5 text-left transition-colors"
                >
                  <div
                    className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background:
                        item.type === "section"
                          ? "#00d2ff"
                          : item.type === "file"
                          ? "#22c55e"
                          : "#eab308",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate"
                        style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 500 }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "#64748b",
                        }}
                      >
                        {item.type}
                      </span>
                    </div>
                    <p
                      className="truncate"
                      style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}
                    >
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight size={14} style={{ color: "#475569" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search icon – focuses the search input */}
        <button
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors duration-200 hover:bg-white/5"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          onClick={() => {
            searchInputRef.current?.focus();
            setSearchFocused(true);
          }}
        >
          <Search size={16} style={{ color: "#6b7fa8" }} />
        </button>

        {/* Bell */}
        <button
          className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors duration-200 hover:bg-white/5"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          onClick={() => setNotificationsOpen((open) => !open)}
        >
          <Bell size={16} style={{ color: "#6b7fa8" }} />
          {/* Badge */}
          <span
            className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
            style={{ background: "#00d2ff" }}
          />
        </button>

        {/* Notifications dropdown */}
        {notificationsOpen && (
          <>
            <div
              className="fixed inset-0"
              style={{
                background: "rgba(8,12,26,0.3)",
                backdropFilter: "blur(4px)",
                zIndex: 30,
              }}
              onClick={() => setNotificationsOpen(false)}
              aria-hidden
            />
            <div
              className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-80 max-w-sm rounded-xl overflow-hidden"
              style={{
                zIndex: 100,
                background: "#0b0f20",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 18px 45px rgba(0,0,0,0.75)",
              }}
            >
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <p
                  style={{
                    fontSize: "13px",
                    color: "#e2e8f0",
                    fontWeight: 600,
                  }}
                >
                  Notifications
                </p>
                <p style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
                  Latest activity across your workspace
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {[
                  {
                    title: "New secure transfer completed",
                    body: "Q4_Financial_Report_2025.pdf was delivered successfully.",
                    time: "2 min ago",
                    accent: "#00E5A0",
                  },
                  {
                    title: "New file received",
                    body: "Q1_Financial_Report.pdf from Sarah Chen.",
                    time: "15 min ago",
                    accent: "#00d2ff",
                  },
                  {
                    title: "Login from new device",
                    body: "A new sign‑in was detected from Chrome on Windows.",
                    time: "1 hr ago",
                    accent: "#eab308",
                  },
                ].map((n) => (
                  <div
                    key={n.title + n.time}
                    className="px-4 py-3 flex gap-3 hover:bg-white/5 transition-colors"
                  >
                    <div
                      className="mt-1 w-1 h-8 rounded-full flex-shrink-0"
                      style={{ background: n.accent }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="truncate"
                        style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 500 }}
                      >
                        {n.title}
                      </p>
                      <p
                        className="truncate"
                        style={{ fontSize: "11px", color: "#94a3b8", marginTop: 2 }}
                      >
                        {n.body}
                      </p>
                      <p style={{ fontSize: "10px", color: "#64748b", marginTop: 2 }}>
                        {n.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}