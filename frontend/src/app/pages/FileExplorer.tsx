import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  File,
  FileText,
  FileImage,
  FileArchive,
  FileVideo,
  ChevronRight,
  Home,
  Upload,
  Trash2,
  Pencil,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  MoveRight,
  CloudUpload,
  Loader2,
  Search,
  Grid2X2,
  List,
  FolderSymlink,
  AlertTriangle,
  Lock,
  LockOpen,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiListItems,
  apiCreateFolder,
  apiUploadFile,
  apiRenameItem,
  apiMoveItem,
  apiDeleteItem,
  type FSItem,
} from "../api/explorer";

// ─── Local types (FSItem is imported from ../api/explorer) ───────────────────

type SortField = "name" | "date" | "size";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grid";
type FileKind = "pdf" | "img" | "zip" | "video" | "doc" | "other";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fileIconMap: Record<FileKind, React.ElementType> = {
  pdf: FileText, img: FileImage, zip: FileArchive,
  video: FileVideo, doc: FileText, other: File,
};
const fileColorMap: Record<FileKind, string> = {
  pdf: "#F87171", img: "#34D399", zip: "#FBBF24",
  video: "#A78BFA", doc: "#60A5FA", other: "#94A3B8",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Breadcrumbs({
  path,
  items,
  onNavigate,
}: {
  path: string[];
  items: FSItem[];
  onNavigate: (id: string | null, newPath?: string[]) => void;
}) {
  const segments = path.map((id) => items.find((i) => i.id === id)?.name ?? id);
  return (
    <nav className="flex items-center gap-1 flex-wrap" aria-label="breadcrumb">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
        style={{ fontSize: "12px", color: path.length === 0 ? "#e2e8f0" : "#64748b" }}
      >
        <Home size={13} />
        <span>My Files</span>
      </button>
      {path.map((id, idx) => (
        <span key={id} className="flex items-center gap-1">
          <ChevronRight size={12} style={{ color: "#2a3550" }} />
          <button
            onClick={() => onNavigate(id, path.slice(0, idx + 1))}
            className="px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5 truncate max-w-[140px]"
            style={{
              fontSize: "12px",
              color: idx === path.length - 1 ? "#e2e8f0" : "#64748b",
              fontWeight: idx === path.length - 1 ? 600 : 400,
            }}
          >
            {segments[idx]}
          </button>
        </span>
      ))}
    </nav>
  );
}

function MoveModal({
  item,
  allItems,
  currentFolderId,
  onMove,
  onClose,
}: {
  item: FSItem;
  allItems: FSItem[];
  currentFolderId: string | null;
  onMove: (targetId: string | null) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const folders = allItems.filter(
    (i) => i.type === "folder" && i.id !== item.id
  );

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const children = folders.filter((f) => f.parentId === parentId);
    if (!children.length) return null;
    return children.map((f) => {
      const isExpanded = expanded.has(f.id);
      const hasChildren = folders.some((c) => c.parentId === f.id);
      const isSelected = selected === f.id;
      const isCurrent = f.id === currentFolderId;
      return (
        <div key={f.id}>
          <button
            onClick={() => {
              if (!isCurrent) setSelected(f.id);
              if (hasChildren) setExpanded((prev) => {
                const s = new Set(prev);
                s.has(f.id) ? s.delete(f.id) : s.add(f.id);
                return s;
              });
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left"
            style={{
              paddingLeft: `${12 + depth * 18}px`,
              background: isSelected ? "rgba(11,127,255,0.14)" : "transparent",
              opacity: isCurrent ? 0.4 : 1,
              cursor: isCurrent ? "not-allowed" : "pointer",
            }}
          >
            {hasChildren
              ? isExpanded
                ? <FolderOpen size={14} style={{ color: "#FBBF24", flexShrink: 0 }} />
                : <Folder size={14} style={{ color: "#FBBF24", flexShrink: 0 }} />
              : <Folder size={14} style={{ color: "#FBBF24", flexShrink: 0 }} />
            }
            <span style={{ fontSize: "13px", color: isSelected ? "#e2e8f0" : "#94a3b8" }} className="truncate">
              {f.name}
            </span>
            {isCurrent && <span style={{ fontSize: "10px", color: "#475569", marginLeft: "auto" }}>current</span>}
          </button>
          {isExpanded && renderTree(f.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[420px] rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0d1321 0%, #0b0f20 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(11,127,255,0.12)", border: "1px solid rgba(11,127,255,0.2)" }}
            >
              <FolderSymlink size={15} style={{ color: "#0B7FFF" }} />
            </div>
            <div>
              <p style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: 600 }}>Move to…</p>
              <p style={{ fontSize: "11px", color: "#475569" }} className="truncate max-w-[220px]">{item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
            <X size={15} style={{ color: "#6b7fa8" }} />
          </button>
        </div>

        {/* Tree */}
        <div className="px-3 py-3 max-h-[260px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(11,127,255,0.2) transparent" }}>
          {/* Root option */}
          <button
            onClick={() => setSelected("__root__")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left mb-1"
            style={{
              background: selected === "__root__" ? "rgba(11,127,255,0.14)" : "transparent",
              opacity: currentFolderId === null ? 0.4 : 1,
              cursor: currentFolderId === null ? "not-allowed" : "pointer",
            }}
          >
            <Home size={14} style={{ color: "#60A5FA", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: selected === "__root__" ? "#e2e8f0" : "#94a3b8" }}>My Files (root)</span>
            {currentFolderId === null && <span style={{ fontSize: "10px", color: "#475569", marginLeft: "auto" }}>current</span>}
          </button>
          {renderTree(null)}
          {folders.length === 0 && (
            <p className="text-center py-4" style={{ fontSize: "12px", color: "#475569" }}>No folders available</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] transition-colors hover:bg-white/5"
            style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Cancel
          </button>
          {(() => {
            const targetId = selected === "__root__" ? null : selected;
            const isAlreadyHere = selected ? targetId === item.parentId : false;
            const isSelf = selected ? item.type === "folder" && targetId === item.id : false;
            const isInvalidMove = !selected || isAlreadyHere || isSelf;

            let btnText = "Move Here";
            if (isAlreadyHere) btnText = "Already Here";
            else if (isSelf) btnText = "Invalid Move";

            return (
              <button
                disabled={isInvalidMove}
                onClick={() => selected && onMove(targetId)}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #0B7FFF 0%, #0960CC 100%)",
                  color: "#ffffff",
                  boxShadow: !isInvalidMove ? "0 4px 16px rgba(11,127,255,0.25)" : "none",
                }}
              >
                {btnText}
              </button>
            );
          })()}
        </div>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FileExplorer() {
  const [items, setItems] = useState<FSItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveItem, setMoveItem] = useState<FSItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [encrypt, setEncrypt] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // ── Load items from API when folder changes ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    apiListItems(currentFolderId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error("Failed to load files.");
      else setItems(data);
    });
    return () => { cancelled = true; };
  }, [currentFolderId]);

  // Focus rename / new folder inputs
  useEffect(() => {
    if (renamingId && renameInputRef.current) renameInputRef.current.select();
  }, [renamingId]);
  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) newFolderInputRef.current.focus();
  }, [creatingFolder]);

  // ── Derived items — API returns only current-level items, filter locally for search/sort
  const visibleItems = useMemo(() => {
    let list = [...items];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      // Folders first
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      let av: any, bv: any;
      if (sortField === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortField === "date") { av = a.dateTimestamp; bv = b.dateTimestamp; }
      else { av = a.size ?? 0; bv = b.size ?? 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, currentFolderId, searchQuery, sortField, sortDir]);

  // ── Navigation — path is built incrementally on click ────────────────────
  const navigateTo = useCallback((folderId: string | null, newPath?: string[]) => {
    if (folderId === null) {
      setFolderPath([]);
      setCurrentFolderId(null);
      setItems([]);
      return;
    }
    setFolderPath(newPath ?? [...folderPath, folderId]);
    setCurrentFolderId(folderId);
    setItems([]);
    setSearchQuery("");
  }, [folderPath]);

  const handleItemClick = (item: FSItem) => {
    if (item.type === "folder") navigateTo(item.id);
  };

  // ── Create Folder ──────────────────────────────────────────────────────────
  const confirmCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) { toast.error("Folder name cannot be empty."); return; }
    const { data, error } = await apiCreateFolder(name, currentFolderId);
    if (error === "NAME_CONFLICT") { toast.error(`A folder named "${name}" already exists here.`); return; }
    if (error || !data) { toast.error("Failed to create folder."); return; }
    setItems((prev) => [...prev, data]);
    setCreatingFolder(false);
    setNewFolderName("");
    toast.success(`Folder "${name}" created.`);
  };

  // ── Rename ─────────────────────────────────────────────────────────────────
  const startRename = (item: FSItem) => {
    setRenamingId(item.id);
    setRenameValue(item.name);
    setOpenMenu(null);
  };
  const confirmRename = async () => {
    const name = renameValue.trim();
    if (!name || !renamingId) { setRenamingId(null); return; }
    const { data, error } = await apiRenameItem(renamingId, name);
    if (error === "NAME_CONFLICT") { toast.error(`An item named "${name}" already exists.`); return; }
    if (error || !data) { toast.error("Failed to rename."); return; }
    setItems((prev) => prev.map((i) => i.id === renamingId ? data : i));
    setRenamingId(null);
    toast.success(`Renamed to "${name}".`);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteItem = async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const { ok, error } = await apiDeleteItem(itemId);
    if (!ok) { toast.error(error ?? "Failed to delete."); return; }
    // Remove item (and any locally cached children) from state
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setDeleteConfirmId(null);
    setOpenMenu(null);
    toast.success(`"${item.name}" deleted.`);
  };

  // ── Move ───────────────────────────────────────────────────────────────────
  const handleMove = async (targetFolderId: string | null) => {
    if (!moveItem) return;
    if (targetFolderId === moveItem.parentId) {
      setMoveItem(null);
      return; // No-op
    }
    const { data, error } = await apiMoveItem(moveItem.id, targetFolderId);
    if (error === "CIRCULAR_MOVE") { toast.error("Cannot move a folder into itself."); return; }
    if (error || !data) { toast.error(error ?? "Failed to move."); return; }
    // Remove from current view (item now lives in a different folder)
    setItems((prev) => prev.filter((i) => i.id !== moveItem.id));
    setMoveItem(null);
    toast.success(`"${moveItem.name}" moved successfully.`);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUploadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const uploaded: FSItem[] = [];
    for (const file of Array.from(fileList)) {
      const { data, error } = await apiUploadFile(file, currentFolderId, encrypt);
      if (error || !data) { toast.error(`Failed to upload "${file.name}".`); }
      else uploaded.push(data);
    }
    if (uploaded.length > 0) {
      setItems((prev) => [...prev, ...uploaded]);
      toast.success(uploaded.length === 1 ? `"${uploaded[0].name}" uploaded.` : `${uploaded.length} files uploaded.`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [currentFolderId, encrypt]);

  // ── Drag-over drop zone ────────────────────────────────────────────────────
  const onZoneDragOver = (e: React.DragEvent) => {
    if (draggingId) {
      const draggingItem = items.find((i) => i.id === draggingId);
      if (draggingItem && draggingItem.parentId === currentFolderId) return; // Already in this folder
    }
    e.preventDefault();
    setIsDragOver(true);
  };
  const onZoneDragLeave = () => setIsDragOver(false);
  const onZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) { handleUploadFiles(e.dataTransfer.files); return; }
    // Item drag-and-drop
    const id = e.dataTransfer.getData("itemId");
    if (id) {
      const item = items.find((i) => i.id === id);
      if (item) {
        setMoveItem(item);
        // Defer handleMove so moveItem state is set if we were to use it, but actually we can just call API directly here
        // However, we need the Move logic. Let's just do it directly:
        if (currentFolderId === item.parentId) return; // No-op
        apiMoveItem(item.id, currentFolderId).then(({ data, error }) => {
          if (error === "CIRCULAR_MOVE") { toast.error("Cannot move a folder into itself."); }
          else if (error || !data) { toast.error(error ?? "Failed to move."); }
          else {
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            toast.success(`"${item.name}" moved successfully.`);
          }
        });
      }
    }
  };

  // ── Item drag ──────────────────────────────────────────────────────────────
  const onItemDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("itemId", id);
    setDraggingId(id);
  };
  const onItemDragEnd = () => { setDraggingId(null); setDropTargetId(null); };
  const onFolderDragOver = (e: React.DragEvent, folderId: string) => {
    if (draggingId === folderId) return; // Cannot drop on itself
    const draggingItem = items.find((i) => i.id === draggingId);
    if (draggingItem && draggingItem.parentId === folderId) return; // Already in this folder
    
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(folderId);
  };
  const onFolderDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault(); e.stopPropagation();
    setDropTargetId(null);
    const id = e.dataTransfer.getData("itemId");
    if (!id || id === targetFolderId) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (targetFolderId === item.parentId) return; // No-op
    
    const { data, error } = await apiMoveItem(item.id, targetFolderId);
    if (error) { toast.error(error === "CIRCULAR_MOVE" ? "Cannot move a folder into itself." : "Move failed."); return; }
    if (data) setItems((prev) => prev.filter((i) => i.id !== item.id));
    toast.success(`"${item.name}" moved into folder.`);
  };

  // ── Sort toggle ────────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    setShowSortMenu(false);
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField !== field
      ? <ArrowUpDown size={11} style={{ color: "#475569" }} />
      : sortDir === "asc"
        ? <ArrowUp size={11} style={{ color: "#0B7FFF" }} />
        : <ArrowDown size={11} style={{ color: "#0B7FFF" }} />;

  const folderCount = visibleItems.filter((i) => i.type === "folder").length;
  const fileCount = visibleItems.filter((i) => i.type === "file").length;

  // ── Item row renderer ──────────────────────────────────────────────────────
  const renderItemRow = (item: FSItem) => {
    const isFolder = item.type === "folder";
    const kind = (item.fileKind ?? "other") as FileKind;
    const FileIcon = isFolder ? Folder : (fileIconMap[kind] ?? File);
    const iconColor = isFolder ? "#FBBF24" : (fileColorMap[kind] ?? "#94A3B8");
    const isRenaming = renamingId === item.id;
    const isDragging = draggingId === item.id;
    const isDropTarget = dropTargetId === item.id;
    const isDeleteConfirm = deleteConfirmId === item.id;

    if (viewMode === "grid") {
      return (
        <div
          key={item.id}
          draggable
          onDragStart={(e) => onItemDragStart(e, item.id)}
          onDragEnd={onItemDragEnd}
          onDragOver={isFolder ? (e) => onFolderDragOver(e, item.id) : undefined}
          onDragLeave={isFolder ? () => setDropTargetId(null) : undefined}
          onDrop={isFolder ? (e) => onFolderDrop(e, item.id) : undefined}
          className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:bg-white/[0.04]"
          style={{
            border: isDropTarget ? `1px solid ${iconColor}66` : "1px solid rgba(255,255,255,0.05)",
            background: isDragging ? "rgba(11,127,255,0.07)" : isDropTarget ? `${iconColor}0d` : "rgba(255,255,255,0.015)",
            opacity: isDragging ? 0.5 : 1,
          }}
          onClick={() => !isRenaming && handleItemClick(item)}
          onDoubleClick={() => isFolder && navigateTo(item.id)}
        >
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105"
            style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}28` }}
          >
            {isFolder
              ? isDropTarget
                ? <FolderOpen size={26} style={{ color: iconColor }} strokeWidth={1.5} />
                : <Folder size={26} style={{ color: iconColor }} strokeWidth={1.5} />
              : <FileIcon size={26} style={{ color: iconColor }} strokeWidth={1.5} />
            }
          </div>

          {/* Name */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null); }}
              onBlur={confirmRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-center text-[12px] rounded px-1 py-0.5 outline-none"
              style={{ background: "rgba(11,127,255,0.15)", border: "1px solid rgba(11,127,255,0.4)", color: "#e2e8f0" }}
            />
          ) : (
            <p className="text-center text-[12px] font-medium truncate w-full px-1" style={{ color: "#cbd5e1" }}>
              {item.name}
            </p>
          )}
          <p className="text-[10px]" style={{ color: "#3d4f6e" }}>{item.sizeLabel ?? "—"}</p>

          {/* Menu button */}
          <button
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === item.id ? null : item.id); }}
          >
            <MoreHorizontal size={13} style={{ color: "#64748b" }} />
          </button>

          {openMenu === item.id && <ItemMenu item={item} onClose={() => setOpenMenu(null)} isAbsolute />}
        </div>
      );
    }

    // List row
    return (
      <div
        key={item.id}
        draggable
        onDragStart={(e) => onItemDragStart(e, item.id)}
        onDragEnd={onItemDragEnd}
        onDragOver={isFolder ? (e) => onFolderDragOver(e, item.id) : undefined}
        onDragLeave={isFolder ? () => setDropTargetId(null) : undefined}
        onDrop={isFolder ? (e) => onFolderDrop(e, item.id) : undefined}
        className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3.5 transition-all duration-150 hover:bg-white/[0.025] relative cursor-pointer"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: isDragging ? "rgba(11,127,255,0.06)" : isDropTarget ? `${iconColor}0a` : "transparent",
          opacity: isDragging ? 0.5 : 1,
          outline: isDropTarget ? `1px dashed ${iconColor}66` : "none",
          borderRadius: isDropTarget ? "8px" : undefined,
        }}
        onClick={() => !isRenaming && !isDeleteConfirm && handleItemClick(item)}
        onDoubleClick={() => isFolder && navigateTo(item.id)}
      >
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
          style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}28` }}
        >
          {isFolder
            ? isDropTarget
              ? <FolderOpen size={16} style={{ color: iconColor }} strokeWidth={1.8} />
              : <Folder size={16} style={{ color: iconColor }} strokeWidth={1.8} />
            : <FileIcon size={16} style={{ color: iconColor }} strokeWidth={1.8} />
          }
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null); }}
              onBlur={confirmRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-[13px] rounded-lg px-2 py-1 outline-none"
              style={{ background: "rgba(11,127,255,0.15)", border: "1px solid rgba(11,127,255,0.4)", color: "#e2e8f0" }}
            />
          ) : (
            <p className="text-[13px] font-medium truncate" style={{ color: "#cbd5e1" }}>{item.name}</p>
          )}
        </div>

        {/* Size — desktop */}
        <div className="hidden sm:block w-[90px] shrink-0">
          <p style={{ fontSize: "12px", color: "#3d4f6e" }}>{item.sizeLabel ?? "—"}</p>
        </div>

        {/* Date — desktop */}
        <div className="hidden md:block w-[120px] shrink-0">
          <p style={{ fontSize: "12px", color: "#3d4f6e" }}>{item.createdAt}</p>
        </div>

        {/* Delete confirm inline */}
        {isDeleteConfirm ? (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: "11px", color: "#F87171" }}>Delete?</span>
            <button
              onClick={() => deleteItem(item.id)}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <Check size={13} style={{ color: "#F87171" }} />
            </button>
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={13} style={{ color: "#64748b" }} />
            </button>
          </div>
        ) : (
          /* Row actions */
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              title="Rename"
              onClick={() => startRename(item)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            >
              <Pencil size={13} style={{ color: "#64748b" }} />
            </button>
            <button
              title="Move"
              onClick={() => setMoveItem(item)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            >
              <MoveRight size={13} style={{ color: "#64748b" }} />
            </button>
            <button
              title="Delete"
              onClick={() => setDeleteConfirmId(item.id)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} style={{ color: "#F87171" }} />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Inline menu component ─────────────────────────────────────────────────
  const ItemMenu = ({ item, onClose, isAbsolute }: { item: FSItem; onClose: () => void; isAbsolute?: boolean }) => (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={`${isAbsolute ? "absolute" : "absolute right-0 top-8"} z-50 rounded-xl overflow-hidden min-w-[150px]`}
        style={{
          top: isAbsolute ? "2rem" : undefined,
          right: isAbsolute ? "0" : undefined,
          background: "#131929",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {[
          { icon: Pencil, label: "Rename", color: "#94a3b8", action: () => startRename(item) },
          { icon: MoveRight, label: "Move to…", color: "#94a3b8", action: () => { setMoveItem(item); onClose(); } },
          { icon: Trash2, label: "Delete", color: "#F87171", action: () => { setDeleteConfirmId(item.id); onClose(); } },
        ].map(({ icon: Icon, label, color, action }) => (
          <button
            key={label}
            onClick={() => { action(); onClose(); }}
            className="w-full text-left px-4 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
            style={{ fontSize: "13px", color }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 sm:gap-5 pb-6">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 style={{ fontSize: "20px", color: "#e2e8f0", fontWeight: 700, letterSpacing: "-0.01em" }}>
            File Explorer
          </h1>
          <p style={{ fontSize: "12px", color: "#3d4f6e", marginTop: "2px" }}>
            {folderCount} folder{folderCount !== 1 ? "s" : ""} · {fileCount} file{fileCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #0B7FFF 0%, #0960CC 100%)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(11,127,255,0.25)",
            }}
          >
            {uploading
              ? <Loader2 size={14} className="animate-spin" />
              : <Upload size={14} />
            }
            Upload
          </button>
          {/* New Folder button */}
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors hover:bg-white/5"
            style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <FolderPlus size={14} />
            New Folder
          </button>
        </div>
      </div>

      {/* ── Breadcrumbs + Toolbar ─────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 rounded-xl"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Breadcrumbs path={folderPath} items={items} onNavigate={navigateTo} />

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#3d4f6e" }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-7 pr-3 rounded-lg text-[12px] text-white placeholder:text-slate-700 outline-none transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", width: "150px" }}
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery("")}>
                <X size={11} style={{ color: "#475569" }} />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg transition-colors hover:bg-white/5"
              style={{
                fontSize: "12px",
                color: "#64748b",
                border: "1px solid rgba(255,255,255,0.07)",
                background: showSortMenu ? "rgba(255,255,255,0.04)" : "transparent",
              }}
            >
              <ArrowUpDown size={12} />
              <span className="hidden sm:inline capitalize">{sortField}</span>
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div
                  className="absolute right-0 top-10 rounded-xl overflow-hidden z-50 min-w-[140px]"
                  style={{ background: "#131929", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}
                >
                  {(["name", "date", "size"] as SortField[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => handleSort(f)}
                      className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-white/5 transition-colors"
                      style={{ fontSize: "13px", color: sortField === f ? "#0B7FFF" : "#94a3b8" }}
                    >
                      <span className="capitalize">{f}</span>
                      <SortIcon field={f} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* View toggle */}
          <div
            className="flex items-center rounded-lg overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {(["list", "grid"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="w-8 h-8 flex items-center justify-center transition-colors"
                style={{
                  background: viewMode === mode ? "rgba(11,127,255,0.15)" : "transparent",
                  color: viewMode === mode ? "#0B7FFF" : "#475569",
                }}
              >
                {mode === "list" ? <List size={13} /> : <Grid2X2 size={13} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upload Zone ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Encryption toggle */}
        <button
          type="button"
          onClick={() => setEncrypt((prev) => !prev)}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl w-full transition-all duration-300"
          style={{
            background: encrypt ? "rgba(0,229,160,0.07)" : "rgba(251,191,36,0.07)",
            border: encrypt ? "1px solid rgba(0,229,160,0.25)" : "1px solid rgba(251,191,36,0.3)",
          }}
        >
          {/* Icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300"
            style={{
              background: encrypt ? "rgba(0,229,160,0.15)" : "rgba(251,191,36,0.15)",
            }}
          >
            {encrypt
              ? <Lock size={15} style={{ color: "#00E5A0" }} strokeWidth={2} />
              : <LockOpen size={15} style={{ color: "#FBBF24" }} strokeWidth={2} />
            }
          </div>

          {/* Label */}
          <div className="flex-1 text-left min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: encrypt ? "#00E5A0" : "#FBBF24" }}>
              {encrypt ? "AES-256-GCM Encryption" : "No Encryption"}
            </p>
            <p className="text-[10.5px]" style={{ color: "#475569" }}>
              {encrypt
                ? "File will be encrypted at rest"
                : "File stored as-is — not recommended for sensitive data"}
            </p>
          </div>

          {/* Pill toggle */}
          <div
            className="relative shrink-0 transition-all duration-300"
            style={{
              width: "38px",
              height: "22px",
              borderRadius: "11px",
              background: encrypt ? "#00E5A0" : "rgba(255,255,255,0.12)",
              boxShadow: encrypt ? "0 0 10px rgba(0,229,160,0.4)" : "none",
            }}
          >
            <div
              className="absolute top-[3px] transition-all duration-300 rounded-full"
              style={{
                width: "16px",
                height: "16px",
                background: "white",
                left: encrypt ? "19px" : "3px",
              }}
            />
          </div>
        </button>

        {/* Drop zone */}
        <div
          onDragOver={onZoneDragOver}
          onDragLeave={onZoneDragLeave}
          onDrop={onZoneDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="relative w-full rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group"
          style={{
            minHeight: "140px",
            border: isDragOver ? "1.5px dashed #00d2ff" : "1.5px dashed rgba(255,255,255,0.12)",
            background: isDragOver ? "rgba(0,210,255,0.07)" : uploading ? "rgba(0,210,255,0.03)" : "rgba(255,255,255,0.02)",
            boxShadow: isDragOver ? "0 0 30px rgba(0,210,255,0.12)" : "none",
            cursor: uploading ? "not-allowed" : "pointer",
          }}
        >
          <div
            className="absolute inset-0 rounded-2xl opacity-20 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(0,210,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.08) 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative flex flex-col items-center gap-2 sm:gap-3 py-2 px-4">
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-105"
              style={{
                background: isDragOver ? "rgba(0,210,255,0.25)" : uploading ? "rgba(0,210,255,0.18)" : "rgba(0,210,255,0.12)",
                border: "1px solid rgba(0,210,255,0.25)",
              }}
            >
              {uploading
                ? <Loader2 size={24} className="animate-spin sm:w-[26px] sm:h-[26px]" style={{ color: "#3D9FFF" }} />
                : <CloudUpload size={24} className="sm:w-[26px] sm:h-[26px]" style={{ color: "#00d2ff" }} strokeWidth={1.5} />
              }
            </div>

            <div className="text-center">
              {uploading ? (
                <p className="text-sm sm:text-[15px]" style={{ color: "#cbd5e1", fontWeight: 600 }}>Uploading…</p>
              ) : (
                <p className="text-sm sm:text-[15px]" style={{ color: "#cbd5e1", fontWeight: 600 }}>
                  <span className="hidden sm:inline">Drag &amp; drop files here, or </span>
                  <span style={{ color: "#00d2ff" }} className="hover:underline cursor-pointer">
                    <span className="sm:hidden">Tap to </span>
                    <span className="hidden sm:inline">click to </span>browse
                  </span>
                </p>
              )}
              <p className="text-[11px] sm:text-[12.5px] mt-1" style={{ color: "#475569" }}>
                Upload files directly to the current folder
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-1">
              {encrypt ? (
                [
                  { label: "AES-256", full: "AES-256 Encrypted" },
                  { label: "Zero-Knowledge", full: "Zero-Knowledge" },
                  { label: "SOC 2", full: "SOC 2 Compliant" },
                ].map((badge) => (
                  <div key={badge.label} className="flex items-center gap-1.5">
                    <ShieldCheck size={11} style={{ color: "#00E5A0" }} />
                    <span className="text-[10px] sm:text-[11px]" style={{ color: "#475569", fontWeight: 500 }}>
                      <span className="sm:hidden">{badge.label}</span>
                      <span className="hidden sm:inline">{badge.full}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5">
                  <ShieldOff size={11} style={{ color: "#FBBF24" }} />
                  <span className="text-[10px] sm:text-[11px]" style={{ color: "#FBBF24", fontWeight: 600 }}>
                    Encryption disabled
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Panel ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden relative"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        onDragOver={onZoneDragOver}
        onDragLeave={onZoneDragLeave}
        onDrop={onZoneDrop}
      >
        {/* Drop overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl pointer-events-none"
            style={{
              background: "rgba(0,210,255,0.06)",
              border: "2px dashed rgba(0,210,255,0.4)",
              backdropFilter: "blur(2px)",
            }}
          >
            <CloudUpload size={40} style={{ color: "#00d2ff" }} strokeWidth={1.2} />
            <p className="mt-3 text-[14px] font-semibold" style={{ color: "#00d2ff" }}>
              Drop to upload
            </p>
          </div>
        )}

        {/* New folder row */}
        {creatingFolder && (
          <div
            className="flex items-center gap-3 px-4 sm:px-5 py-3.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(11,127,255,0.05)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.25)" }}
            >
              <FolderPlus size={16} style={{ color: "#FBBF24" }} strokeWidth={1.8} />
            </div>
            <input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name…"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCreateFolder();
                if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
              }}
              className="flex-1 text-[13px] rounded-lg px-3 py-1.5 outline-none"
              style={{ background: "rgba(11,127,255,0.1)", border: "1px solid rgba(11,127,255,0.3)", color: "#e2e8f0" }}
            />
            <button
              onClick={confirmCreateFolder}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.2)" }}
            >
              <Check size={14} style={{ color: "#00E5A0" }} />
            </button>
            <button
              onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
            >
              <X size={14} style={{ color: "#64748b" }} />
            </button>
          </div>
        )}

        {/* Column headers — list mode */}
        {viewMode === "list" && (
          <div
            className="hidden sm:grid px-5 py-2.5"
            style={{
              gridTemplateColumns: "1fr 90px 120px 80px",
              background: "rgba(0,0,0,0.2)",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {[
              { label: "Name", field: "name" as SortField },
              { label: "Size", field: "size" as SortField },
              { label: "Date", field: "date" as SortField },
              { label: "", field: null },
            ].map(({ label, field }) => (
              <button
                key={label}
                onClick={field ? () => handleSort(field) : undefined}
                disabled={!field}
                className="flex items-center gap-1.5 text-left transition-colors disabled:cursor-default"
                style={{
                  fontSize: "10.5px",
                  color: field && sortField === field ? "#0B7FFF" : "#3d4f6e",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: field ? "pointer" : "default",
                }}
              >
                {label.toUpperCase()}
                {field && <SortIcon field={field} />}
              </button>
            ))}
          </div>
        )}

        {/* Items */}
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Folder size={28} style={{ color: "#2a3550" }} strokeWidth={1.2} />
            </div>
            <p style={{ fontSize: "14px", color: "#3d4f6e", fontWeight: 600 }}>
              {searchQuery ? "No results found" : "This folder is empty"}
            </p>
            <p style={{ fontSize: "12px", color: "#2a3550" }}>
              {searchQuery ? "Try a different search term" : "Upload files or create a folder to get started"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4">
            {visibleItems.map(renderItemRow)}
          </div>
        ) : (
          <div>{visibleItems.map(renderItemRow)}</div>
        )}
      </div>

      {/* (Drop-zone hint removed from here) */}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUploadFiles(e.target.files)} />

      {/* ── Move Modal ────────────────────────────────────────────────────── */}
      {moveItem && (
        <MoveModal
          item={moveItem}
          allItems={items}
          currentFolderId={currentFolderId}
          onMove={handleMove}
          onClose={() => setMoveItem(null)}
        />
      )}

      {/* ── Delete confirmation alert (outside-list fallback) ─────────────── */}
      {deleteConfirmId && !visibleItems.find((i) => i.id === deleteConfirmId) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div
            className="w-[90vw] max-w-[380px] rounded-2xl p-6"
            style={{ background: "#0d1321", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.2)" }}>
                <AlertTriangle size={18} style={{ color: "#F87171" }} />
              </div>
              <p style={{ fontSize: "15px", color: "#e2e8f0", fontWeight: 600 }}>Confirm Delete</p>
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "20px" }}>
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2 rounded-xl text-[13px] transition-colors hover:bg-white/5" style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}>Cancel</button>
              <button onClick={() => deleteItem(deleteConfirmId)} className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg, #F87171 0%, #DC2626 100%)", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
