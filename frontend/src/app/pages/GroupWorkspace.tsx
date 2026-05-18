import { useState, useEffect, useRef } from "react"
import { useAuth } from "../hooks/useAuth"
import { toast } from "sonner"
import {
  Users, Upload, Download, FileCheck, Loader2,
  FolderOpen, ChevronDown, Search, Eye, Lock,
  Plus, ArrowLeft, Folder, LayoutGrid, List,
  Unlock, Trash2, History, RotateCcw, Pencil, X, Check,
  MoveRight, FileQuestion, ChevronRight, MoreHorizontal, Home, ArrowUpDown, ArrowUp, ArrowDown,
  SquarePen, Shield
} from "lucide-react"

const isEditableText = (name: string, fileType: string | null) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return fileType === "doc" || ["txt", "md", "csv", "json", "xml", "yaml", "yml", "toml", "ini", "log", "sh", "py", "js", "ts", "tsx", "jsx", "html", "css"].includes(ext);
};
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog"
import { format } from "date-fns"
import {
  fetchGroups, fetchGroupMembers, fetchGroupTransfers, uploadGroupTransfer,
  createGroupFolder, renameGroupItem, moveGroupItem, lockGroupItem, unlockGroupItem,
  fetchItemVersions, restoreItemVersion, uploadGroupVersion,
  type Group, type GroupMember, type FileVersion
} from "../api/groups"
import { EncryptionChoiceModal } from "../components/EncryptionChoiceModal"
import { FileViewer } from "../components/ui/FileViewer"
import { AclModal } from "../components/ui/AclModal"

type Tab = "files" | "members"

interface GT {
  id: string
  groupId: string
  fileName: string
  fileType: string
  recipient: string
  size: string
  sizeBytes: number
  status: string
  date: string
  dateTimestamp: number
  encryptionType: string
  isEncrypted: boolean
  downloadCount: number
  expiryDate: string
  uploadedBy: string
  isLocked: boolean
  lockedByEmail: string | null
  currentVersion: number
  revokedAt: string | null
  sentAt: string | null
  parentId: string | null
  itemType: "file" | "folder"
}

function splitName(filename: string): { name: string; ext: string } {
  const dotIdx = filename.lastIndexOf(".")
  if (dotIdx === -1) return { name: filename, ext: "" }
  return { name: filename.slice(0, dotIdx), ext: filename.slice(dotIdx) }
}

function findUniqueName(name: string, ext: string, list: GT[]): string {
  let counter = 1
  let newName = `${name} (${counter})${ext}`
  while (list.some(t => t.fileName.toLowerCase() === newName.toLowerCase())) {
    counter++
    newName = `${name} (${counter})${ext}`
  }
  return newName
}

export function GroupWorkspace() {
  const { user, isAppAdmin } = useAuth()

  const [groups, setGroups]           = useState<Group[]>([])
  const [selectedGroup, setSelected]  = useState<Group | null>(null)
  const [showGroupPicker, setShowPicker] = useState(false)
  const [tab, setTab]                 = useState<Tab>("files")
  const [isLoadingGroups, setLoadingGroups] = useState(true)

  const [transfers, setTransfers]     = useState<GT[]>([])
  const [isLoadingFiles, setLoadingFiles] = useState(false)
  const [transfersDisabled, setTransfersDisabled] = useState(false)

  const [members, setMembers]         = useState<GroupMember[]>([])
  const [isLoadingMembers, setLoadingMembers] = useState(false)
  const [membersDisabled, setMembersDisabled] = useState(false)

  const [searchTerm, setSearchTerm]   = useState("")
  const [isUploading, setIsUploading] = useState(false)

  // ── Explorer state ──────────────────────────────────────────────────────────
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const renameRef = useRef<HTMLInputElement>(null)
  
  type SortField = "name" | "date" | "size"
  type SortDir = "asc" | "desc"
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  
  // Folder Creation
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  
  // Moving
  const [moveItem, setMoveItem] = useState<GT | null>(null)

  // Deleting
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Lock toggling
  const [togglingLockId, setTogglingLockId] = useState<string | null>(null)

  // Versioning (Details dialog)
  const [detailsFile, setDetailsFile] = useState<GT | null>(null)
  const [versions, setVersions] = useState<FileVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [restoringVer, setRestoringVer] = useState<number | null>(null)
  const [isUploadingVersion, setIsUploadingVersion] = useState(false)
  const versionInputRef = useRef<HTMLInputElement>(null)

  // Conflict (Option B)
  const [conflict, setConflict] = useState<{ file: File; name: string } | null>(null)

  // Pending upload waiting for encryption choice
  const [pendingUpload, setPendingUpload] = useState<{ file: File; name: string } | null>(null)

  const [previewFile, setPreviewFile] = useState<GT | null>(null)
  const [previewEditMode, setPreviewEditMode] = useState(false)
  const [aclItem, setAclItem] = useState<GT | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load groups on mount
  useEffect(() => {
    fetchGroups().then(res => {
      if (!res.error) {
        setGroups(res.data)
        if (res.data.length === 1) setSelected(res.data[0])
      }
      setLoadingGroups(false)
    })
  }, [])

  const loadAllItems = async () => {
    if (!selectedGroup) return
    setLoadingFiles(true)
    const res = await fetchGroupTransfers(selectedGroup.id)
    if (res.error === "GROUP_TRANSFERS_DISABLED") {
      setTransfersDisabled(true)
    } else if (!res.error) {
      setTransfers(res.data as GT[])
      setTransfersDisabled(false)
    } else {
      toast.error("Failed to load group files.")
    }
    setLoadingFiles(false)
  }

  // Load files when group or tab changes
  useEffect(() => {
    if (!selectedGroup || tab !== "files") return
    setCurrentFolderId(null)
    loadAllItems()
  }, [selectedGroup, tab])

  // Load members when group or tab changes
  useEffect(() => {
    if (!selectedGroup || tab !== "members") return
    setMembers([])
    setLoadingMembers(true)
    setMembersDisabled(false)
    fetchGroupMembers(selectedGroup.id).then(res => {
      if (res.error === "FORBIDDEN") {
        setMembersDisabled(true)
      } else if (!res.error) {
        setMembers(res.data)
      } else {
        toast.error("Failed to load members.")
      }
      setLoadingMembers(false)
    })
  }, [selectedGroup, tab])

  // Breadcrumbs calculation
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "Root Workspace" }]
    let currentId = currentFolderId
    const pathList: { id: string | null; name: string }[] = []

    while (currentId) {
      const folder = transfers.find(t => t.id === currentId && t.itemType === "folder")
      if (!folder) break
      pathList.unshift({ id: folder.id, name: folder.fileName })
      currentId = folder.parentId
    }
    return [...crumbs, ...pathList]
  }

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renamingId])

  // ── Helper state & styling ───────────────────────────────────────────────────
  const visible = transfers.filter(t => t.parentId === currentFolderId)

  const filteredTransfers = transfers.filter(t => {
    const matchesSearch = t.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.uploadedBy.toLowerCase().includes(searchTerm.toLowerCase())
    if (searchTerm) {
      return matchesSearch
    }
    return t.parentId === currentFolderId && matchesSearch
  }).sort((a, b) => {
    if (a.itemType !== b.itemType) return a.itemType === "folder" ? -1 : 1;
    let av: any, bv: any;
    if (sortField === "name") { av = a.fileName.toLowerCase(); bv = b.fileName.toLowerCase(); }
    else if (sortField === "date") { av = a.dateTimestamp; bv = b.dateTimestamp; }
    else { av = a.sizeBytes ?? 0; bv = b.sizeBytes ?? 0; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const filteredMembers = members.filter(m =>
    m.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const fileColor = (item: GT) => {
    if (item.itemType === "folder") return "#FBBF24"
    const ext = item.fileType.toLowerCase()
    if (ext === "pdf") return "#ef4444"
    if (ext === "zip") return "#a855f7"
    if (ext === "img") return "#10b981"
    if (ext === "video") return "#f59e0b"
    return "#64748b"
  }

  const FileIcon = ({ item, size = 16 }: { item: GT; size?: number }) => {
    if (item.itemType === "folder") return <Folder size={size} style={{ color: "#FBBF24" }} />
    const ext = item.fileType.toLowerCase()
    if (ext === "pdf") return <FileCheck size={size} style={{ color: "#ef4444" }} />
    if (ext === "zip") return <FileCheck size={size} style={{ color: "#a855f7" }} />
    if (ext === "img") return <FileCheck size={size} style={{ color: "#10b981" }} />
    return <FileCheck size={size} style={{ color: "#64748b" }} />
  }

  const isBlockedByLock = (item: GT) => {
    return item.isLocked && item.lockedByEmail !== user?.email
  }

  const canManageAcl = (item: GT): boolean => {
    if (!user) return false
    if (user.role === "admin") return true
    const myMember = members.find(m => m.userId === user.id)
    if (myMember?.role === "admin") return true
    if (item.uploadedBy === user.email) return true
    return true
  }

  const canWrite = (item: GT) =>
    user?.role === "admin" ||
    item.uploadedBy === user?.email ||
    members.find(m => m.userId === user?.id)?.role === "admin"

  const canDelete = (item: GT) => canWrite(item)

  const canUploadHere = (): boolean => {
    if (!user || transfersDisabled) return false
    if (user.role === "admin") return true
    const myMember = members.find(m => m.userId === user.id)
    if (myMember?.role === "admin") return true
    if (!currentFolderId) return true
    const folder = transfers.find(t => t.id === currentFolderId)
    if (!folder) return true
    return folder.uploadedBy === user.email
  }

  const LockBadge = ({ item, myEmail, onToggle }: { item: GT; myEmail: string; onToggle: (item: GT) => void }) => {
    if (item.itemType === "folder") return null
    if (!item.isLocked) {
      return (
        <button
          onClick={e => { e.stopPropagation(); onToggle(item) }}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all shrink-0"
          title="Lock file"
        >
          <Unlock size={12} style={{ color: "#64748b" }} />
        </button>
      )
    }
    const mine = item.lockedByEmail === myEmail
    return (
      <button
        onClick={e => { e.stopPropagation(); onToggle(item) }}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-all hover:opacity-85 shrink-0"
        style={{
          color: mine ? "#00d2ff" : "#ef4444",
          background: mine ? "rgba(0,210,255,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${mine ? "rgba(0,210,255,0.2)" : "rgba(239,68,68,0.2)"}`
        }}
        title={mine ? "Locked by you (Click to unlock)" : `Locked by ${item.lockedByEmail}`}
      >
        <Lock size={9} />
        <span>LOCKED</span>
      </button>
    )
  }

  // Circular check
  const _isInsideFolder = (targetId: string, folderId: string): boolean => {
    const visited = new Set<string>()
    let currentId: string | null = targetId
    while (currentId) {
      if (visited.has(currentId)) break
      if (currentId === folderId) return true
      visited.add(currentId)
      const t = transfers.find(item => item.id === currentId)
      if (!t) break
      currentId = t.parentId
    }
    return false
  }

  // ── Operations ──────────────────────────────────────────────────────────────

  const handleLockToggle = async (item: GT) => {
    if (!selectedGroup || togglingLockId) return
    setTogglingLockId(item.id)
    try {
      if (item.isLocked) {
        if (item.lockedByEmail !== user?.email && user?.role !== "admin") {
          toast.error("You cannot unlock a file locked by another user.")
          return
        }
        const res = await unlockGroupItem(selectedGroup.id, item.id)
        if (!res.error) {
          toast.success("File unlocked successfully.")
          setTransfers(prev => prev.map(t => t.id === item.id ? { ...t, isLocked: false, lockedByEmail: null } : t))
          if (detailsFile?.id === item.id) {
            setDetailsFile(prev => prev ? { ...prev, isLocked: false, lockedByEmail: null } : null)
          }
        } else {
          toast.error(res.error)
        }
      } else {
        const res = await lockGroupItem(selectedGroup.id, item.id)
        if (res.ok) {
          toast.success("File locked successfully (15m inactivity buffer).")
          setTransfers(prev => prev.map(t => t.id === item.id ? { ...t, isLocked: true, lockedByEmail: user?.email ?? null } : t))
          if (detailsFile?.id === item.id) {
            setDetailsFile(prev => prev ? { ...prev, isLocked: true, lockedByEmail: user?.email ?? null } : null)
          }
        } else {
          toast.error(res.error === "FILE_LOCKED" ? `Locked by ${res.lockedBy}` : res.error)
        }
      }
    } catch {
      toast.error("Lock toggling failed.")
    } finally {
      setTogglingLockId(null)
    }
  }

  // Versioning fetch
  useEffect(() => {
    if (!detailsFile || detailsFile.itemType === "folder") {
      setVersions([])
      return
    }
    setLoadingVersions(true)
    fetchItemVersions(selectedGroup!.id, detailsFile.id).then(res => {
      if (!res.error) {
        setVersions(res.data)
      } else {
        toast.error("Failed to load version history.")
      }
      setLoadingVersions(false)
    })
  }, [detailsFile, selectedGroup])

  const handleRestore = async (versionNum: number) => {
    if (!selectedGroup || !detailsFile) return
    setRestoringVer(versionNum)
    const res = await restoreItemVersion(selectedGroup.id, detailsFile.id, versionNum)
    if (!res.error) {
      toast.success(`Restored to Version ${versionNum}.`)
      const updated = res.data as GT
      setTransfers(prev => prev.map(t => t.id === updated.id ? updated : t))
      setDetailsFile(updated)
    } else {
      toast.error(res.error === "FILE_LOCKED" ? `Cannot restore: Locked by ${res.lockedBy}.` : res.error)
    }
    setRestoringVer(null)
  }

  const handleVersionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedGroup || !detailsFile) return
    setIsUploadingVersion(true)
    const res = await uploadGroupVersion(selectedGroup.id, detailsFile.id, file)
    if (res.ok) {
      toast.success(`Uploaded Version ${res.transfer!.currentVersion}.`)
      const updated = res.transfer as GT
      setTransfers(prev => prev.map(t => t.id === updated.id ? updated : t))
      setDetailsFile(updated)
    } else {
      toast.error(res.error === "FILE_LOCKED" ? `Cannot upload version: Locked by ${res.lockedBy}.` : res.error)
    }
    setIsUploadingVersion(false)
    e.target.value = ""
  }

  const navigateInto = (item: GT) => {
    if (item.itemType === "folder") {
      setCurrentFolderId(item.id)
      setSearchTerm("")
    }
  }

  const navigateUp = () => {
    if (!currentFolderId) return
    const folder = transfers.find(t => t.id === currentFolderId)
    setCurrentFolderId(folder ? folder.parentId : null)
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name || !selectedGroup) return
    setIsCreatingFolder(false)
    setNewFolderName("")
    const res = await createGroupFolder(selectedGroup.id, name, currentFolderId)
    if (!res.error) {
      toast.success(`Folder "${name}" created.`)
      setTransfers(prev => [res.data as GT, ...prev])
    } else {
      toast.error(res.error === "NAME_CONFLICT" ? "A folder with this name already exists here." : res.error)
    }
  }

  const confirmRename = async () => {
    if (!renamingId || !selectedGroup) return
    const id = renamingId
    const name = renameVal.trim()
    setRenamingId(null)
    setRenameVal("")
    if (!name) return

    const item = transfers.find(t => t.id === id)
    if (!item) return
    if (item.fileName === name) return

    const res = await renameGroupItem(selectedGroup.id, id, name)
    if (!res.error) {
      toast.success("Renamed successfully.")
      setTransfers(prev => prev.map(t => t.id === id ? (res.data as GT) : t))
    } else {
      toast.error(res.error === "FILE_LOCKED" ? `Locked by ${res.lockedBy}` : res.error)
    }
  }

  const confirmDelete = async (id: string) => {
    if (!selectedGroup) return
    setDeleteId(null)
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
    const csrfToken = document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] ?? ""
    try {
      const res = await fetch(`${API_BASE_URL}/transfers/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Item deleted successfully.")
        setTransfers(prev => prev.filter(t => t.id !== id))
        if (detailsFile?.id === id) setDetailsFile(null)
      } else {
        toast.error(data.error === "FILE_LOCKED" ? `Locked by ${data.lockedBy}` : data.error)
      }
    } catch {
      toast.error("Network error during deletion.")
    }
  }

  const confirmMove = async (targetParentId: string | null) => {
    if (!moveItem || !selectedGroup) return
    const item = moveItem
    setMoveItem(null)

    if (item.parentId === targetParentId) return

    const res = await moveGroupItem(selectedGroup.id, item.id, targetParentId)
    if (!res.error) {
      toast.success(`Moved "${item.fileName}" successfully.`)
      setTransfers(prev => prev.map(t => t.id === item.id ? (res.data as GT) : t))
    } else {
      toast.error(
        res.error === "CIRCULAR_MOVE" ? "Cannot move a folder inside itself or its children." :
        res.error === "FILE_LOCKED" ? `Locked by ${res.lockedBy}` : res.error
      )
    }
  }

  // ── Move Group Modal ────────────────────────────────────────────────────────
  const MoveGroupModal = ({ onClose }: { onClose: () => void }) => {
    const [selected, setSelected] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    if (!moveItem) return null

    const folders = transfers.filter(
      t => t.itemType === "folder" && t.id !== moveItem.id && (moveItem.itemType !== "folder" || (!_isInsideFolder(t.id, moveItem.id) && !isBlockedByLock(t)))
    )

    const renderTree = (parentId: string | null, depth = 0): React.ReactNode => {
      const children = folders.filter(f => f.parentId === parentId)
      if (!children.length) return null
      return children.map(f => {
        const isExpanded = expanded.has(f.id)
        const hasChildren = folders.some(c => c.parentId === f.id)
        const isSelected = selected === f.id
        const isCurrent = f.id === currentFolderId
        return (
          <div key={f.id}>
            <button
              onClick={() => {
                if (!isCurrent) setSelected(f.id)
                if (hasChildren) {
                  setExpanded(prev => {
                    const s = new Set(prev)
                    s.has(f.id) ? s.delete(f.id) : s.add(f.id)
                    return s
                  })
                }
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
                {f.fileName}
              </span>
              {isCurrent && <span style={{ fontSize: "10px", color: "#475569", marginLeft: "auto" }}>current</span>}
            </button>
            {isExpanded && renderTree(f.id, depth + 1)}
          </div>
        )
      })
    }

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
                <MoveRight size={15} style={{ color: "#0B7FFF" }} />
              </div>
              <div>
                <p style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: 600 }}>Move to…</p>
                <p style={{ fontSize: "11px", color: "#475569" }} className="truncate max-w-[220px]">{moveItem.fileName}</p>
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
              <span style={{ fontSize: "13px", color: selected === "__root__" ? "#e2e8f0" : "#94a3b8" }}>Root Workspace</span>
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
              const isAlreadyHere = selected ? targetId === moveItem.parentId : false;
              const isSelf = selected ? moveItem.itemType === "folder" && targetId === moveItem.id : false;
              const isInvalidMove = !selected || isAlreadyHere || isSelf;

              let btnText = "Move Here";
              if (isAlreadyHere) btnText = "Already Here";
              else if (isSelf) btnText = "Invalid Move";

              return (
                <button
                  disabled={isInvalidMove}
                  onClick={() => selected && confirmMove(targetId)}
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
    )
  }

  // ── Drag-over drop zone ────────────────────────────────────────────────────
  const onZoneDragOver = (e: React.DragEvent) => {
    if (draggingId) {
      const draggingItem = transfers.find((i) => i.id === draggingId);
      if (draggingItem && draggingItem.parentId === currentFolderId) return;
    }
    e.preventDefault();
    setIsDragOver(true);
  };
  const onZoneDragLeave = () => setIsDragOver(false);
  const onZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) {
      const file = e.dataTransfer.files[0];
      setPendingUpload({ file, name: file.name });
      return;
    }
    const id = e.dataTransfer.getData("itemId");
    if (id) {
      const item = transfers.find((i) => i.id === id);
      if (item && selectedGroup) {
        if (currentFolderId === item.parentId) return;
        moveGroupItem(selectedGroup.id, item.id, currentFolderId).then((res) => {
          if (!res.error) {
            toast.success(`Moved "${item.fileName}" successfully.`);
            setTransfers(prev => prev.map(t => t.id === item.id ? (res.data as GT) : t));
          } else {
            toast.error(res.error === "CIRCULAR_MOVE" ? "Cannot move a folder inside itself." : "Move failed.");
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
    if (draggingId === folderId) return;
    const draggingItem = transfers.find((i) => i.id === draggingId);
    if (draggingItem && draggingItem.parentId === folderId) return;
    
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(folderId);
  };
  const onFolderDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault(); e.stopPropagation();
    setDropTargetId(null);
    const id = e.dataTransfer.getData("itemId");
    if (!id || id === targetFolderId || !selectedGroup) return;
    const item = transfers.find((i) => i.id === id);
    if (!item) return;
    if (targetFolderId === item.parentId) return;
    
    const res = await moveGroupItem(selectedGroup.id, item.id, targetFolderId);
    if (!res.error) {
      toast.success(`Moved "${item.fileName}" successfully.`);
      setTransfers(prev => prev.map(t => t.id === item.id ? (res.data as GT) : t));
    } else {
      toast.error(res.error === "CIRCULAR_MOVE" ? "Cannot move a folder inside itself." : "Move failed.");
    }
  };

  const doUpload = async (file: File, finalName: string, encrypt: boolean) => {
    if (!selectedGroup) return
    setIsUploading(true)

    const uploadFile = finalName !== file.name
      ? new File([file], finalName, { type: file.type })
      : file

    const result = await uploadGroupTransfer(selectedGroup.id, uploadFile, 7, currentFolderId, encrypt)
    if (!result.ok) {
      const messages: Record<string, string> = {
        FILE_TYPE_NOT_ALLOWED: "This file type is not allowed.",
        GROUP_TRANSFERS_DISABLED: "File sharing is disabled for this group.",
        FORBIDDEN: "You don't have permission to upload to this group.",
      }
      toast.error(messages[result.error ?? ""] ?? "Upload failed.")
    } else {
      toast.success(`${finalName} uploaded to ${selectedGroup.name}.`)
      setTransfers(prev => [result.transfer as GT, ...prev])
    }
    setIsUploading(false)
  }

  const handleUploadClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedGroup) return
    e.target.value = ""

    const existing = visible.find(
      t => t.fileName.toLowerCase() === file.name.toLowerCase() && t.itemType === "file"
    )

    if (existing) {
      // Name conflict — show conflict modal first, encryption modal comes after choice
      setConflict({ file, name: file.name })
    } else {
      // No conflict — ask about encryption
      setPendingUpload({ file, name: file.name })
    }
  }

  // Called when user picks encryption choice for a plain upload
  const handleEncryptionChoice = async (encrypt: boolean) => {
    const pending = pendingUpload
    setPendingUpload(null)
    if (!pending) return
    await doUpload(pending.file, pending.name, encrypt)
  }

  const handleCancelUpload = () => {
    setPendingUpload(null)
  }

  const handleKeepBoth = async () => {
    if (!conflict) return
    const { name, ext } = splitName(conflict.file.name)
    const newName = findUniqueName(name, ext, transfers)
    // Ask about encryption before uploading the renamed copy
    setConflict(null)
    setPendingUpload({ file: conflict.file, name: newName })
  }

  const handleNewVersion = async () => {
    if (!conflict || !selectedGroup) return
    const existing = visible.find(
      t => t.fileName.toLowerCase() === conflict.file.name.toLowerCase() && t.itemType === "file"
    )
    if (!existing) return
    setConflict(null)
    setIsUploading(true)
    const res = await uploadGroupVersion(selectedGroup.id, existing.id, conflict.file)
    if (res.ok) {
      toast.success(`Successfully uploaded Version ${res.transfer!.currentVersion} for "${conflict.file.name}".`)
      setTransfers(prev => prev.map(t => t.id === existing.id ? (res.transfer as GT) : t))
    } else {
      toast.error(res.error === "FILE_LOCKED" ? `Locked by ${res.lockedBy}` : res.error)
    }
    setIsUploading(false)
  }

  async function handleDownload(transfer: GT) {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
    if (!API_BASE_URL) return
    try {
      const res = await fetch(`${API_BASE_URL}/transfers/${transfer.id}/download`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(
          data.error === "EXPIRED"   ? "This file has expired." :
          data.error === "FORBIDDEN" ? "You don't have permission to download this file." :
          "Download failed."
        )
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = transfer.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`${transfer.fileName} downloaded.`)
    } catch {
      toast.error("Network error.")
    }
  }

  // ── Component Sub-Renderers ────────────────────────────────────────────────

  const ItemMenu = ({ item, onClose, isAbsolute }: { item: GT; onClose: () => void; isAbsolute?: boolean }) => {
    const isBlocked = isBlockedByLock(item)
    return (
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
          <div className="py-1">
            {item.itemType === "file" && (
              <>
                <button
                  onClick={() => { setPreviewFile(item); setPreviewEditMode(false); onClose(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                  style={{ color: "#94a3b8" }}
                >
                  <Eye size={14} /> Preview
                </button>
                {isEditableText(item.fileName, item.fileType) && (
                  <button
                    onClick={() => { setPreviewFile(item); setPreviewEditMode(true); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                    style={{ color: "#34D399" }}
                  >
                    <SquarePen size={14} /> Edit Content
                  </button>
                )}
                <button
                  onClick={() => { handleDownload(item); onClose(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                  style={{ color: "#94a3b8" }}
                >
                  <Download size={14} /> Download
                </button>
              </>
            )}
            <button
              onClick={() => { setDetailsFile(item); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
              style={{ color: "#94a3b8" }}
            >
              <FileQuestion size={14} /> Details & Versions
            </button>
            {!isBlocked && canWrite(item) && (
              <>
                <button
                  onClick={() => { setRenamingId(item.id); setRenameVal(item.fileName); onClose(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                  style={{ color: "#94a3b8" }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  onClick={() => { setMoveItem(item); onClose(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                  style={{ color: "#94a3b8" }}
                >
                  <MoveRight size={14} /> Move to…
                </button>
              </>
            )}
            {!isBlocked && canDelete(item) && (
              <button
                onClick={() => { setDeleteId(item.id); onClose(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                style={{ color: "#F87171" }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            {canManageAcl(item) && (
              <button
                onClick={() => { setAclItem(item); onClose(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-white/5 transition-colors"
                style={{ color: "#a855f7" }}
              >
                <Shield size={14} /> Permissions
              </button>
            )}
          </div>
        </div>
      </>
    )
  }

  const GridCard = ({ item }: { item: GT }) => {
    const isFolder = item.itemType === "folder"
    const isRenaming = renamingId === item.id
    const isDragging = draggingId === item.id;
    const isDropTarget = dropTargetId === item.id;

    return (
      <div
        draggable
        onDragStart={(e) => onItemDragStart(e, item.id)}
        onDragEnd={onItemDragEnd}
        onDragOver={isFolder ? (e) => onFolderDragOver(e, item.id) : undefined}
        onDragLeave={isFolder ? () => setDropTargetId(null) : undefined}
        onDrop={isFolder ? (e) => onFolderDrop(e, item.id) : undefined}
        className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:bg-white/[0.04]"
        style={{
          border: isDropTarget ? `1px solid ${fileColor(item)}66` : "1px solid rgba(255,255,255,0.05)",
          background: isDragging ? "rgba(11,127,255,0.07)" : isDropTarget ? `${fileColor(item)}0d` : "rgba(255,255,255,0.015)",
          opacity: isDragging ? 0.5 : 1,
        }}
        onClick={() => {
          if (!isRenaming) {
            if (isFolder) navigateInto(item)
            else setDetailsFile(item)
          }
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105"
          style={{ background: `${fileColor(item)}18`, border: `1px solid ${fileColor(item)}28` }}
        >
          <FileIcon item={item} size={24} />
        </div>

        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null) }}
            onBlur={confirmRename}
            onClick={e => e.stopPropagation()}
            className="w-full text-center text-[12px] rounded px-1 py-0.5 outline-none"
            style={{ background: "rgba(11,127,255,0.15)", border: "1px solid rgba(11,127,255,0.4)", color: "#e2e8f0" }}
          />
        ) : (
          <p className="text-center text-[12px] font-semibold truncate w-full px-1 text-white">
            {item.fileName}
          </p>
        )}

        <p className="text-[10px]" style={{ color: "#64748b" }}>
          {item.size ?? "—"}
        </p>

        <div className="absolute top-2 left-2 flex items-center gap-1">
          <LockBadge item={item} myEmail={user?.email ?? ""} onToggle={handleLockToggle} />
        </div>

        <button
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === item.id ? null : item.id); }}
        >
          <MoreHorizontal size={13} style={{ color: "#64748b" }} />
        </button>

        {openMenu === item.id && <ItemMenu item={item} onClose={() => setOpenMenu(null)} isAbsolute />}
      </div>
    )
  }

  const ListRow = ({ item }: { item: GT }) => {
    const isFolder = item.itemType === "folder"
    const isRenaming = renamingId === item.id
    const isDeleteConfirm = deleteId === item.id
    const isBlocked = isBlockedByLock(item)
    const isDragging = draggingId === item.id;
    const isDropTarget = dropTargetId === item.id;

    return (
      <div
        draggable
        onDragStart={(e) => onItemDragStart(e, item.id)}
        onDragEnd={onItemDragEnd}
        onDragOver={isFolder ? (e) => onFolderDragOver(e, item.id) : undefined}
        onDragLeave={isFolder ? () => setDropTargetId(null) : undefined}
        onDrop={isFolder ? (e) => onFolderDrop(e, item.id) : undefined}
        className="group grid grid-cols-[1fr_80px] sm:grid-cols-[1fr_90px_120px_80px] items-center px-5 py-3.5 transition-all duration-150 hover:bg-white/[0.025] relative cursor-pointer"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: isDragging ? "rgba(11,127,255,0.06)" : isDropTarget ? `${fileColor(item)}0a` : "transparent",
          opacity: isDragging ? 0.5 : 1,
          outline: isDropTarget ? `1px dashed ${fileColor(item)}66` : "none",
          borderRadius: isDropTarget ? "8px" : undefined,
        }}
        onClick={() => {
          if (!isRenaming && !isDeleteConfirm) {
            if (isFolder) navigateInto(item)
            else setDetailsFile(item)
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            style={{ background: `${fileColor(item)}18`, border: `1px solid ${fileColor(item)}28` }}
          >
            <FileIcon item={item} size={16} />
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-2">
            {isRenaming ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null) }}
                onBlur={confirmRename}
                onClick={e => e.stopPropagation()}
                className="w-full text-[13px] rounded-lg px-2 py-1 outline-none"
                style={{ background: "rgba(11,127,255,0.15)", border: "1px solid rgba(11,127,255,0.4)", color: "#e2e8f0" }}
              />
            ) : (
              <p className="text-[13px] font-medium truncate text-white">{item.fileName}</p>
            )}

            <LockBadge item={item} myEmail={user?.email ?? ""} onToggle={handleLockToggle} />
          </div>
        </div>

        <div className="hidden sm:block">
          <p style={{ fontSize: "12px", color: "#64748b" }}>{item.size}</p>
        </div>

        <div className="hidden sm:block">
          <p style={{ fontSize: "12px", color: "#64748b" }}>{item.date}</p>
        </div>

        <div onClick={e => e.stopPropagation()}>
          {isDeleteConfirm ? (
            <div className="flex items-center gap-2 justify-end">
              <span style={{ fontSize: "11px", color: "#ef4444" }}>Delete?</span>
              <button
                onClick={() => confirmDelete(item.id)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20"
              >
                <Check size={13} style={{ color: "#ef4444" }} />
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10"
              >
                <X size={13} style={{ color: "#64748b" }} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
              {!isFolder && (
                <>
                  <button
                    onClick={() => handleDownload(item)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-500/10 transition-colors"
                    title="Download"
                  >
                    <Download size={13} style={{ color: "#0B7FFF" }} />
                  </button>
                  {isEditableText(item.fileName, item.fileType) && (
                    <button
                      onClick={() => { setPreviewFile(item); setPreviewEditMode(true); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-500/10 transition-colors"
                      title="Edit Content"
                    >
                      <SquarePen size={13} style={{ color: "#34D399" }} />
                    </button>
                  )}
                </>
              )}

              <button
                onClick={() => setDetailsFile(item)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                title="View details"
              >
                <Eye size={13} style={{ color: "#6b7fa8" }} />
              </button>

              {canManageAcl(item) && (
                <button
                  onClick={() => setAclItem(item)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-purple-500/10 transition-colors"
                  title="Manage permissions"
                >
                  <Shield size={13} style={{ color: "#a855f7" }} />
                </button>
              )}

              {!isBlocked && canWrite(item) && (
                <>
                  <button
                    onClick={() => {
                      setRenamingId(item.id)
                      setRenameVal(item.fileName)
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    title="Rename"
                  >
                    <Pencil size={13} style={{ color: "#6b7fa8" }} />
                  </button>
                  <button
                    onClick={() => {
                      setMoveItem(item)
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    title="Move"
                  >
                    <MoveRight size={13} style={{ color: "#6b7fa8" }} />
                  </button>
                  <button
                    onClick={() => setDeleteId(item.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} style={{ color: "#ef4444" }} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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

  if (isLoadingGroups) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-white/40">
        <Loader2 size={40} className="animate-spin text-[#0B7FFF]" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Groups...</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <FolderOpen size={48} style={{ color: "#3d4f6e" }} />
        <p style={{ color: "#6b7fa8", fontSize: "15px" }}>
          You are not a member of any group yet.
        </p>
        {isAppAdmin && (
          <p style={{ color: "#4a5578", fontSize: "13px" }}>
            Create a group in Team Management and add members.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      
      {/* Header & Group Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Group Workspace</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
            Pessimistic Locking & Document Explorer
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowPicker(v => !v)}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{
              background: "rgba(11,127,255,0.1)",
              border: "1px solid rgba(11,127,255,0.25)",
              color: "#e2e8f0",
              fontSize: "14px",
              fontWeight: 600,
              minWidth: "200px",
            }}
          >
            <Users size={16} style={{ color: "#0B7FFF", flexShrink: 0 }} />
            <span className="flex-1 text-left truncate">
              {selectedGroup ? selectedGroup.name : "Select a group"}
            </span>
            <ChevronDown size={14} style={{ color: "#6b7fa8", flexShrink: 0 }} />
          </button>
          {showGroupPicker && (
            <div
              className="absolute right-0 mt-2 rounded-xl overflow-hidden z-20"
              style={{
                background: "#0d1228",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                minWidth: "220px",
              }}
            >
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelected(g)
                    setShowPicker(false)
                    setSearchTerm("")
                    setTab("files")
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                  style={{ color: selectedGroup?.id === g.id ? "#0B7FFF" : "#e2e8f0", fontSize: "14px" }}
                >
                  <Users size={14} style={{ color: selectedGroup?.id === g.id ? "#0B7FFF" : "#4a5578", flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.name}</p>
                    <p style={{ color: "#4a5578", fontSize: "11px" }}>
                      {g.memberCount} member{g.memberCount !== 1 ? "s" : ""} · {g.myRole ?? "member"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!selectedGroup ? (
        <div
          className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <FolderOpen size={48} style={{ color: "#3d4f6e", marginBottom: "16px" }} />
          <p style={{ color: "#6b7fa8", fontSize: "15px" }}>Select a group to get started</p>
        </div>
      ) : (
        <>
          {/* Tab Selection */}
          <div className="flex gap-1 p-1 rounded-xl w-fit"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {([
              { id: "files",   label: "Explorer", icon: <FolderOpen size={14} /> },
              { id: "members", label: "Members",  icon: <Users size={14} /> },
            ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSearchTerm("") }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-semibold"
                style={{
                  background: tab === t.id ? "rgba(11,127,255,0.2)" : "transparent",
                  color:      tab === t.id ? "#0B7FFF" : "#6b7fa8",
                  border:     tab === t.id ? "1px solid rgba(11,127,255,0.3)" : "1px solid transparent",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Search, Breadcrumbs, Views Toolbar (files only) */}
          {tab === "files" && (
            <div className="flex flex-col gap-3">
              
              {/* Breadcrumb Trail */}
              <div className="flex items-center justify-between">
                <nav className="flex items-center gap-1 flex-wrap" aria-label="breadcrumb">
                  <button
                    onClick={() => setCurrentFolderId(null)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
                    style={{ fontSize: "12px", color: currentFolderId === null ? "#e2e8f0" : "#64748b" }}
                  >
                    <Home size={13} />
                    <span>Root Workspace</span>
                  </button>
                  {getBreadcrumbs().slice(1).map((crumb, idx, arr) => (
                    <span key={crumb.id || "root"} className="flex items-center gap-1">
                      <ChevronRight size={12} style={{ color: "#2a3550" }} />
                      <button
                        onClick={() => setCurrentFolderId(crumb.id)}
                        className="px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5 truncate max-w-[140px]"
                        style={{
                          fontSize: "12px",
                          color: idx === arr.length - 1 ? "#e2e8f0" : "#64748b",
                          fontWeight: idx === arr.length - 1 ? 600 : 400,
                        }}
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </nav>

                {/* Sort, Grid / List Toggles */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowSortMenu(!showSortMenu)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all text-xs font-semibold text-[#cbd5e1]"
                    >
                      Sort
                      {sortDir === "asc" ? <ArrowUp size={12} className="text-[#0B7FFF]" /> : <ArrowDown size={12} className="text-[#0B7FFF]" />}
                    </button>
                    {showSortMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                        <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden min-w-[130px] p-1 shadow-2xl"
                          style={{ background: "#131929", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <button onClick={() => handleSort("name")} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] hover:bg-white/5 text-[#94a3b8] transition-colors">
                            Name <SortIcon field="name" />
                          </button>
                          <button onClick={() => handleSort("date")} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] hover:bg-white/5 text-[#94a3b8] transition-colors">
                            Date <SortIcon field="date" />
                          </button>
                          <button onClick={() => handleSort("size")} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] hover:bg-white/5 text-[#94a3b8] transition-colors">
                            Size <SortIcon field="size" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
                  <button
                    onClick={() => setViewMode("list")}
                    className="p-1.5 rounded-md hover:bg-white/5 text-[#64748b] transition-colors"
                    style={{ color: viewMode === "list" ? "#0B7FFF" : "#64748b" }}
                  >
                    <List size={13} />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className="p-1.5 rounded-md hover:bg-white/5 text-[#64748b] transition-colors"
                    style={{ color: viewMode === "grid" ? "#0B7FFF" : "#64748b" }}
                  >
                    <LayoutGrid size={13} />
                  </button>
                </div>
              </div>
            </div>

              {/* Action Toolbar */}
              <div className="flex gap-2 sm:gap-3">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b7fa8" }} />
                  <input
                    type="text"
                    placeholder="Search files and folders..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }}
                  />
                </div>

                {/* Back navigation button inside tree */}
                {currentFolderId && !searchTerm && (
                  <button
                    onClick={navigateUp}
                    className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/5 border border-white/10 transition-all text-[#cbd5e1]"
                    title="Up one folder"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}

                <button
                  disabled={transfersDisabled}
                  onClick={() => setIsCreatingFolder(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all text-[13px] font-bold text-[#e2e8f0]"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">Folder</span>
                </button>

                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadClick} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !canUploadHere()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "13px", fontWeight: 600 }}
                >
                  {isUploading
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Upload size={16} />}
                  <span>Upload</span>
                </button>
              </div>
            </div>
          )}

          {/* Search bar (members tab only) */}
          {tab === "members" && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b7fa8" }} />
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }}
              />
            </div>
          )}

          {/* ── Files Tab ── */}
          {tab === "files" && (
            <div 
              className="flex flex-col gap-3 p-1 -m-1"
              onDragOver={onZoneDragOver}
              onDragLeave={onZoneDragLeave}
              onDrop={onZoneDrop}
              style={{
                background: isDragOver ? "rgba(11,127,255,0.02)" : "transparent",
                border: isDragOver ? "1px dashed rgba(11,127,255,0.4)" : "1px solid transparent",
                borderRadius: "12px",
                transition: "all 0.2s"
              }}
            >
              {isLoadingFiles ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl text-white/40"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Loader2 size={40} className="animate-spin text-[#0B7FFF] mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Files...</p>
                </div>
              ) : transfersDisabled ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Lock size={40} style={{ color: "#4a5578" }} />
                  <p style={{ color: "#6b7fa8", fontSize: "14px" }}>Group workspace is locked by admin settings.</p>
                </div>
              ) : filteredTransfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-dashed border-white/10"
                  style={{ background: "rgba(255,255,255,0.01)" }}>
                  <FolderOpen size={40} style={{ color: "#3d4f6e", marginBottom: "16px" }} />
                  <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
                    {searchTerm ? "No files match your search." : "This directory is empty. Add a folder or drop files here."}
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredTransfers.map(item => (
                    <GridCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
                  {filteredTransfers.map(item => (
                    <ListRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Members Tab ── */}
          {tab === "members" && (
            <div className="flex flex-col gap-3">
              {isLoadingMembers ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl text-white/40"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Loader2 size={40} className="animate-spin text-[#0B7FFF] mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Members...</p>
                </div>
              ) : membersDisabled ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Lock size={40} style={{ color: "#4a5578" }} />
                  <p style={{ color: "#6b7fa8", fontSize: "14px" }}>The member directory is disabled for this group.</p>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Users size={48} style={{ color: "#3d4f6e", marginBottom: "16px" }} />
                  <p style={{ color: "#6b7fa8", fontSize: "15px" }}>
                    {searchTerm ? "No members match your search." : "No members yet."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredMembers.map(member => (
                    <div key={member.id}
                      className="flex items-center gap-3 p-4 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white animate-pulse"
                        style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}>
                        {member.userAvatar || member.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-semibold truncate">{member.userName}</p>
                          {member.userId === user?.id && (
                            <span style={{ fontSize: "9px", fontWeight: 700, color: "#00d2ff", background: "rgba(0,210,255,0.1)", padding: "1px 6px", borderRadius: "4px" }}>
                              YOU
                            </span>
                          )}
                        </div>
                        <p style={{ color: "#6b7fa8", fontSize: "12px" }}>{member.userEmail}</p>
                      </div>
                      <span
                        className="px-2 py-1 rounded text-xs capitalize shrink-0 font-semibold"
                        style={{
                          color: member.role === "admin" ? "#0B7FFF" : "#6b7fa8",
                          background: member.role === "admin" ? "rgba(11,127,255,0.1)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${member.role === "admin" ? "rgba(11,127,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                        }}
                      >
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Item Details Side Dialog */}
      <Dialog open={!!detailsFile} onOpenChange={() => setDetailsFile(null)}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: "500px" }}>
          {detailsFile && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-xl flex items-center gap-2">
                  <FileIcon item={detailsFile} size={18} />
                  <span>Item Details</span>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 mt-3">
                {[
                  { label: "NAME",        value: detailsFile.fileName },
                  { label: "TYPE",        value: detailsFile.itemType.toUpperCase() },
                  { label: "OWNER",       value: detailsFile.uploadedBy },
                  { label: "SIZE",        value: detailsFile.size },
                  { label: "ENCRYPTION",  value: detailsFile.encryptionType },
                  { label: "VERSION",     value: detailsFile.itemType === "folder" ? "—" : `v${detailsFile.currentVersion}` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</p>
                    <p className="text-white mt-1 text-sm truncate">{value}</p>
                  </div>
                ))}
              </div>

              {/* Version History (files only) */}
              {detailsFile.itemType === "file" && (
                <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="flex items-center gap-1.5 font-bold" style={{ color: "#e2e8f0", fontSize: "12px", letterSpacing: "0.05em" }}>
                      <History size={14} style={{ color: "#0B7FFF" }} />
                      <span>VERSION HISTORY</span>
                    </p>

                    {/* Version upload trigger */}
                    {!isBlockedByLock(detailsFile) && (
                      <>
                        <input ref={versionInputRef} type="file" className="hidden" onChange={handleVersionUpload} />
                        <button
                          disabled={isUploadingVersion}
                          onClick={() => versionInputRef.current?.click()}
                          className="px-2 py-1 rounded border border-white/10 hover:bg-white/5 text-[10px] font-bold text-white flex items-center gap-1 transition-all disabled:opacity-40"
                        >
                          {isUploadingVersion ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                          <span>Upload Version</span>
                        </button>
                      </>
                    )}
                  </div>

                  {loadingVersions ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={20} className="animate-spin text-[#0B7FFF]" />
                    </div>
                  ) : versions.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#475569" }}>No version history available.</p>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                      {versions.map(v => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between p-2.5 rounded-lg"
                          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <div className="min-w-0">
                            <p style={{ fontSize: "12.5px", color: "#e2e8f0", fontWeight: 600 }}>
                              Version {v.versionNum}
                              {v.versionNum === detailsFile.currentVersion && (
                                <span className="ml-2 text-[9px] text-[#00E5A0] bg-[#00E5A0]/10 px-1.5 py-0.5 rounded-md font-bold">current</span>
                              )}
                            </p>
                            <p style={{ fontSize: "10.5px", color: "#64748b", marginTop: "1px" }} className="truncate">
                              By {v.author} · {format(new Date(v.createdAt), "MMM d, yyyy")}
                            </p>
                          </div>

                          {/* Restore Past Version Option */}
                          {v.versionNum !== detailsFile.currentVersion && (
                            <button
                              disabled={restoringVer === v.versionNum || isBlockedByLock(detailsFile)}
                              onClick={() => handleRestore(v.versionNum)}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
                              style={{ color: "#0B7FFF", border: "1px solid rgba(11,127,255,0.2)" }}
                            >
                              {restoringVer === v.versionNum ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                <RotateCcw size={10} />
                              )}
                              <span>Restore</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

               {detailsFile.itemType === "file" && (
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => { setPreviewFile(detailsFile); setPreviewEditMode(false); setDetailsFile(null) }}
                    className="flex-1 h-10 rounded-xl font-bold text-sm transition-all hover:brightness-110 flex items-center justify-center gap-2 text-white"
                    style={{ background: "rgba(11,127,255,0.15)", border: "1px solid rgba(11,127,255,0.3)" }}
                  >
                    <Eye size={14} style={{ color: "#0B7FFF" }} />
                    <span>Preview</span>
                  </button>
                  <button
                    onClick={() => { handleDownload(detailsFile); setDetailsFile(null) }}
                    className="flex-1 h-10 rounded-xl font-bold text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2 text-white"
                    style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Folder Modal */}
      <Dialog open={isCreatingFolder} onOpenChange={() => setIsCreatingFolder(false)}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: "400px" }}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <Folder size={18} style={{ color: "#3b82f6" }} />
              <span>Create Virtual Folder</span>
            </DialogTitle>
          </DialogHeader>

          <input
            type="text"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreateFolder() }}
            className="w-full mt-2 px-3 py-2.5 rounded-lg text-white outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", fontSize: "14px" }}
          />

          <DialogFooter className="mt-4 gap-2">
            <button
              onClick={() => { setIsCreatingFolder(false); setNewFolderName("") }}
              className="px-4 py-2 rounded-lg text-xs font-bold text-[#64748b] hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFolder}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}
            >
              Create Folder
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relocate/Move Modal */}
      {moveItem && (
        <MoveGroupModal onClose={() => setMoveItem(null)} />
      )}

      {/* Duplicate / Version Selection Modal (Option B Choice) */}
      <Dialog open={!!conflict} onOpenChange={() => setConflict(null)}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: "420px" }}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <FileQuestion size={18} className="text-[#f59e0b]" />
              <span>Duplicate File Conflict</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="my-2">
            <p className="text-xs text-[#e2e8f0] font-semibold leading-relaxed">
              A file named <span className="text-[#0B7FFF]">"{conflict?.name}"</span> already exists in this folder.
            </p>
            <p className="text-[11px] text-[#64748b] mt-1.5 leading-relaxed">
              How would you like to handle this upload? You can track versions or separate the files.
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={handleNewVersion}
              className="flex flex-col items-start gap-1 p-3 rounded-xl text-left border border-white/5 bg-white/2 hover:bg-white/5 transition-all"
            >
              <span className="text-xs font-bold text-[#00E5A0]">Upload as a New Version</span>
              <span className="text-[10px] text-[#64748b]">Increments version counter on the existing record, keeping file history.</span>
            </button>

            <button
              onClick={handleKeepBoth}
              className="flex flex-col items-start gap-1 p-3 rounded-xl text-left border border-white/5 bg-white/2 hover:bg-white/5 transition-all"
            >
              <span className="text-xs font-bold text-[#0B7FFF]">Keep Both (Rename)</span>
              <span className="text-[10px] text-[#64748b]">Uploads as a new copy, auto-renaming the file suffix.</span>
            </button>
          </div>

          <DialogFooter className="mt-3">
            <button
              onClick={() => setConflict(null)}
              className="w-full py-2 rounded-lg text-xs font-bold text-[#64748b] hover:bg-white/5 transition-all"
            >
              Cancel Upload
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Encryption Choice Modal ───────────────────────────────────────── */}
      {pendingUpload && (
        <EncryptionChoiceModal
          files={pendingUpload.file}
          onChoose={handleEncryptionChoice}
          onCancel={handleCancelUpload}
        />
      )}

      {/* ── FileViewer Modal ──────────────────────────────────────────────── */}
      {previewFile && (
        <FileViewer
          fileId={previewFile.id}
          fileName={previewFile.fileName}
          fileType={previewFile.fileType as any}
          source="transfer"
          groupId={previewFile.groupId || selectedGroup?.id}
          initialEditMode={previewEditMode}
          onClose={() => setPreviewFile(null)}
          onDownload={() => {
            handleDownload(previewFile);
            setPreviewFile(null);
          }}
        />
      )}

      {/* ── AclModal ──────────────────────────────────────────────────────── */}
      {aclItem && selectedGroup && (
        <AclModal
          transferId={aclItem.id}
          transferName={aclItem.fileName}
          groupId={selectedGroup.id}
          onClose={() => setAclItem(null)}
        />
      )}

    </div>
  )
}
