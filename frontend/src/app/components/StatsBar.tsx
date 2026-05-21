import { useState, useEffect } from "react";
import { ArrowUp, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { apiGetAccount } from "../api/auth";

export function StatsBar() {
  const [statsData, setStatsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      const res = await apiGetAccount();
      if (res.ok) {
        setStatsData(res);
      }
      setIsLoading(false);
    };
    fetchStats();
  }, []);

  const stats = [
    {
      label: "Storage Used",
      value: statsData?.storageUsedBytes ? formatBytes(statsData.storageUsedBytes) : "0 B",
      sub: "Cloud total storage",
      icon: ArrowUp,
      color: "#00d2ff",
      bg: "rgba(0,210,255,0.1)",
      positive: true,
    },
    {
      label: "Total Transfers",
      value: statsData?.transfersCount?.toString() || "0",
      sub: "Completed operations",
      icon: CheckCircle2,
      color: "#00E5A0",
      bg: "rgba(0,229,160,0.1)",
      positive: true,
    },
    {
      label: "Active Encryption",
      value: "AES-256",
      sub: "Military-grade active",
      icon: Clock,
      color: "#FBBF24",
      bg: "rgba(251,191,36,0.1)",
      positive: null,
    },
    {
      label: "Authorized Users",
      value: statsData?.totalUsers != null ? statsData.totalUsers.toString() : "—",
      sub: "Verified platform users",
      icon: CheckCircle2,
      color: "#0B7FFF",
      bg: "rgba(11,127,255,0.1)",
      positive: true,
    },
  ];

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {isLoading ? (
        Array(4).fill(0).map((_, i) => (
          <div key={i} className="rounded-xl px-5 py-6 flex items-center justify-center bg-white/5 border border-white/10 animate-pulse">
            <Loader2 className="animate-spin" style={{ color: "var(--muted-foreground)" }} size={24} />
          </div>
        ))
      ) : (
        stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: stat.bg }}
              >
                <Icon size={18} style={{ color: stat.color }} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p style={{ fontSize: "18px", color: "var(--foreground)", fontWeight: 700, lineHeight: 1.2 }} className="sm:text-xl">
                  {stat.value}
                </p>
                <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }} className="sm:text-xs truncate">
                  {stat.label}
                </p>
                <p
                  style={{
                    fontSize: "10px",
                    color:
                      stat.positive === true
                        ? "#00E5A0"
                        : stat.positive === false
                        ? "#F87171"
                        : "#64748b",
                    marginTop: "1px",
                    fontWeight: 500,
                  }}
                  className="sm:text-[10.5px]"
                >
                  {stat.sub}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}