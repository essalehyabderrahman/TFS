import { useEffect, useState, useCallback } from "react";
import {
  Trash2,
  RotateCcw,
  X,
  File,
  FileText,
  FileImage,
  FileArchive,
  FileVideo,
  Users,
  User,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { Transfer } from "@/types";
import {
  fetchTrash,
  restoreTransfer,
  permanentDeleteTransfer,
} from "../api/transfers";
import {
  apiListTrash,
  apiRestoreItem,
  apiPermanentDeleteItem,
  type FSItem,
} from "../api/explorer";

// ── helpers ──────────────────────────────────────────────────────────────────

type FileKind = "pdf" | "img" | "zip" | "video" | "doc" | "other";

const fileIconMap: Record<FileKind, React.ElementType> = {
  pdf: FileText, img: FileImage, zip: FileArchive,
  video: FileVideo, doc: FileText, other: File,
};
const fileColorMap: Record<FileKind, string> = {
  pdf: "#F87171", img: "#34D399", zip: "#FBBF24",
  video: "#A78BFA", doc: "#60A5FA", other: "#94A3B8",
};

function getFileKind(fileName: string): FileKind {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["png","jpg","jpeg","gif","webp"].includes(ext)) return "img";
  if (["zip","tar","gz","rar"].includes(ext)) return "zip";
  if (["mp4","mov","avi","mkv"].includes(ext)) return "video";
  if (["doc","docx","txt","csv","md","json","xml"].includes(ext)) return "doc";
  return "other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

// ── unified item type ─────────────────────────────────────────────────────────

type TrashSource = "personal" | "group";

interface TrashItem {
  id: string;
  name: string;
  size: number;
  fileKind: FileKind;
  deletedAt: string;  // human-friendly
  source: TrashSource;
  groupName?: string;
  raw: Transfer | FSItem;
}

// ── confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onCancel} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[400px] rounded-2xl p-6"
        style={{
          background: "var(--card-background)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}
      >
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.2)" }}>
            <AlertTriangle size={18} style={{ color: "#F87171" }} />
          </div>
          <div>
            <p style={{ fontSize: "15px", color: "var(--foreground)", fontWeight: 600 }}>{title}</p>
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "4px", lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[13px] transition-colors hover:bg-white/5 cursor-pointer"
            style={{ color: "#64748b", border: "1px solid var(--border)" }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110 cursor-pointer"
            style={{ background: confirmColor, color: "white" }}
          >{confirmLabel}</button>
        </div>
      </div>
    </>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyTrash() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
        <Trash2 size={32} style={{ color: "var(--foreground)" }} />
      </div>
      <div className="text-center">
        <p style={{ fontSize: "16px", color: "var(--foreground)", fontWeight: 600 }}>Trash is empty</p>
        <p style={{ fontSize: "13px", color: "var(--foreground)", marginTop: "4px" }}>Deleted files will appear here</p>
      </div>
    </div>
  );
}

// ── row ───────────────────────────────────────────────────────────────────────

function TrashRow({
  item,
  onRestore,
  onDelete,
}: {
  item: TrashItem;
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
}) {
  const FileIcon = fileIconMap[item.fileKind] ?? File;
  const iconColor = fileColorMap[item.fileKind] ?? "#94A3B8";

  return (
    <div
      className="group grid items-center px-5 py-3.5 transition-all duration-150 hover:bg-white/[0.025]"
      style={{
        gridTemplateColumns: "1fr 80px 140px 100px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}28` }}>
          <FileIcon size={16} style={{ color: iconColor }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate" style={{ color: "var(--foreground)" }}>{item.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.source === "group" ? (
              <>
                <Users size={10} style={{ color: "#64748b" }} />
                <span style={{ fontSize: "11px", color: "#64748b" }}>{item.groupName ?? "Group"}</span>
              </>
            ) : (
              <>
                <User size={10} style={{ color: "#64748b" }} />
                <span style={{ fontSize: "11px", color: "#64748b" }}>Personal</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Size */}
      <p style={{ fontSize: "12px", color: "#475569" }}>{formatBytes(item.size)}</p>

      {/* Deleted */}
      <p style={{ fontSize: "12px", color: "#475569" }}>{item.deletedAt}</p>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          title="Restore"
          onClick={() => onRestore(item)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all hover:bg-emerald-500/10 cursor-pointer"
          style={{ color: "#34D399", fontSize: "11px", fontWeight: 600 }}
        >
          <RotateCcw size={12} />
          Restore
        </button>
        <button
          title="Delete permanently"
          onClick={() => onDelete(item)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all hover:bg-red-500/10"
          style={{ color: "#F87171", fontSize: "11px", fontWeight: 600 }}
        >
          <X size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function Trash() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [confirmRestore, setConfirmRestore] = useState<TrashItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrashItem | null>(null);
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [transferRes, explorerRes] = await Promise.all([
        fetchTrash(),
        apiListTrash(),
      ]);

      const mapped: TrashItem[] = [];

      // Transfers (shared / group files)
      for (const t of (transferRes.data ?? [])) {
        const kind = getFileKind(t.fileName ?? "");
        mapped.push({
          id: `t:${t.id}`,
          name: t.fileName ?? "Unknown",
          size: t.sizeBytes ?? 0,
          fileKind: kind,
          deletedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
          source: t.groupId ? "group" : "personal",
          groupName: t.groupName ?? undefined,
          raw: t,
        });
      }

      // Explorer (personal File Manager)
      for (const f of (explorerRes.data ?? [])) {
        if (f.type === "folder") continue; // skip deleted folders for now
        const kind = (f.fileKind as FileKind) ?? getFileKind(f.name);
        mapped.push({
          id: `e:${f.id}`,
          name: f.name,
          size: f.size ?? 0,
          fileKind: kind,
          deletedAt: f.createdAt ?? "—",
          source: "personal",
          raw: f,
        });
      }

      setItems(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── actions ──────────────────────────────────────────────────────────────

  const doRestore = async (item: TrashItem) => {
    setConfirmRestore(null);
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      if (item.id.startsWith("t:")) {
        const { ok, error } = await restoreTransfer((item.raw as Transfer).id);
        if (!ok) { toast.error(error ?? "Restore failed"); return; }
      } else {
        const { ok, error } = await apiRestoreItem((item.raw as FSItem).id);
        if (!ok) { toast.error(error ?? "Restore failed"); return; }
      }
      toast.success(`"${item.name}" restored.`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
    }
  };

  const doDelete = async (item: TrashItem) => {
    setConfirmDelete(null);
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      if (item.id.startsWith("t:")) {
        const { ok, error } = await permanentDeleteTransfer((item.raw as Transfer).id);
        if (!ok) { toast.error(error ?? "Delete failed"); return; }
      } else {
        const { ok, error } = await apiPermanentDeleteItem((item.raw as FSItem).id);
        if (!ok) { toast.error(error ?? "Delete failed"); return; }
      }
      toast.success(`"${item.name}" permanently deleted.`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
    }
  };

  const doEmptyAll = async () => {
    setConfirmEmptyAll(false);
    const toDelete = [...items];
    for (const item of toDelete) {
      setBusyIds((s) => new Set(s).add(item.id));
      if (item.id.startsWith("t:")) {
        await permanentDeleteTransfer((item.raw as Transfer).id);
      } else {
        await apiPermanentDeleteItem((item.raw as FSItem).id);
      }
    }
    setItems([]);
    setBusyIds(new Set());
    toast.success("Trash emptied.");
  };

  // ── sections ──────────────────────────────────────────────────────────────

  const personalItems = items.filter((i) => i.source === "personal");
  const groupItems = items.filter((i) => i.source === "group");

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.18)" }}
          >
            <Trash2 size={18} style={{ color: "#F87171" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground)" }}>Recycle Bin</h1>
            <p style={{ fontSize: "12px", color: "#475569" }}>
              {items.length} item{items.length !== 1 ? "s" : ""} · Files are permanently removed after 30 days
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] transition-all hover:bg-white/5"
            style={{ color: "#64748b", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {items.length > 0 && (
            <button
              onClick={() => setConfirmEmptyAll(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110"
              style={{ background: "rgba(248,113,113,0.12)", color: "#F87171", border: "1px solid rgba(248,113,113,0.18)" }}
            >
              <Trash2 size={13} />
              Empty Trash
            </button>
          )}
        </div>
      </div>

      {/* Notice banner */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}
      >
        <AlertTriangle size={14} style={{ color: "#FBBF24", flexShrink: 0 }} />
        <p style={{ fontSize: "12px", color: "#92400e" }}>
          Items in Trash are <span style={{ color: "#FBBF24", fontWeight: 600 }}>inaccessible</span> to recipients and group members.
          Restore them to make them active again, or delete permanently to free up storage.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin" style={{ color: "#334155" }} />
        </div>
      ) : items.length === 0 ? (
        <EmptyTrash />
      ) : (
        <>
          {/* ── Personal Trash ─────────────────────────────────────────────── */}
          {personalItems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <User size={13} style={{ color: "#64748b" }} />
                <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700, letterSpacing: "0.1em" }}>
                  PERSONAL FILES — {personalItems.length}
                </span>
              </div>
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
              >
                {/* Table header */}
                <div
                  className="grid px-5 py-2.5"
                  style={{
                    gridTemplateColumns: "1fr 80px 140px 100px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {["Name", "Size", "Deleted", ""].map((h) => (
                    <span key={h} style={{ fontSize: "11px", color: "#334155", fontWeight: 700, letterSpacing: "0.08em" }}>{h}</span>
                  ))}
                </div>
                {personalItems.map((item) => (
                  <TrashRow
                    key={item.id}
                    item={item}
                    onRestore={() => setConfirmRestore(item)}
                    onDelete={() => setConfirmDelete(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Group Trash ────────────────────────────────────────────────── */}
          {groupItems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users size={13} style={{ color: "#64748b" }} />
                <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700, letterSpacing: "0.1em" }}>
                  GROUP FILES — {groupItems.length}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                  style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA", letterSpacing: "0.08em" }}
                >
                  Admin Only
                </span>
              </div>
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(167,139,250,0.12)", background: "rgba(167,139,250,0.02)" }}
              >
                {/* Table header */}
                <div
                  className="grid px-5 py-2.5"
                  style={{
                    gridTemplateColumns: "1fr 80px 140px 100px",
                    borderBottom: "1px solid rgba(167,139,250,0.08)",
                    background: "rgba(167,139,250,0.03)",
                  }}
                >
                  {["Name", "Size", "Deleted", ""].map((h) => (
                    <span key={h} style={{ fontSize: "11px", color: "#334155", fontWeight: 700, letterSpacing: "0.08em" }}>{h}</span>
                  ))}
                </div>
                {groupItems.map((item) => (
                  <TrashRow
                    key={item.id}
                    item={item}
                    onRestore={() => setConfirmRestore(item)}
                    onDelete={() => setConfirmDelete(item)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Confirm Dialogs ─────────────────────────────────────────────────── */}
      {confirmRestore && (
        <ConfirmDialog
          title="Restore file?"
          message={`"${confirmRestore.name}" will be moved back to its original location and become accessible again.`}
          confirmLabel="Restore"
          confirmColor="rgba(52,211,153,0.9)"
          onConfirm={() => doRestore(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Permanently delete?"
          message={`"${confirmDelete.name}" will be erased from the server permanently. This cannot be undone.`}
          confirmLabel="Delete forever"
          confirmColor="rgba(239,68,68,0.85)"
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmEmptyAll && (
        <ConfirmDialog
          title={`Empty entire trash? (${items.length} items)`}
          message="All files in the trash will be permanently erased. This cannot be undone."
          confirmLabel="Empty Trash"
          confirmColor="rgba(239,68,68,0.85)"
          onConfirm={doEmptyAll}
          onCancel={() => setConfirmEmptyAll(false)}
        />
      )}
    </div>
  );
}
