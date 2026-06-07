import { useMemo, useRef, useState, useEffect } from "react";
import { Search, Bell, ShieldCheck, Menu, ArrowRight, Zap, ZapOff, Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { useTransfers } from "../hooks/useTransfers";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, DashboardNotification } from "../api/notifications";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ThemeToggle } from "./ThemeToggle";
interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { isBackendReachable } = useAuth();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadNotifications = async () => {
    setLoadingNotifs(true);
    const res = await fetchNotifications({ limit: 10 });
    setNotifications(res.notifications || []);
    setUnreadCount(res.unreadCount || 0);
    setLoadingNotifs(false);
  };

  useEffect(() => {
    if (isBackendReachable) {
      loadNotifications();
    }
  }, [isBackendReachable]);

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    loadNotifications();
  };

  const handleNotificationClick = async (notif: DashboardNotification) => {
    if (!notif.isRead) {
      await markNotificationRead(notif.id);
      loadNotifications();
    }
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/dashboard" || path === "/dashboard/active") return "Welcome back.";
    if (path === "/dashboard/received") return "Received Files";
    if (path === "/dashboard/audit") return "Audit & Compliance";
    if (path === "/dashboard/team") return "Team Management";
    if (path === "/dashboard/security") return "Security Settings";
    if (path === "/dashboard/account") return "Account Management";
    if (path === "/dashboard/users") return "User Directory";
    if (path === "/dashboard/groups") return "Team Workspace";
    if (path === "/dashboard/contacts") return "Contacts";
    return "TFS Dashboard";
  };

  const { transfers } = useTransfers();

  const searchItems = useMemo(() => {
    return transfers.map((t) => ({
      type: "file",
      label: t.fileName,
      description: `Recipient: ${t.recipient} • Size: ${t.size}`,
      path: `/dashboard/active#transfer-${t.id}`,
    }));
  }, [transfers]);

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
              style={{ fontSize: "17px", color: "var(--foreground)", fontWeight: 600, lineHeight: 1.3 }}
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
            style={{ fontSize: "15px", color: "var(--foreground)", fontWeight: 600, lineHeight: 1.3 }}
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
              background: "var(--background)",
              border: "1px solid var(--border)",
            }}
          >
            <Search size={14} style={{ color: "var(--foreground)" }} />
            <input
              type="text"
              ref={searchInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!searchFocused) setSearchFocused(true);
              }}
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
                    searchInputRef.current?.blur();
                  }
                }
              }}
              placeholder={window.innerWidth < 640 ? "Search" : "Search"}
              className="bg-transparent outline-none w-full"
              style={{ fontSize: "12px", color: "var(--muted-foreground)" }}
            />
          </div>

          {showSearchResults && (
            <div
              className="absolute mt-2 w-full rounded-xl overflow-hidden z-40"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              {filteredResults.slice(0, 6).map((item) => (
                <button
                  key={item.path}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input from losing focus immediately
                    navigate(item.path);
                    setQuery("");
                    setSearchFocused(false);
                    searchInputRef.current?.blur();
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
                        style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: 500 }}
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

        <ThemeToggle />

        {/* Bell */}
        <button
          className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors duration-200 hover:bg-white/5"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          onClick={() => {
            if (!notificationsOpen) loadNotifications();
            setNotificationsOpen((open) => !open);
          }}
        >
          <Bell size={16} style={{ color: "#6b7fa8" }} />
          {/* Badge */}
          {unreadCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold text-[#0b0f20] px-1"
              style={{ background: "#00d2ff" }}
            >
              {unreadCount}
            </span>
          )}
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
                background: "var(--background)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 18px 45px rgba(0,0,0,0.75)",
              }}
            >
              <div
                className="px-4 py-3 border-b flex justify-between items-center"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--foreground)",
                      fontWeight: 600,
                    }}
                  >
                    Notifications
                  </p>
                  <p style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
                    Latest activity across your workspace
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button 
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-[350px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {loadingNotifs && notifications.length === 0 ? (
                  <div className="flex justify-center p-8">
                    <Loader2 size={20} className="animate-spin text-slate-500" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p style={{ fontSize: "12px", color: "#64748b" }}>You're all caught up!</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const timeAgo = formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true });
                    const accent =
                      n.type === "success"
                        ? "#00E5A0"
                        : n.type === "warning"
                        ? "#eab308"
                        : "#00d2ff"; // info
                        
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-3 flex gap-3 transition-colors ${
                          n.isRead ? "hover:bg-white/5 opacity-70" : "bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div
                          className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: n.isRead ? "transparent" : accent }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="truncate"
                            style={{ 
                              fontSize: "13px", 
                              color: n.isRead ? "var(--muted-foreground)" : "var(--foreground)", 
                              fontWeight: n.isRead ? 500 : 700 
                            }}
                          >
                            {n.title}
                          </p>
                          <p
                            style={{ 
                              fontSize: "11px", 
                              color: "var(--muted-foreground)", 
                              marginTop: 2,
                              whiteSpace: "normal" 
                            }}
                          >
                            {n.body}
                          </p>
                          <p style={{ fontSize: "10px", color: "#64748b", marginTop: 4 }}>
                            {timeAgo}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}