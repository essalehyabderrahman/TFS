import { useState, useEffect } from "react";
import { Shield, Download, Search, Filter, ChevronDown, Eye, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { fetchAuditLogs } from "../api/audit";
import { toast } from "sonner";

interface AuditLog {
  id: string;
  timestamp: Date;
  user: string;
  action: string;
  resource: string;
  ipAddress: string;
  location: string;
  status: "success" | "failed" | "warning";
  details: string;
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "warning">("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    const loadLogs = async () => {
      setIsLoading(true);
      const res = await fetchAuditLogs();
      if (res.error) {
        toast.error("Cloud Node failure: Unable to retrieve audit trail.");
      } else {
        // Map backend schema to frontend interface
        const mapped: AuditLog[] = res.logs.map(log => ({
          id: log.id,
          timestamp: parseISO(log.timestamp),
          user: log.user,
          action: log.action,
          resource: log.resource,
          ipAddress: log.ipAddress,
          location: log.location,
          status: log.status,
          details: log.details
        }));
        setLogs(mapped);
      }
      setIsLoading(false);
    };
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "#00E5A0";
      case "failed":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      default:
        return "#6b7fa8";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "success":
        return "Success";
      case "failed":
        return "Failed";
      case "warning":
        return "Warning";
      default:
        return status;
    }
  };

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.error("Export denied: No log entries detected in current view.");
      return;
    }

    const headers = ["Timestamp", "User", "Action", "Resource", "Status", "IP Address", "Location", "Details"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => [
        `"${format(log.timestamp, 'yyyy-MM-dd HH:mm:ss')}"`,
        `"${log.user}"`,
        `"${log.action}"`,
        `"${log.resource}"`,
        `"${log.status.toUpperCase()}"`,
        `"${log.ipAddress}"`,
        `"${log.location}"`,
        `"${log.details.replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `TFS_Audit_Trail_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Audit trail report generated and transmitted.");
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Audit & Compliance Logs</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
            Monitor all system activities and security events
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
            color: "white",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          <Download size={16} />
          Export Logs
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(0,229,160,0.08)",
            border: "1px solid rgba(0,229,160,0.2)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                SUCCESSFUL
              </p>
              <p className="text-3xl font-bold mt-1" style={{ color: "#00E5A0" }}>
                {logs.filter(l => l.status === "success").length}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(0,229,160,0.15)" }}
            >
              <Shield size={24} style={{ color: "#00E5A0" }} />
            </div>
          </div>
        </div>

        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                FAILED
              </p>
              <p className="text-3xl font-bold mt-1" style={{ color: "#ef4444" }}>
                {logs.filter(l => l.status === "failed").length}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.15)" }}
            >
              <Shield size={24} style={{ color: "#ef4444" }} />
            </div>
          </div>
        </div>

        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                WARNINGS
              </p>
              <p className="text-3xl font-bold mt-1" style={{ color: "#f59e0b" }}>
                {logs.filter(l => l.status === "warning").length}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)" }}
            >
              <Shield size={24} style={{ color: "#f59e0b" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div
        className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b7fa8" }} />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: "14px",
            }}
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
              fontSize: "14px",
            }}
          >
            <Filter size={16} />
            <span>{statusFilter === "all" ? "All Status" : getStatusLabel(statusFilter)}</span>
            <ChevronDown size={14} />
          </button>
          {showFilterDropdown && (
            <div
              className="absolute right-0 mt-2 w-48 rounded-lg overflow-hidden z-10"
              style={{
                background: "#0d1228",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              }}
            >
              {["all", "success", "failed", "warning"].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status as any);
                    setShowFilterDropdown(false);
                  }}
                  className="w-full px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                  style={{
                    color: statusFilter === status ? "#0B7FFF" : "#e2e8f0",
                    fontSize: "14px",
                  }}
                >
                  {status === "all" ? "All Status" : getStatusLabel(status)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th className="px-4 py-3 text-left" style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  TIMESTAMP
                </th>
                <th className="px-4 py-3 text-left" style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  USER
                </th>
                <th className="px-4 py-3 text-left" style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  ACTION
                </th>
                <th className="px-4 py-3 text-left" style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  RESOURCE
                </th>
                <th className="px-4 py-3 text-left" style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  STATUS
                </th>
                <th className="px-4 py-3 text-center" style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center text-white/40">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 size={32} className="animate-spin text-[#0B7FFF]" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em]">Synchronizing Audit Trail...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center text-slate-500 italic text-sm">
                    No activity logs detected in the selected timeframe.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr
                    key={log.id}
                    className="hover:bg-white/5 transition-colors"
                    style={{
                      borderBottom: index < filteredLogs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    }}
                  >
                  <td className="px-4 py-3" style={{ color: "#e2e8f0", fontSize: "13px" }}>
                    {format(log.timestamp, "MMM d, h:mm a")}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#e2e8f0", fontSize: "13px" }}>
                    {log.user}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#e2e8f0", fontSize: "13px" }}>
                    {log.action}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#6b7fa8", fontSize: "13px" }}>
                    <span className="truncate block max-w-xs">{log.resource}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-lg"
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: getStatusColor(log.status),
                        background: `${getStatusColor(log.status)}15`,
                        border: `1px solid ${getStatusColor(log.status)}30`,
                      }}
                    >
                      {getStatusLabel(log.status).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-2 rounded-lg transition-colors hover:bg-white/10 inline-flex"
                      style={{ color: "#6b7fa8" }}
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent
          className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl"
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {selectedLog && (
            <>
              <DialogHeader className="flex flex-row items-center justify-between pr-0">
                <DialogTitle className="text-white text-lg sm:text-xl">Audit Log Details</DialogTitle>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <span style={{ color: "#6b7fa8", fontSize: "20px", lineHeight: 1 }}>✕</span>
                </button>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      TIMESTAMP
                    </label>
                    <p className="text-white mt-1 text-sm">{format(selectedLog.timestamp, "MMMM d, yyyy 'at' h:mm:ss a")}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      USER
                    </label>
                    <p className="text-white mt-1 text-sm">{selectedLog.user}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      ACTION
                    </label>
                    <p className="text-white mt-1 text-sm">{selectedLog.action}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      STATUS
                    </label>
                    <p className="mt-1">
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-lg"
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          color: getStatusColor(selectedLog.status),
                          background: `${getStatusColor(selectedLog.status)}15`,
                          border: `1px solid ${getStatusColor(selectedLog.status)}30`,
                        }}
                      >
                        {getStatusLabel(selectedLog.status).toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      IP ADDRESS
                    </label>
                    <p className="text-white mt-1 text-sm">{selectedLog.ipAddress}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      LOCATION
                    </label>
                    <p className="text-white mt-1 text-sm">{selectedLog.location}</p>
                  </div>
                </div>
                <div>
                  <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                    RESOURCE
                  </label>
                  <p className="text-white mt-1 text-sm">{selectedLog.resource}</p>
                </div>
                <div>
                  <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                    DETAILS
                  </label>
                  <p className="text-white mt-1 text-sm">{selectedLog.details}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
