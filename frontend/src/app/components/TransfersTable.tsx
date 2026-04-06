import { useState, useMemo } from "react";
import {
  FileText,
  FileImage,
  FileArchive,
  FileVideo,
  File,
  ShieldCheck,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  Download,
  Send,
  Eye,
  ShieldOff,
  Trash2,
  Clock,
  User,
  HardDrive,
  Calendar,
  Lock,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { useTransfers } from "@/app/hooks/useTransfers";
import type { Transfer, TransferStatus as Status } from "@/types";

const fileIcons: Record<Transfer["fileType"], React.ElementType> = {
  pdf: FileText,
  img: FileImage,
  zip: FileArchive,
  video: FileVideo,
  doc: FileText,
  other: File,
};

const fileColors: Record<Transfer["fileType"], string> = {
  pdf: "#F87171",
  img: "#34D399",
  zip: "#FBBF24",
  video: "#A78BFA",
  doc: "#60A5FA",
  other: "#94A3B8",
};

const statusConfig: Record<Status, { bg: string; color: string; dot: string }> = {
  Delivered: {
    bg: "rgba(0,229,160,0.12)",
    color: "#00E5A0",
    dot: "#00E5A0",
  },
  "Sending...": {
    bg: "rgba(11,127,255,0.14)",
    color: "#3D9FFF",
    dot: "#0B7FFF",
  },
  Expired: {
    bg: "rgba(100,116,139,0.15)",
    color: "#94A3B8",
    dot: "#64748B",
  },
  Pending: {
    bg: "rgba(251,191,36,0.12)",
    color: "#FBBF24",
    dot: "#FBBF24",
  },
};

type SortField = "fileName" | "date" | "size" | "status";
type SortDirection = "asc" | "desc" | null;

export function TransfersTable() {
  const { transfers: fetchedTransfers } = useTransfers();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [detailsTransfer, setDetailsTransfer] = useState<Transfer | null>(null);
  const [deleteTransfer, setDeleteTransfer] = useState<Transfer | null>(null);
  const [revokeTransfer, setRevokeTransfer] = useState<Transfer | null>(null);
  const [resendTransfer, setResendTransfer] = useState<Transfer | null>(null);

  // Sync fetched transfers into local state (allows local mutations: delete/resend/revoke)
  // We use a separate useState so UI actions (delete/revoke/resend) update instantly
  useMemo(() => setTransfers(fetchedTransfers), [fetchedTransfers]);

  // Sorting state
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Filtering state
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status[]>([]);
  const [filterFileType, setFilterFileType] = useState<Transfer["fileType"][]>([]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setShowSortMenu(false);
  };

  // Apply sorting and filtering
  const filteredAndSortedTransfers = useMemo(() => {
    let result = [...transfers];

    // Apply filters
    if (filterStatus.length > 0) {
      result = result.filter((t) => filterStatus.includes(t.status));
    }
    if (filterFileType.length > 0) {
      result = result.filter((t) => filterFileType.includes(t.fileType));
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let aVal: any, bVal: any;

        switch (sortField) {
          case "fileName":
            aVal = a.fileName.toLowerCase();
            bVal = b.fileName.toLowerCase();
            break;
          case "date":
            aVal = a.dateTimestamp;
            bVal = b.dateTimestamp;
            break;
          case "size":
            aVal = a.sizeBytes;
            bVal = b.sizeBytes;
            break;
          case "status":
            aVal = a.status;
            bVal = b.status;
            break;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [transfers, filterStatus, filterFileType, sortField, sortDirection]);

  // Handle actions
  const handleDelete = (transfer: Transfer) => {
    setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
    setDeleteTransfer(null);
    setOpenMenu(null);
  };

  const handleResend = (transfer: Transfer) => {
    // Simulate resend
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transfer.id ? { ...t, status: "Sending..." as Status, date: "Mar 5, 2026", dateTimestamp: Date.now() } : t
      )
    );
    setResendTransfer(null);
    setOpenMenu(null);
  };

  const handleRevokeAccess = (transfer: Transfer) => {
    // Simulate revoke
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transfer.id ? { ...t, status: "Expired" as Status } : t
      )
    );
    setRevokeTransfer(null);
    setOpenMenu(null);
  };

  const handleDownload = (transfer: Transfer) => {
    // Simulate download
    console.log("Downloading:", transfer.fileName);
    setOpenMenu(null);
  };

  const toggleStatusFilter = (status: Status) => {
    setFilterStatus((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const toggleFileTypeFilter = (type: Transfer["fileType"]) => {
    setFilterFileType((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const clearFilters = () => {
    setFilterStatus([]);
    setFilterFileType([]);
  };

  const hasActiveFilters = filterStatus.length > 0 || filterFileType.length > 0;

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} />;
    return sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Table Header */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-sm sm:text-[15px]" style={{ color: "#e2e8f0", fontWeight: 600 }}>
            Recent Transfers
          </h2>
          <span
            className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px]"
            style={{
              color: "#0B7FFF",
              background: "rgba(11,127,255,0.14)",
              fontWeight: 600,
            }}
          >
            {filteredAndSortedTransfers.length}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] transition-colors hover:bg-white/5"
              style={{
                color: "#64748b",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              Clear filters
              <X size={10} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 relative">
          {/* Sort Button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSortMenu(!showSortMenu);
                setShowFilterMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
              style={{
                fontSize: "12px",
                color: sortField ? "#0B7FFF" : "#64748b",
                border: "1px solid rgba(255,255,255,0.07)",
                background: sortField ? "rgba(11,127,255,0.1)" : "transparent",
              }}
            >
              <ArrowUpDown size={12} />
              <span className="hidden sm:inline">Sort</span>
            </button>

            {showSortMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSortMenu(false)}
                />
                <div
                  className="absolute right-0 top-10 rounded-xl overflow-hidden z-50 min-w-[160px]"
                  style={{
                    background: "#131929",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  {[
                    { field: "fileName" as SortField, label: "File Name" },
                    { field: "date" as SortField, label: "Date" },
                    { field: "size" as SortField, label: "Size" },
                    { field: "status" as SortField, label: "Status" },
                  ].map(({ field, label }) => (
                    <button
                      key={field}
                      onClick={() => handleSort(field)}
                      className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center justify-between gap-2"
                      style={{
                        fontSize: "13px",
                        color: sortField === field ? "#0B7FFF" : "#94a3b8",
                      }}
                    >
                      {label}
                      {getSortIcon(field)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Filter Button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFilterMenu(!showFilterMenu);
                setShowSortMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
              style={{
                fontSize: "12px",
                color: hasActiveFilters ? "#0B7FFF" : "#64748b",
                border: "1px solid rgba(255,255,255,0.07)",
                background: hasActiveFilters ? "rgba(11,127,255,0.1)" : "transparent",
              }}
            >
              <Filter size={12} />
              <span className="hidden sm:inline">Filter</span>
              {hasActiveFilters && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "#0B7FFF" }}
                />
              )}
            </button>

            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowFilterMenu(false)}
                />
                <div
                  className="absolute right-0 top-10 rounded-xl overflow-hidden z-50 min-w-[200px]"
                  style={{
                    background: "#131929",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                  }}
                >
                  {/* Status filters */}
                  <div className="p-3 border-b border-white/5">
                    <div
                      className="text-[10.5px] mb-2"
                      style={{ color: "#3d4f6e", fontWeight: 700, letterSpacing: "0.1em" }}
                    >
                      STATUS
                    </div>
                    {(["Delivered", "Sending...", "Pending", "Expired"] as Status[]).map((status) => (
                      <label
                        key={status}
                        className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 px-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={filterStatus.includes(status)}
                          onChange={() => toggleStatusFilter(status)}
                          className="w-3.5 h-3.5 rounded accent-blue-500"
                        />
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>{status}</span>
                      </label>
                    ))}
                  </div>

                  {/* File type filters */}
                  <div className="p-3">
                    <div
                      className="text-[10.5px] mb-2"
                      style={{ color: "#3d4f6e", fontWeight: 700, letterSpacing: "0.1em" }}
                    >
                      FILE TYPE
                    </div>
                    {(["pdf", "zip", "video", "img"] as Transfer["fileType"][]).map((type) => (
                      <label
                        key={type}
                        className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 px-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={filterFileType.includes(type)}
                          onChange={() => toggleFileTypeFilter(type)}
                          className="w-3.5 h-3.5 rounded accent-blue-500"
                        />
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                          {type.toUpperCase()}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        {/* Column Headers */}
        <div
          className="grid px-6 py-3"
          style={{
            gridTemplateColumns: "2.5fr 2fr 80px 110px 130px 40px",
            background: "rgba(0,0,0,0.15)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {["File Name", "Recipient", "Size", "Status", "Security", ""].map((col) => (
            <span
              key={col}
              style={{
                fontSize: "10.5px",
                color: "#3d4f6e",
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            >
              {col.toUpperCase()}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div>
          {filteredAndSortedTransfers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p style={{ fontSize: "13px", color: "#64748b" }}>No transfers match your filters</p>
            </div>
          ) : (
            filteredAndSortedTransfers.map((transfer, idx) => {
              const FileIcon = fileIcons[transfer.fileType];
              const iconColor = fileColors[transfer.fileType];
              const status = statusConfig[transfer.status];
              const isLast = idx === filteredAndSortedTransfers.length - 1;

              return (
                <div
                  key={transfer.id}
                  className="grid px-6 items-center transition-colors duration-150 hover:bg-white/[0.025] relative group"
                  style={{
                    gridTemplateColumns: "2.5fr 2fr 80px 110px 130px 40px",
                    paddingTop: "14px",
                    paddingBottom: "14px",
                    borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  {/* File Name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}22` }}
                    >
                      <FileIcon size={14} style={{ color: iconColor }} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p
                        style={{ fontSize: "13px", color: "#cbd5e1", fontWeight: 500 }}
                        className="truncate"
                      >
                        {transfer.fileName}
                      </p>
                      <p style={{ fontSize: "11px", color: "#3d4f6e" }}>{transfer.date}</p>
                    </div>
                  </div>

                  {/* Recipient */}
                  <div className="min-w-0 pr-4">
                    <p
                      style={{ fontSize: "12.5px", color: "#64748b" }}
                      className="truncate"
                    >
                      {transfer.recipient}
                    </p>
                  </div>

                  {/* Size */}
                  <div>
                    <p style={{ fontSize: "12.5px", color: "#64748b" }}>{transfer.size}</p>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: status.color,
                        background: status.bg,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background: status.dot,
                          boxShadow:
                            transfer.status === "Sending..."
                              ? `0 0 6px ${status.dot}`
                              : "none",
                        }}
                      />
                      {transfer.status}
                    </span>
                  </div>

                  {/* Security */}
                  <div>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "#00E5A0",
                        background: "rgba(0,229,160,0.1)",
                      }}
                    >
                      <ShieldCheck size={11} strokeWidth={2.5} />
                      Encrypted
                    </span>
                  </div>

                  {/* More Options */}
                  <div className="flex items-center justify-center relative">
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-white/10"
                      onClick={() => setOpenMenu(openMenu === transfer.id ? null : transfer.id)}
                    >
                      <MoreHorizontal size={15} style={{ color: "#64748b" }} />
                    </button>

                    {openMenu === transfer.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setOpenMenu(null)}
                        />
                        <div
                          className="absolute right-0 top-8 rounded-xl overflow-hidden z-50 min-w-[160px]"
                          style={{
                            background: "#131929",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                          }}
                        >
                          <button
                            onClick={() => {
                              handleDownload(transfer);
                            }}
                            className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                            style={{ fontSize: "13px", color: "#94a3b8" }}
                          >
                            <Download size={14} />
                            Download
                          </button>
                          <button
                            onClick={() => {
                              setResendTransfer(transfer);
                              setOpenMenu(null);
                            }}
                            className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                            style={{ fontSize: "13px", color: "#94a3b8" }}
                          >
                            <Send size={14} />
                            Resend
                          </button>
                          <button
                            onClick={() => {
                              setDetailsTransfer(transfer);
                              setOpenMenu(null);
                            }}
                            className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                            style={{ fontSize: "13px", color: "#94a3b8" }}
                          >
                            <Eye size={14} />
                            View Details
                          </button>
                          {transfer.status !== "Expired" && (
                            <button
                              onClick={() => {
                                setRevokeTransfer(transfer);
                                setOpenMenu(null);
                              }}
                              className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                              style={{ fontSize: "13px", color: "#FBBF24" }}
                            >
                              <ShieldOff size={14} />
                              Revoke Access
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setDeleteTransfer(transfer);
                              setOpenMenu(null);
                            }}
                            className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                            style={{ fontSize: "13px", color: "#F87171" }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Mobile/Tablet Card View */}
      <div className="lg:hidden">
        {filteredAndSortedTransfers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p style={{ fontSize: "13px", color: "#64748b" }}>No transfers match your filters</p>
          </div>
        ) : (
          filteredAndSortedTransfers.map((transfer, idx) => {
            const FileIcon = fileIcons[transfer.fileType];
            const iconColor = fileColors[transfer.fileType];
            const status = statusConfig[transfer.status];
            const isLast = idx === filteredAndSortedTransfers.length - 1;

            return (
              <div
                key={transfer.id}
                className="px-4 sm:px-6 py-4 transition-colors duration-150 hover:bg-white/[0.025]"
                style={{
                  borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Top row: Icon + File info + Menu */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}22` }}
                  >
                    <FileIcon size={16} style={{ color: iconColor }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      style={{ fontSize: "13px", color: "#cbd5e1", fontWeight: 500 }}
                      className="truncate mb-0.5"
                    >
                      {transfer.fileName}
                    </p>
                    <p style={{ fontSize: "11px", color: "#3d4f6e" }} className="mb-1">
                      {transfer.date}
                    </p>
                    <p
                      style={{ fontSize: "12px", color: "#64748b" }}
                      className="truncate"
                    >
                      {transfer.recipient}
                    </p>
                  </div>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    onClick={() => setOpenMenu(openMenu === transfer.id ? null : transfer.id)}
                  >
                    <MoreHorizontal size={16} style={{ color: "#64748b" }} />
                  </button>
                </div>

                {/* Bottom row: Status, Security, Size */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                    style={{
                      fontWeight: 600,
                      color: status.color,
                      background: status.bg,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: status.dot,
                        boxShadow:
                          transfer.status === "Sending..."
                            ? `0 0 6px ${status.dot}`
                            : "none",
                      }}
                    />
                    {transfer.status}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                    style={{
                      fontWeight: 600,
                      color: "#00E5A0",
                      background: "rgba(0,229,160,0.1)",
                    }}
                  >
                    <ShieldCheck size={10} strokeWidth={2.5} />
                    Encrypted
                  </span>
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px]"
                    style={{
                      fontWeight: 500,
                      color: "#64748b",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    {transfer.size}
                  </span>
                </div>

                {/* Mobile menu */}
                {openMenu === transfer.id && (
                  <div
                    className="mt-3 rounded-xl overflow-hidden"
                    style={{
                      background: "#131929",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <button
                      onClick={() => {
                        handleDownload(transfer);
                      }}
                      className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                      style={{ fontSize: "13px", color: "#94a3b8" }}
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        setResendTransfer(transfer);
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                      style={{ fontSize: "13px", color: "#94a3b8" }}
                    >
                      <Send size={14} />
                      Resend
                    </button>
                    <button
                      onClick={() => {
                        setDetailsTransfer(transfer);
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                      style={{ fontSize: "13px", color: "#94a3b8" }}
                    >
                      <Eye size={14} />
                      View Details
                    </button>
                    {transfer.status !== "Expired" && (
                      <button
                        onClick={() => {
                          setRevokeTransfer(transfer);
                          setOpenMenu(null);
                        }}
                        className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                        style={{ fontSize: "13px", color: "#FBBF24" }}
                      >
                        <ShieldOff size={14} />
                        Revoke Access
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setDeleteTransfer(transfer);
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
                      style={{ fontSize: "13px", color: "#F87171" }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Details Modal */}
      <Dialog open={!!detailsTransfer} onOpenChange={() => setDetailsTransfer(null)}>
        <DialogContent
          className="sm:max-w-[500px] md:max-w-[580px] lg:max-w-[640px] xl:max-w-[700px] 2xl:max-w-[760px] border-0 p-0 gap-0 max-h-[90vh] overflow-y-auto"
          style={{
            background: "#0d1321",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(11,127,255,0.2) transparent",
          }}
        >
          {detailsTransfer && (
            <>
              <DialogHeader
                className="px-6 lg:px-8 py-5 lg:py-6 flex flex-row items-center justify-between"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <DialogTitle
                  className="text-[16px] lg:text-[18px]"
                  style={{ color: "#e2e8f0", fontWeight: 600 }}
                >
                  Transfer Details
                </DialogTitle>
                <button
                  onClick={() => setDetailsTransfer(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors shrink-0 m-0"
                  style={{ marginTop: 0 }}
                  aria-label="Close"
                >
                  <span style={{ color: "#6b7fa8", fontSize: "20px", lineHeight: 1 }}>✕</span>
                </button>
              </DialogHeader>
              <div className="px-6 lg:px-8 py-5 lg:py-6 space-y-5 lg:space-y-6">
                {/* File Info */}
                <div>
                  <div className="flex items-start gap-3 lg:gap-4 mb-4">
                    <div
                      className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: `${fileColors[detailsTransfer.fileType]}18`,
                        border: `1px solid ${fileColors[detailsTransfer.fileType]}22`,
                      }}
                    >
                      {(() => {
                        const Icon = fileIcons[detailsTransfer.fileType];
                        return (
                          <Icon
                            size={20}
                            className="lg:w-6 lg:h-6"
                            style={{ color: fileColors[detailsTransfer.fileType] }}
                            strokeWidth={1.8}
                          />
                        );
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: 500 }}
                        className="mb-1 lg:mb-2 break-words lg:text-[15px]"
                      >
                        {detailsTransfer.fileName}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: statusConfig[detailsTransfer.status].color,
                            background: statusConfig[detailsTransfer.status].bg,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              background: statusConfig[detailsTransfer.status].dot,
                            }}
                          />
                          {detailsTransfer.status}
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                          style={{
                            fontWeight: 600,
                            color: "#00E5A0",
                            background: "rgba(0,229,160,0.1)",
                          }}
                        >
                          <ShieldCheck size={10} strokeWidth={2.5} />
                          Encrypted
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-3 lg:space-y-3.5">
                  <DetailRow
                    icon={User}
                    label="Recipient"
                    value={detailsTransfer.recipient}
                  />
                  <DetailRow
                    icon={HardDrive}
                    label="File Size"
                    value={detailsTransfer.size}
                  />
                  <DetailRow
                    icon={Calendar}
                    label="Sent Date"
                    value={detailsTransfer.date}
                  />
                  <DetailRow
                    icon={Clock}
                    label="Expires"
                    value={detailsTransfer.expiryDate}
                  />
                  <DetailRow
                    icon={Lock}
                    label="Encryption"
                    value={detailsTransfer.encryptionType}
                  />
                  <DetailRow
                    icon={Download}
                    label="Downloads"
                    value={`${detailsTransfer.downloadCount} times`}
                  />
                  <DetailRow
                    icon={User}
                    label="Uploaded By"
                    value={detailsTransfer.uploadedBy}
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2 lg:gap-3 pt-2">
                  <button
                    onClick={() => {
                      handleDownload(detailsTransfer);
                      setDetailsTransfer(null);
                    }}
                    className="flex-1 px-4 lg:px-5 py-2.5 lg:py-3 rounded-xl transition-all hover:brightness-110"
                    style={{
                      background: "linear-gradient(135deg, #0B7FFF 0%, #0960CC 100%)",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                      boxShadow: "0 4px 16px rgba(11,127,255,0.25)",
                    }}
                  >
                    <span className="lg:text-[14px]">Download File</span>
                  </button>
                  <button
                    onClick={() => {
                      setResendTransfer(detailsTransfer);
                      setDetailsTransfer(null);
                    }}
                    className="px-4 lg:px-5 py-2.5 lg:py-3 rounded-xl transition-colors hover:bg-white/5"
                    style={{
                      fontSize: "13px",
                      color: "#94a3b8",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <span className="lg:text-[14px]">Resend</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTransfer} onOpenChange={() => setDeleteTransfer(null)}>
        <AlertDialogContent
          className="sm:max-w-[420px] border-0 p-0 gap-0"
          style={{
            background: "#0d1321",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          <AlertDialogHeader className="px-6 pt-6 pb-4">
            <AlertDialogTitle
              className="text-[16px] flex items-center gap-2"
              style={{ color: "#e2e8f0", fontWeight: 600 }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.2)",
                }}
              >
                <Trash2 size={18} style={{ color: "#F87171" }} />
              </div>
              Delete Transfer
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "13px", color: "#64748b" }}>
              Are you sure you want to delete{" "}
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                {deleteTransfer?.fileName}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="px-6 pb-6 pt-2">
            <AlertDialogCancel
              className="rounded-xl"
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTransfer && handleDelete(deleteTransfer)}
              className="rounded-xl"
              style={{
                background: "linear-gradient(135deg, #F87171 0%, #DC2626 100%)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Delete Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Access Confirmation */}
      <AlertDialog open={!!revokeTransfer} onOpenChange={() => setRevokeTransfer(null)}>
        <AlertDialogContent
          className="sm:max-w-[420px] border-0 p-0 gap-0"
          style={{
            background: "#0d1321",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          <AlertDialogHeader className="px-6 pt-6 pb-4">
            <AlertDialogTitle
              className="text-[16px] flex items-center gap-2"
              style={{ color: "#e2e8f0", fontWeight: 600 }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(251,191,36,0.12)",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}
              >
                <ShieldOff size={18} style={{ color: "#FBBF24" }} />
              </div>
              Revoke Access
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "13px", color: "#64748b" }}>
              Revoke access to{" "}
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                {revokeTransfer?.fileName}
              </span>
              ? The recipient will no longer be able to download this file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="px-6 pb-6 pt-2">
            <AlertDialogCancel
              className="rounded-xl"
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTransfer && handleRevokeAccess(revokeTransfer)}
              className="rounded-xl"
              style={{
                background: "linear-gradient(135deg, #FBBF24 0%, #D97706 100%)",
                color: "#000000",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resend Confirmation */}
      <AlertDialog open={!!resendTransfer} onOpenChange={() => setResendTransfer(null)}>
        <AlertDialogContent
          className="sm:max-w-[420px] border-0 p-0 gap-0"
          style={{
            background: "#0d1321",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          <AlertDialogHeader className="px-6 pt-6 pb-4">
            <AlertDialogTitle
              className="text-[16px] flex items-center gap-2"
              style={{ color: "#e2e8f0", fontWeight: 600 }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(11,127,255,0.12)",
                  border: "1px solid rgba(11,127,255,0.2)",
                }}
              >
                <Send size={18} style={{ color: "#0B7FFF" }} />
              </div>
              Resend Transfer
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "13px", color: "#64748b" }}>
              Resend{" "}
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                {resendTransfer?.fileName}
              </span>{" "}
              to{" "}
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                {resendTransfer?.recipient}
              </span>
              ? A new secure link will be generated and sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="px-6 pb-6 pt-2">
            <AlertDialogCancel
              className="rounded-xl"
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resendTransfer && handleResend(resendTransfer)}
              className="rounded-xl"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960CC 100%)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                boxShadow: "0 4px 16px rgba(11,127,255,0.25)",
              }}
            >
              Resend File
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-3 lg:gap-4 px-3 lg:px-4 py-2.5 lg:py-3 rounded-lg lg:rounded-xl"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <div
        className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg lg:rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(11,127,255,0.1)" }}
      >
        <Icon size={14} className="lg:w-4 lg:h-4" style={{ color: "#0B7FFF" }} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          style={{ fontSize: "10.5px", color: "#3d4f6e", fontWeight: 700, letterSpacing: "0.05em" }}
          className="lg:text-[11px]"
        >
          {label.toUpperCase()}
        </p>
        <p
          style={{ fontSize: "13px", color: "#cbd5e1" }}
          className="truncate lg:text-[14px]"
        >
          {value}
        </p>
      </div>
    </div>
  );
}
