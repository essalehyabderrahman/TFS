import { useState, useEffect, useRef } from "react"
import { useAuth } from "../hooks/useAuth"
import { toast } from "sonner"
import {
  Users, Upload, Download, FileCheck, Loader2,
  FolderOpen, ChevronDown, Search, Eye, Lock
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { format } from "date-fns"
import {
  fetchGroups, fetchGroupMembers, fetchGroupTransfers, uploadGroupTransfer,
  type Group, type GroupMember,
} from "../api/groups"
import type { Transfer } from "@/types"

type Tab = "files" | "members"

const getStatusColor = (status: string) => {
  if (status === "Delivered") return "#00E5A0"
  if (status === "Expired")   return "#94a3b8"
  return "#f59e0b"
}

export function GroupWorkspace() {
  const { user, isAppAdmin } = useAuth()

  const [groups, setGroups]           = useState<Group[]>([])
  const [selectedGroup, setSelected]  = useState<Group | null>(null)
  const [showGroupPicker, setShowPicker] = useState(false)
  const [tab, setTab]                 = useState<Tab>("files")
  const [isLoadingGroups, setLoadingGroups] = useState(true)

  const [transfers, setTransfers]     = useState<Transfer[]>([])
  const [isLoadingFiles, setLoadingFiles] = useState(false)
  const [transfersDisabled, setTransfersDisabled] = useState(false)

  const [members, setMembers]         = useState<GroupMember[]>([])
  const [isLoadingMembers, setLoadingMembers] = useState(false)
  const [membersDisabled, setMembersDisabled] = useState(false)

  const [searchTerm, setSearchTerm]   = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<Transfer | null>(null)

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

  // Load files when group or tab changes
  useEffect(() => {
    if (!selectedGroup || tab !== "files") return
    setTransfers([])
    setLoadingFiles(true)
    setTransfersDisabled(false)
    fetchGroupTransfers(selectedGroup.id).then(res => {
      if (res.error === "GROUP_TRANSFERS_DISABLED") {
        setTransfersDisabled(true)
      } else if (!res.error) {
        setTransfers(res.data)
      } else {
        toast.error("Failed to load group files.")
      }
      setLoadingFiles(false)
    })
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedGroup) return
    e.target.value = ""
    setIsUploading(true)
    const result = await uploadGroupTransfer(selectedGroup.id, file)
    if (!result.ok) {
      const messages: Record<string, string> = {
        FILE_TYPE_NOT_ALLOWED: "This file type is not allowed.",
        GROUP_TRANSFERS_DISABLED: "File sharing is disabled for this group.",
        FORBIDDEN: "You don't have permission to upload to this group.",
      }
      toast.error(messages[result.error ?? ""] ?? "Upload failed.")
    } else {
      toast.success(`${file.name} uploaded to ${selectedGroup.name}.`)
      setTransfers(prev => [result.transfer!, ...prev])
    }
    setIsUploading(false)
  }

  async function handleDownload(transfer: Transfer) {
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

  const filteredTransfers = transfers.filter(t =>
    t.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.uploadedBy.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredMembers = members.filter(m =>
    m.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Group Workspace</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
            Share files and collaborate with your group
          </p>
        </div>

        {/* Group picker */}
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
          {/* Tab Bar */}
          <div className="flex gap-1 p-1 rounded-xl w-fit"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {([
              { id: "files",   label: "Files",   icon: <FileCheck size={14} /> },
              { id: "members", label: "Members", icon: <Users size={14} /> },
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

          {/* Search + Upload bar (files tab only) */}
          {tab === "files" && (
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b7fa8" }} />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }}
                />
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || transfersDisabled}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "14px", fontWeight: 600 }}
              >
                {isUploading
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Upload size={16} />}
                Upload
              </button>
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
            <div className="flex flex-col gap-3">
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
                  <p style={{ color: "#6b7fa8", fontSize: "14px" }}>Group file sharing is disabled by the group admin.</p>
                </div>
              ) : filteredTransfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <FolderOpen size={48} style={{ color: "#3d4f6e", marginBottom: "16px" }} />
                  <p style={{ color: "#6b7fa8", fontSize: "15px" }}>
                    {searchTerm ? "No files match your search." : "No files yet. Upload the first one."}
                  </p>
                </div>
              ) : (
                filteredTransfers.map(transfer => (
                  <div key={transfer.id}
                    className="p-4 rounded-xl transition-all hover:bg-white/5"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "rgba(11,127,255,0.12)", border: "1px solid rgba(11,127,255,0.2)" }}>
                        <FileCheck size={20} style={{ color: "#0B7FFF" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{transfer.fileName}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span style={{ color: "#6b7fa8", fontSize: "12px" }}>
                            {transfer.uploadedBy}
                          </span>
                          <span style={{ color: "#3d4f6e" }}>·</span>
                          <span style={{ color: "#6b7fa8", fontSize: "12px" }}>{transfer.size}</span>
                          <span style={{ color: "#3d4f6e" }}>·</span>
                          <span style={{ color: "#6b7fa8", fontSize: "12px" }}>
                            {format(new Date(transfer.dateTimestamp), "MMM d, h:mm a")}
                          </span>
                        </div>
                      </div>
                      <span
                        className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg shrink-0"
                        style={{
                          fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em",
                          color: getStatusColor(transfer.status),
                          background: `${getStatusColor(transfer.status)}15`,
                          border: `1px solid ${getStatusColor(transfer.status)}30`,
                        }}
                      >
                        {transfer.status.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setSelectedFile(transfer)}
                          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                          style={{ color: "#6b7fa8" }}
                          title="View details"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleDownload(transfer)}
                          className="p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                          style={{ color: "#0B7FFF" }}
                          title="Download"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
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
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
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
                        className="px-2 py-1 rounded text-xs capitalize shrink-0"
                        style={{
                          color: member.role === "admin" ? "#0B7FFF" : "#6b7fa8",
                          background: member.role === "admin" ? "rgba(11,127,255,0.1)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${member.role === "admin" ? "rgba(11,127,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                          fontWeight: 600,
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

      {/* File Details Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {selectedFile && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-xl">File Details</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "FILE NAME",  value: selectedFile.fileName },
                  { label: "UPLOADED BY", value: selectedFile.uploadedBy },
                  { label: "SIZE",       value: selectedFile.size },
                  { label: "ENCRYPTION", value: selectedFile.encryptionType },
                  { label: "UPLOADED",   value: format(new Date(selectedFile.dateTimestamp), "MMM d, yyyy 'at' h:mm a") },
                  { label: "EXPIRES",    value: selectedFile.expiryDate ? format(new Date(selectedFile.expiryDate), "MMM d, yyyy") : "Never" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</p>
                    <p className="text-white mt-1 text-sm">{value}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { handleDownload(selectedFile); setSelectedFile(null) }}
                className="mt-4 w-full h-11 rounded-xl font-bold text-sm transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}
              >
                <Download size={15} className="inline mr-2" />
                Download File
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
