import { useState } from "react";
import { Download, FileCheck, Eye, Search, Filter, ChevronDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { useReceivedTransfers } from "../hooks/useReceivedTransfers";
// import { useAuth } from "../hooks/useAuth"; // unused

interface ReceivedFile {
  id: string;
  fileName: string;
  sender: string;
  size: string;
  receivedAt: Date;
  expiresAt: Date;
  status: "available" | "downloaded" | "expired" | "Pending" | "Delivered";
  encryption: string;
  message?: string;
}

export function ReceivedFiles() {
  const { transfers, loading } = useReceivedTransfers();
  // const { user } = useAuth(); // unused
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "downloaded" | "expired">("all");
  const [selectedFile, setSelectedFile] = useState<ReceivedFile | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // /transfers/received already scopes to current user — no client-side filter needed
  const receivedFiles: ReceivedFile[] = transfers
    .map(t => ({
      id: t.id,
      fileName: t.fileName,
      sender: t.uploadedBy, // Use the uploader email
      size: t.size,
      receivedAt: new Date(t.dateTimestamp),
      expiresAt: t.expiryDate ? new Date(t.expiryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: (
        t.status === "Delivered" ? "available" :
        t.status === "Expired"   ? "expired" :
        "available"  // Pending / Sending... files addressed to this user are treated as available
      ) as ReceivedFile["status"],
      encryption: t.encryptionType
    }));

  const filteredFiles = receivedFiles.filter((file) => {
    const matchesSearch = file.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.sender.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || file.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "#00E5A0";
      case "downloaded":
        return "#0B7FFF";
      case "expired":
        return "#94a3b8";
      default:
        return "#6b7fa8";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "available":
        return "Available";
      case "downloaded":
        return "Downloaded";
      case "expired":
        return "Expired";
      default:
        return status;
    }
  };

  const handleDownload = async (file: ReceivedFile) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
    if (!API_BASE_URL) return
    try {
      const res = await fetch(`${API_BASE_URL}/transfers/${file.id}/download?context=received`, {
        method: "GET",
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const errCode = data.error ?? ""
        toast.error(
          errCode === "EXPIRED"        ? "This file has expired and can no longer be downloaded."
          : errCode === "FORBIDDEN"    ? "You do not have permission to download this file."
          : errCode === "DECRYPT_ERROR" ? "File decryption failed. Please contact your administrator."
          : "Download failed. Please try again."
        )
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`${file.fileName} downloaded successfully.`)
    } catch (err) {
      console.error("[TFS] Download fetch error:", err)
      toast.error("Network error. Please check that the server is running and try again.")
    }
  };


  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Received Files</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
            Files shared with you by other team members
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-lg"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#00E5A0",
              background: "rgba(0,229,160,0.12)",
              border: "1px solid rgba(0,229,160,0.2)",
            }}
          >
            {filteredFiles.filter(f => f.status === "available").length} Available
          </span>
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
            placeholder="Search files or senders..."
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
              {["all", "available", "downloaded", "expired"].map((status) => (
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

      {/* Files List */}
      <div className="grid gap-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 rounded-xl text-white/40"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Loader2 size={48} className="animate-spin text-[#00E5A0] mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Scanning Secure Channels...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Download size={48} style={{ color: "#3d4f6e", marginBottom: "16px" }} />
            <p style={{ color: "#6b7fa8", fontSize: "15px" }}>No files found</p>
          </div>
        ) : (
          filteredFiles.map((file) => (
            <div
              key={file.id}
              className="p-4 rounded-xl transition-all hover:bg-white/5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex flex-col gap-4">
                {/* File Icon & Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: "rgba(11,127,255,0.12)",
                      border: "1px solid rgba(11,127,255,0.2)",
                    }}
                  >
                    <FileCheck size={20} style={{ color: "#0B7FFF" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{file.fileName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span style={{ color: "#6b7fa8", fontSize: "13px" }}>
                        From {file.sender}
                      </span>
                      <span style={{ color: "#3d4f6e", fontSize: "13px" }}>•</span>
                      <span style={{ color: "#6b7fa8", fontSize: "13px" }}>{file.size}</span>
                    </div>
                  </div>
                </div>

                {/* Date & Status Row - Mobile Optimized */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[150px] grid grid-cols-2 gap-3">
                    <div className="flex flex-col">
                      <span style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                        RECEIVED
                      </span>
                      <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
                        {format(file.receivedAt, "MMM d, h:mm a")}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                        EXPIRES
                      </span>
                      <span style={{ color: file.status === "expired" ? "#94a3b8" : "#e2e8f0", fontSize: "13px" }}>
                        {format(file.expiresAt, "MMM d, h:mm a")}
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-lg"
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: getStatusColor(file.status),
                      background: `${getStatusColor(file.status)}15`,
                      border: `1px solid ${getStatusColor(file.status)}30`,
                    }}
                  >
                    {getStatusLabel(file.status).toUpperCase()}
                  </span>
                </div>

                {/* Actions - Full Width on Mobile */}
                <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <button
                    onClick={() => setSelectedFile(file)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors"
                    style={{ 
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#e2e8f0",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    <Eye size={16} />
                    <span className="hidden sm:inline">View</span>
                  </button>
                  {file.status === "available" && (
                    <button
                      onClick={() => handleDownload(file)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:opacity-80"
                      style={{
                        background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                        color: "white",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      <Download size={16} />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )))}
      </div>

      {/* File Details Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent
          className="sm:max-w-2xl"
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {selectedFile && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-xl">File Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      FILE NAME
                    </label>
                    <p className="text-white mt-1">{selectedFile.fileName}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      SENDER
                    </label>
                    <p className="text-white mt-1">{selectedFile.sender}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      SIZE
                    </label>
                    <p className="text-white mt-1">{selectedFile.size}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      ENCRYPTION
                    </label>
                    <p className="text-white mt-1">{selectedFile.encryption}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      RECEIVED
                    </label>
                    <p className="text-white mt-1">{format(selectedFile.receivedAt, "MMMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      EXPIRES
                    </label>
                    <p className="text-white mt-1">{format(selectedFile.expiresAt, "MMMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                </div>
                {selectedFile.message && (
                  <div>
                    <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      MESSAGE
                    </label>
                    <p className="text-white mt-1">{selectedFile.message}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}