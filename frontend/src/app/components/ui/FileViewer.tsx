/**
 * FileViewer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A full-screen modal that fetches the file from the backend preview endpoint
 * and renders it inline. Text files additionally support in-place editing:
 *
 *  • Click "Edit" → acquire lock (transfer/group only) → enter edit mode
 *  • Click "Save" → PUT new content → release lock → return to read mode
 *  • Click "Cancel" or close → release lock → discard changes
 *
 * Supported render modes:
 *   • Images  → <img>
 *   • PDFs    → <iframe>
 *   • Text/code → <pre><code>  (read) / <textarea> (edit)
 *   • Video   → <video>
 *   • Unsupported → fallback with Download button
 *
 * Usage:
 *   <FileViewer
 *     fileId="abc-123"
 *     fileName="report.pdf"
 *     fileType="pdf"
 *     source="transfer"          // "transfer" | "explorer"
 *     groupId="grp-456"          // optional — required for group-workspace files
 *     context="received"         // optional, passed to /preview?context=
 *     onClose={() => setOpen(false)}
 *     onDownload={() => handleDownload(transfer)}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  FileText,
  FileImage,
  FileArchive,
  FileVideo,
  File,
  AlertTriangle,
  Loader2,
  Pencil,
  Save,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

import { updateTransferContent, lockTransfer, unlockTransfer } from "@/app/api/transfers";
import { lockGroupItem, unlockGroupItem, updateGroupFileContent } from "@/app/api/groups";
import { updateExplorerFileContent } from "@/app/api/explorer";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileKind = "pdf" | "img" | "zip" | "video" | "doc" | "other";

type PreviewCategory = "image" | "pdf" | "text" | "video" | "unsupported";

interface FileViewerProps {
  fileId: string;
  fileName: string;
  fileType: FileKind;
  /** Which backend namespace owns this file */
  source: "transfer" | "explorer";
  /**
   * Required for group-workspace files (source === "transfer" inside a group).
   * Determines which lock/save endpoints are called.
   */
  groupId?: string;
  /** Optional – forwarded to /preview?context= (e.g. "received") */
  context?: string;
  onClose: () => void;
  onDownload?: () => void;
  /** Start directly in edit mode */
  initialEditMode?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function categoryFromFileType(fileType: FileKind, fileName: string): PreviewCategory {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (fileType === "img" || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return "image";
  if (fileType === "pdf" || ext === "pdf")
    return "pdf";
  if (fileType === "video" || ["mp4", "webm", "ogv", "mov"].includes(ext))
    return "video";
  if (
    fileType === "doc" ||
    ["txt", "md", "csv", "json", "xml", "yaml", "yml", "toml", "ini",
     "log", "sh", "py", "js", "ts", "tsx", "jsx", "html", "css"].includes(ext)
  )
    return "text";
  return "unsupported";
}

const fileIcons: Record<FileKind, React.ElementType> = {
  pdf: FileText, img: FileImage, zip: FileArchive,
  video: FileVideo, doc: FileText, other: File,
};

const fileIconColors: Record<FileKind, string> = {
  pdf: "#F87171", img: "#34D399", zip: "#FBBF24",
  video: "#A78BFA", doc: "#60A5FA", other: "#94A3B8",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function FileViewer({
  fileId,
  fileName,
  fileType,
  source,
  groupId,
  context,
  onClose,
  onDownload,
  initialEditMode = false,
}: FileViewerProps) {
  const category = categoryFromFileType(fileType, fileName);

  // ── Fetch state ────────────────────────────────────────────────────────────
  const [blobUrl, setBlobUrl]         = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // ── Image controls ─────────────────────────────────────────────────────────
  const [zoom, setZoom]           = useState(1);
  const [rotation, setRotation]   = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing]   = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving]     = useState(false);
  /** True while the lock-acquire request is in flight */
  const [isLocking, setIsLocking]   = useState(false);
  /** We hold the lock once entering edit mode */
  const lockHeld = useRef(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // ── Can this file be edited? ───────────────────────────────────────────────
  // Only text-category files are editable; all three sources are supported.
  const canEdit = category === "text" && !loading && !error;

  // ── Lock helpers ───────────────────────────────────────────────────────────
  const acquireLock = useCallback(async (): Promise<boolean> => {
    // Explorer files are single-owner — no lock needed
    if (source === "explorer") return true;

    setIsLocking(true);
    const result = groupId
      ? await lockGroupItem(groupId, fileId)
      : await lockTransfer(fileId);
    setIsLocking(false);

    if (!result.ok) {
      const who = result.lockedBy ? ` (held by ${result.lockedBy})` : "";
      toast.error(`File is locked${who} — try again later.`);
      return false;
    }
    lockHeld.current = true;
    return true;
  }, [source, groupId, fileId]);

  const releaseLock = useCallback(async () => {
    if (source === "explorer" || !lockHeld.current) return;
    lockHeld.current = false;
    if (groupId) {
      await unlockGroupItem(groupId, fileId);
    } else {
      await unlockTransfer(fileId);
    }
  }, [source, groupId, fileId]);

  // ── Unmount cleanup: release lock if held ──────────────────────────────────
  useEffect(() => {
    return () => {
      if (lockHeld.current) {
        if (source !== "explorer") {
          if (groupId) {
            unlockGroupItem(groupId, fileId);
          } else {
            unlockTransfer(fileId);
          }
        }
      }
    };
  }, [source, groupId, fileId]);

  // ── Fetch preview ──────────────────────────────────────────────────────────
  useEffect(() => {
    let objectUrl: string | null = null;

    const fetchPreview = async () => {
      setLoading(true);
      setError(null);

      const base = source === "transfer"
        ? `${API_BASE}/transfers/${fileId}/preview`
        : `${API_BASE}/explorer/${fileId}/preview`;

      const url = context ? `${base}?context=${encodeURIComponent(context)}` : base;

      try {
        const res = await fetch(url, { credentials: "include" });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `HTTP ${res.status}`);
          setLoading(false);
          return;
        }

        if (category === "text") {
          const text = await res.text();
          setTextContent(text);
        } else {
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        }
      } catch {
        setError("NETWORK_ERROR");
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileId, source, context, category]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) {
          handleCancel();
        } else {
          onClose();
        }
      }
      if (category === "image" && !isEditing) {
        if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 5));
        if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, category, isEditing]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const enterEdit = async () => {
    const acquired = await acquireLock();
    if (!acquired) return;
    setEditContent(textContent ?? "");
    setIsEditing(true);
  };

  // ── Auto-trigger edit mode on load if requested ──────────────────────────
  useEffect(() => {
    if (initialEditMode && canEdit && !isEditing) {
      enterEdit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, initialEditMode]);

  const handleSave = async () => {
    setIsSaving(true);

    let saveError: string | null = null;
    let lockedBy: string | undefined;

    if (source === "explorer") {
      const r = await updateExplorerFileContent(fileId, editContent);
      saveError = r.error;
    } else if (groupId) {
      const r = await updateGroupFileContent(groupId, fileId, editContent);
      saveError = r.error;
      lockedBy  = r.lockedBy;
    } else {
      const r = await updateTransferContent(fileId, editContent);
      saveError = r.error;
      lockedBy  = r.lockedBy;
    }

    if (saveError) {
      const detail = lockedBy ? ` (${lockedBy})` : "";
      toast.error(`Save failed: ${saveError}${detail}`);
      setIsSaving(false);
      return;
    }

    // Persist locally so read-mode reflects the new content immediately
    setTextContent(editContent);
    // Release lock and exit edit mode
    await releaseLock();
    setIsEditing(false);
    setIsSaving(false);
    toast.success("File saved.");
  };

  const handleCancel = async () => {
    await releaseLock();
    setIsEditing(false);
  };

  /** Enhanced close: release lock if we hold one */
  const handleClose = async () => {
    if (isEditing) await releaseLock();
    onClose();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const IconComponent = fileIcons[fileType];
  const iconColor     = fileIconColors[fileType];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(4, 7, 18, 0.92)", backdropFilter: "blur(12px)" }}
        onClick={handleClose}
        aria-hidden
      />

      {/* Modal shell */}
      <div
        ref={modalRef}
        className="fixed z-[70] flex flex-col"
        style={{
          inset: fullscreen ? 0 : "clamp(16px, 3vh, 32px) clamp(16px, 3vw, 48px)",
          borderRadius: fullscreen ? 0 : "20px",
          background: "linear-gradient(160deg, #0d1525 0%, #080d1b 100%)",
          border: fullscreen ? "none" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 96px rgba(0,0,0,0.7), 0 0 0 1px rgba(11,127,255,0.06)",
          overflow: "hidden",
          transition: "inset 220ms cubic-bezier(0.4,0,0.2,1), border-radius 220ms",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 shrink-0"
          style={{
            background: "rgba(255,255,255,0.025)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* File icon + name */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}22` }}
          >
            <IconComponent size={15} style={{ color: iconColor }} strokeWidth={1.8} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="truncate" style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 600 }}>
              {fileName}
            </p>
            <p style={{ fontSize: "11px", color: "#3d4f6e", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {isEditing ? "editing" : category === "unsupported" ? "No preview available" : category}
            </p>
          </div>

          {/* ── Toolbar controls ─────────────────────────────────────────── */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">

            {/* Image zoom controls (read mode only) */}
            {category === "image" && !isEditing && !loading && !error && (
              <>
                <ToolbarBtn icon={ZoomOut} label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))} />
                <span
                  className="hidden sm:inline px-2 py-1 rounded-lg text-[11px] tabular-nums"
                  style={{ color: "#64748b", background: "rgba(255,255,255,0.05)" }}
                >
                  {Math.round(zoom * 100)}%
                </span>
                <ToolbarBtn icon={ZoomIn} label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 5))} />
                <ToolbarBtn icon={RotateCw} label="Rotate"
                  onClick={() => setRotation((r) => (r + 90) % 360)} />
              </>
            )}

            {/* Edit button — text files, read mode only */}
            {canEdit && !isEditing && (
              <ToolbarBtn
                icon={isLocking ? Loader2 : Pencil}
                label="Edit file"
                onClick={enterEdit}
                spinning={isLocking}
              />
            )}

            {/* Save / Cancel — edit mode only */}
            {isEditing && (
              <>
                <ToolbarBtn
                  icon={Ban}
                  label="Cancel editing"
                  onClick={handleCancel}
                  disabled={isSaving}
                />
                <ToolbarBtn
                  icon={isSaving ? Loader2 : Save}
                  label="Save file"
                  onClick={handleSave}
                  accent
                  spinning={isSaving}
                  disabled={isSaving}
                />
              </>
            )}

            {/* Fullscreen toggle (read mode only) */}
            {!isEditing && (
              <ToolbarBtn
                icon={fullscreen ? Minimize2 : Maximize2}
                label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={() => setFullscreen((f) => !f)}
              />
            )}

            {/* Download (always visible unless editing) */}
            {onDownload && !isEditing && (
              <ToolbarBtn icon={Download} label="Download" onClick={onDownload} accent />
            )}

            {/* Close */}
            <ToolbarBtn icon={X} label="Close" onClick={handleClose} />
          </div>
        </div>

        {/* ── Content area ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
          {loading && <LoadingState fileName={fileName} />}

          {!loading && error && (
            <ErrorState error={error} fileName={fileName} onDownload={onDownload} onClose={handleClose} />
          )}

          {/* Image */}
          {!loading && !error && category === "image" && blobUrl && (
            <ImagePreview src={blobUrl} alt={fileName} zoom={zoom} rotation={rotation} onZoomChange={setZoom} />
          )}

          {/* PDF */}
          {!loading && !error && category === "pdf" && blobUrl && (
            <PdfPreview src={blobUrl} />
          )}

          {/* Video */}
          {!loading && !error && category === "video" && blobUrl && (
            <VideoPreview src={blobUrl} fileName={fileName} />
          )}

          {/* Text — read mode */}
          {!loading && !error && category === "text" && textContent !== null && !isEditing && (
            <TextPreview content={textContent} fileName={fileName} />
          )}

          {/* Text — edit mode */}
          {!loading && !error && category === "text" && isEditing && (
            <EditableTextArea
              content={editContent}
              fileName={fileName}
              onChange={setEditContent}
            />
          )}

          {/* Unsupported */}
          {!loading && !error && category === "unsupported" && (
            <UnsupportedPreview
              fileName={fileName}
              fileType={fileType}
              onDownload={onDownload}
              onClose={handleClose}
            />
          )}
        </div>

        {/* ── Status bar (image read mode only) ────────────────────────────── */}
        {category === "image" && !isEditing && !loading && !error && (
          <div
            className="shrink-0 px-5 py-2 flex items-center gap-4"
            style={{
              background: "rgba(0,0,0,0.3)",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              fontSize: "11px",
              color: "#3d4f6e",
            }}
          >
            <span>Scroll to zoom · Drag to pan</span>
            <span style={{ marginLeft: "auto" }}>{Math.round(zoom * 100)}% · {rotation}°</span>
          </div>
        )}

        {/* ── Edit status bar ───────────────────────────────────────────────── */}
        {isEditing && (
          <div
            className="shrink-0 px-5 py-2 flex items-center gap-3"
            style={{
              background: "rgba(11,127,255,0.06)",
              borderTop: "1px solid rgba(11,127,255,0.15)",
              fontSize: "11px",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "#0B7FFF", flexShrink: 0 }}
            />
            <span style={{ color: "#60A5FA" }}>Editing</span>
            {source !== "explorer" && (
              <span style={{ color: "#3d4f6e" }}>· File is locked to you</span>
            )}
            <span style={{ marginLeft: "auto", color: "#3d4f6e" }}>
              {editContent.split("\n").length} lines · {new Blob([editContent]).size} bytes
            </span>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  accent,
  spinning,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  accent?: boolean;
  spinning?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: accent ? "rgba(11,127,255,0.18)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${accent ? "rgba(11,127,255,0.3)" : "rgba(255,255,255,0.07)"}`,
        color: accent ? "#60A5FA" : "#64748b",
      }}
    >
      <Icon size={14} strokeWidth={2} className={spinning ? "animate-spin" : undefined} />
    </button>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingState({ fileName }: { fileName: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <Loader2 size={36} className="animate-spin" style={{ color: "#0B7FFF", opacity: 0.8 }} />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(11,127,255,0.15) 0%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />
      </div>
      <div className="text-center">
        <p style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>Loading preview…</p>
        <p style={{ fontSize: "11px", color: "#3d4f6e" }} className="mt-1 truncate max-w-xs">
          {fileName}
        </p>
      </div>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

const errorMessages: Record<string, string> = {
  FORBIDDEN:      "You don't have permission to view this file.",
  EXPIRED:        "This transfer has expired.",
  DECRYPT_ERROR:  "The file could not be decrypted.",
  NOT_FOUND:      "File not found.",
  NETWORK_ERROR:  "Network error — check your connection.",
};

function ErrorState({
  error, fileName, onDownload, onClose,
}: {
  error: string; fileName: string; onDownload?: () => void; onClose: () => void;
}) {
  const message = errorMessages[error] ?? `An error occurred (${error}).`;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}
      >
        <AlertTriangle size={28} style={{ color: "#F87171" }} />
      </div>
      <div className="text-center max-w-sm">
        <p style={{ fontSize: "15px", color: "#e2e8f0", fontWeight: 600 }} className="mb-2">
          Preview unavailable
        </p>
        <p style={{ fontSize: "13px", color: "#64748b" }}>{message}</p>
      </div>
      <div className="flex gap-3">
        {onDownload && (
          <button
            onClick={onDownload}
            className="px-5 py-2.5 rounded-xl transition-all hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, #0B7FFF 0%, #0960CC 100%)",
              color: "#fff", fontSize: "13px", fontWeight: 600,
              boxShadow: "0 4px 16px rgba(11,127,255,0.25)",
            }}
          >
            <span className="flex items-center gap-2">
              <Download size={14} /> Download instead
            </span>
          </button>
        )}
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl transition-colors hover:bg-white/5"
          style={{ color: "#94a3b8", fontSize: "13px", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Image Preview ─────────────────────────────────────────────────────────────

function ImagePreview({
  src, alt, zoom, rotation, onZoomChange,
}: {
  src: string; alt: string; zoom: number; rotation: number;
  onZoomChange: (z: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      onZoomChange(Math.min(Math.max(zoom + delta, 0.1), 8));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoom, onZoomChange]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-auto flex items-center justify-center"
      style={{
        cursor: zoom > 1 ? "grab" : "default",
        background:
          "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 24px 24px",
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: zoom <= 1 ? "100%" : "none",
          maxHeight: zoom <= 1 ? "100%" : "none",
          transform: `scale(${zoom}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
          transition: "transform 150ms cubic-bezier(0.4,0,0.2,1)",
          borderRadius: "4px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          userSelect: "none",
        }}
      />
    </div>
  );
}

// ── PDF Preview ───────────────────────────────────────────────────────────────

function PdfPreview({ src }: { src: string }) {
  return (
    <iframe
      src={src}
      title="PDF Preview"
      className="absolute inset-0 w-full h-full"
      style={{ border: "none", background: "#fff" }}
    />
  );
}

// ── Video Preview ─────────────────────────────────────────────────────────────

function VideoPreview({ src, fileName }: { src: string; fileName: string }) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "mp4";
  const mimeMap: Record<string, string> = {
    mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
  };
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8"
      style={{ background: "#000" }}
    >
      <video
        controls
        autoPlay={false}
        className="max-w-full max-h-full rounded-xl"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
      >
        <source src={src} type={mimeMap[ext] ?? "video/mp4"} />
        Your browser does not support video playback.
      </video>
    </div>
  );
}

// ── Text / Code Preview (read mode) ──────────────────────────────────────────

function TextPreview({ content, fileName }: { content: string; fileName: string }) {
  const lineCount = content.split("\n").length;
  return (
    <div
      className="absolute inset-0 overflow-auto"
      style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(11,127,255,0.2) transparent" }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 flex items-center justify-between px-5 py-2 z-10"
        style={{
          background: "rgba(13,19,41,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ fontSize: "11px", color: "#3d4f6e", fontFamily: "monospace" }}>{fileName}</span>
        <span style={{ fontSize: "11px", color: "#3d4f6e" }}>
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Code block */}
      <div className="flex">
        {/* Line numbers */}
        <div
          className="select-none text-right py-5 px-4 shrink-0"
          style={{
            borderRight: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(0,0,0,0.15)",
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: "12px",
            lineHeight: "1.7",
            color: "#2d3f5e",
            minWidth: "52px",
          }}
        >
          {content.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        {/* Content */}
        <pre
          className="flex-1 py-5 px-5 m-0 overflow-x-auto"
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: "12.5px",
            lineHeight: "1.7",
            color: "#cbd5e1",
            background: "transparent",
            whiteSpace: "pre",
            tabSize: 2,
          }}
        >
          <code>{content}</code>
        </pre>
      </div>
    </div>
  );
}

// ── Editable Text Area (edit mode) ────────────────────────────────────────────

function EditableTextArea({
  content,
  fileName,
  onChange,
}: {
  content: string;
  fileName: string;
  onChange: (v: string) => void;
}) {
  const lineCount = content.split("\n").length;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  // Auto-focus and move cursor to end on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Tab key → insert 2 spaces instead of leaving the textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      const next  = el.value.substring(0, start) + "  " + el.value.substring(end);
      onChange(next);
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  // Scroll synchronization
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const gutter = gutterRef.current;
    if (gutter) {
      gutter.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Sticky header — mirrors TextPreview style */}
      <div
        className="flex items-center justify-between px-5 py-2 shrink-0 z-10"
        style={{
          background: "rgba(13,19,41,0.95)",
          borderBottom: "1px solid rgba(11,127,255,0.18)",
        }}
      >
        <span style={{ fontSize: "11px", color: "#60A5FA", fontFamily: "monospace" }}>
          {fileName}
        </span>
        <span style={{ fontSize: "11px", color: "#3d4f6e" }}>
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Editor Layout with Gutter */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line numbers gutter */}
        <div
          ref={gutterRef}
          className="select-none text-right shrink-0 overflow-hidden"
          style={{
            borderRight: "1px solid rgba(11,127,255,0.15)",
            background: "rgba(0,0,0,0.2)",
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: "12.5px",
            color: "#1e3a5f",
            minWidth: "52px",
            paddingTop: "20px",
            paddingBottom: "20px",
            paddingRight: "16px",
            paddingLeft: "8px",
          }}
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} style={{ height: "21.25px", lineHeight: "21.25px" }}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea — scroll synchronized with gutter */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 resize-none outline-none"
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: "12.5px",
            lineHeight: "1.7",
            color: "#cbd5e1",
            background: "transparent",
            border: "none",
            padding: "20px 20px 20px 20px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(11,127,255,0.2) transparent",
            tabSize: 2,
            caretColor: "#0B7FFF",
            overflowY: "auto",
          }}
        />
      </div>
    </div>
  );
}

// ── Unsupported Fallback ──────────────────────────────────────────────────────

function UnsupportedPreview({
  fileName, fileType, onDownload, onClose,
}: {
  fileName: string; fileType: FileKind; onDownload?: () => void; onClose: () => void;
}) {
  const Icon  = fileIcons[fileType];
  const color = fileIconColors[fileType];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: `${color}12`, border: `1px solid ${color}22` }}
      >
        <Icon size={36} style={{ color }} strokeWidth={1.5} />
      </div>
      <div className="text-center max-w-sm">
        <p style={{ fontSize: "16px", color: "#e2e8f0", fontWeight: 600 }} className="mb-2">
          Preview not available
        </p>
        <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>
          <span style={{ color: "#94a3b8", fontWeight: 500 }}>{fileName}</span>
          {" "}can't be displayed in the browser. Download it to open locally.
        </p>
      </div>
      <div className="flex gap-3">
        {onDownload && (
          <button
            onClick={onDownload}
            className="px-6 py-3 rounded-xl transition-all hover:brightness-110 flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg, #0B7FFF 0%, #0960CC 100%)",
              color: "#fff", fontSize: "13px", fontWeight: 600,
              boxShadow: "0 4px 16px rgba(11,127,255,0.25)",
            }}
          >
            <Download size={15} /> Download File
          </button>
        )}
        <button
          onClick={onClose}
          className="px-6 py-3 rounded-xl transition-colors hover:bg-white/5"
          style={{ color: "#94a3b8", fontSize: "13px", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
