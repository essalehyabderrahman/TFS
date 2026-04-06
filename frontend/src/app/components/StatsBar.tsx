import { ArrowUp, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

const stats = [
  {
    label: "Total Transferred",
    value: "284.6 GB",
    sub: "+12% this month",
    icon: ArrowUp,
    color: "#00d2ff",
    bg: "rgba(0,210,255,0.1)",
    positive: true,
  },
  {
    label: "Active Transfers",
    value: "7",
    sub: "2 in progress",
    icon: Clock,
    color: "#FBBF24",
    bg: "rgba(251,191,36,0.1)",
    positive: null,
  },
  {
    label: "Delivered",
    value: "1,248",
    sub: "All time success",
    icon: CheckCircle2,
    color: "#00E5A0",
    bg: "rgba(0,229,160,0.1)",
    positive: true,
  },
  {
    label: "Expired / Failed",
    value: "3",
    sub: "Last 30 days",
    icon: AlertTriangle,
    color: "#F87171",
    bg: "rgba(248,113,113,0.1)",
    positive: false,
  },
];

export function StatsBar() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-xl px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: stat.bg }}
            >
              <Icon size={18} style={{ color: stat.color }} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: "18px", color: "#f1f5f9", fontWeight: 700, lineHeight: 1.2 }} className="sm:text-xl">
                {stat.value}
              </p>
              <p style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }} className="sm:text-xs truncate">
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
      })}
    </div>
  );
}