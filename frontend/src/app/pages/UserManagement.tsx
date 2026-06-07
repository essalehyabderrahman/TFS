import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../hooks/useAuth"
import { toast } from "sonner"
import { Users, Trash2, Loader2, ShieldCheck, ShieldOff, UserCheck, UserX, Crown, UserPlus, ChevronDown, Key, HardDrive, Check, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog"
import { apiRequest } from "../api/client"
import { apiInviteMember, apiAdminSetPassword } from "../api/team"

interface Member {
  id: string
  name: string
  email: string
  role: "admin" | "user"
  status: "active" | "pending" | "suspended"
  avatar: string
  joinedAt: string
  lastActive: string
  isRoot: boolean
  storageQuotaBytes?: number | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL

export function UserManagement() {
  const { user: self, isAppAdmin, isRootAdmin, isInitializing } = useAuth()

  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [pendingRoleChange, setPendingRoleChange] = useState<{ member: Member; newRole: "admin" | "user" } | null>(null)
  const [isRoleChanging, setIsRoleChanging] = useState(false)

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // Invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteName, setInviteName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user")
  const [invitePassword, setInvitePassword] = useState("")
  const [showInviteRoleDropdown, setShowInviteRoleDropdown] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  
  // Set password dialog
  const [passwordTarget, setPasswordTarget] = useState<Member | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [isSettingPassword, setIsSettingPassword] = useState(false)

  const passwordRequirements = [
    { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
    { label: "Contains a number",       test: (p: string) => /\d/.test(p) },
    { label: "Lowercase & Uppercase",   test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: "Special character",       test: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(p) },
  ]
  const isNewPasswordStrong = passwordRequirements.every(req => req.test(newPassword))
  const isInvitePasswordStrong = !invitePassword || passwordRequirements.every(req => req.test(invitePassword))

  // Configure quota dialog
  const [quotaTarget, setQuotaTarget] = useState<Member | null>(null)
  const [quotaValue, setQuotaValue] = useState("")
  const [quotaUnit, setQuotaUnit] = useState<"MB" | "GB">("GB")
  const [isUnlimited, setIsUnlimited] = useState(false)
  const [isSettingQuota, setIsSettingQuota] = useState(false)

  const loadMembers = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await apiRequest<Member[]>("/team")
      setMembers(data)
    } catch {
      toast.error("Failed to load users.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isInitializing && isAppAdmin) loadMembers()
  }, [isInitializing, isAppAdmin, loadMembers])

  if (!isAppAdmin) return null

  async function handleStatusToggle(member: Member) {
    const newStatus = member.status === "suspended" ? "active" : "suspended"
    setUpdatingStatus(member.id)
    try {
      const updated = await apiRequest<Member>(`/team/${member.id}`, {
        method: "PATCH",
        body: { status: newStatus },
      })
      setMembers(p => p.map(m => m.id === member.id ? { ...m, status: updated.status } : m))
      toast.success(`${member.name} ${newStatus === "suspended" ? "suspended" : "reactivated"}.`)
    } catch (err: any) {
      const messages: Record<string, string> = {
        LAST_ADMIN_PROTECTED: "Cannot suspend the last active admin.",
        ROOT_PROTECTED: "The root account cannot be modified.",
        FORBIDDEN: "You do not have permission to do this.",
      }
      toast.error(messages[err?.message] ?? "Failed to update status.")
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function handleRoleChange() {
    if (!pendingRoleChange) return
    const { member, newRole } = pendingRoleChange
    setIsRoleChanging(true)
    try {
      const updated = await apiRequest<Member>(`/team/${member.id}`, {
        method: "PATCH",
        body: { role: newRole },
      })
      setMembers(p => p.map(m => m.id === member.id ? { ...m, role: updated.role } : m))
      toast.success(`${member.name} is now ${newRole === "admin" ? "an Admin" : "a User"}.`)
      setPendingRoleChange(null)
    } catch (err: any) {
      const messages: Record<string, string> = {
        LAST_ADMIN_PROTECTED: "Cannot demote the last active admin.",
        ROOT_PROTECTED: "The root account cannot be modified.",
        CANNOT_CHANGE_OWN_ROLE: "You cannot change your own role.",
        FORBIDDEN: "Only the root admin can change roles.",
      }
      toast.error(messages[err?.message] ?? "Failed to change role.")
    } finally {
      setIsRoleChanging(false)
    }
  }

  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Name and email are required.")
      return
    }
    if (invitePassword.trim() && !isInvitePasswordStrong) {
      toast.error("Invite password does not meet complexity requirements.")
      return
    }
    setIsInviting(true)
    const result = await apiInviteMember(inviteName.trim(), inviteEmail.trim(), inviteRole, invitePassword.trim())
    if (!result.ok) {
      const messages: Record<string, string> = {
        EMAIL_TAKEN:   "An account with this email already exists.",
        MISSING_FIELDS: "Name and email are required.",
        FORBIDDEN:     "You do not have permission to invite users.",
        INVALID_ROLE:  "Invalid role selected.",
        PASSWORD_TOO_SHORT: "Password must be at least 12 characters.",
        PASSWORD_NO_UPPERCASE: "Password must contain an uppercase letter.",
        PASSWORD_NO_LOWERCASE: "Password must contain a lowercase letter.",
        PASSWORD_NO_DIGIT: "Password must contain a number.",
        PASSWORD_NO_SYMBOL: "Password must contain a special character.",
      }
      toast.error(messages[result.error ?? ""] ?? "Failed to create user.")
    } else {
      toast.success(`${inviteEmail} invited successfully.`)
      setMembers(prev => [...prev, result.data as Member])
      setShowInviteDialog(false)
      setInviteName("")
      setInviteEmail("")
      setInvitePassword("")
      setInviteRole("user")
    }
    setIsInviting(false)
  }

  async function handleDelete() {
    if (!memberToDelete) return
    setIsDeleting(true)
    try {
      await apiRequest(`/team/${memberToDelete.id}`, { method: "DELETE" })
      setMembers(p => p.filter(m => m.id !== memberToDelete.id))
      toast.success(`${memberToDelete.name} deleted.`)
      setMemberToDelete(null)
    } catch (err: any) {
      const messages: Record<string, string> = {
        LAST_ADMIN_PROTECTED: "Cannot delete the last active admin.",
        CANNOT_DELETE_SELF: "You cannot delete your own account here.",
        ROOT_PROTECTED: "The root account cannot be deleted.",
        FORBIDDEN: "You do not have permission to do this.",
      }
      toast.error(messages[err?.message] ?? "Failed to delete user.")
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleSetPassword() {
    if (!passwordTarget || !newPassword.trim()) return
    if (!isNewPasswordStrong) {
      toast.error("Password does not meet complexity requirements.")
      return
    }
    setIsSettingPassword(true)
    const result = await apiAdminSetPassword(passwordTarget.id, newPassword.trim())
    if (result.ok) {
      toast.success(`Password for ${passwordTarget.name} has been updated.`)
      setPasswordTarget(null)
      setNewPassword("")
    } else {
      const messages: Record<string, string> = {
        PASSWORD_TOO_SHORT: "Password must be at least 12 characters.",
        PASSWORD_NO_UPPERCASE: "Password must contain an uppercase letter.",
        PASSWORD_NO_LOWERCASE: "Password must contain a lowercase letter.",
        PASSWORD_NO_DIGIT: "Password must contain a number.",
        PASSWORD_NO_SYMBOL: "Password must contain a special character.",
      }
      toast.error(messages[result.error ?? ""] ?? "Failed to update password.")
    }
    setIsSettingPassword(false)
  }

  async function handleSetQuota() {
    if (!quotaTarget) return
    
    setIsSettingQuota(true)
    try {
      let quotaBytes: number | null = null
      
      if (!isUnlimited) {
        const value = parseFloat(quotaValue)
        if (isNaN(value) || value <= 0) {
          toast.error("Please enter a valid quota value.")
          setIsSettingQuota(false)
          return
        }
        // Convert to bytes
        quotaBytes = quotaUnit === "GB" ? value * 1024 * 1024 * 1024 : value * 1024 * 1024
      }
      
      const updated = await apiRequest<Member>(`/team/${quotaTarget.id}`, {
        method: "PATCH",
        body: { storageQuota: quotaBytes },
      })
      
      setMembers(p => p.map(m => m.id === quotaTarget.id ? { ...m, storageQuotaBytes: updated.storageQuotaBytes } : m))
      toast.success(`Storage quota for ${quotaTarget.name} has been ${isUnlimited ? 'set to unlimited' : 'updated'}.`)
      setQuotaTarget(null)
      setQuotaValue("")
      setIsUnlimited(false)
    } catch (err: any) {
      toast.error(err?.message || "Failed to update quota.")
    } finally {
      setIsSettingQuota(false)
    }
  }

  function openQuotaDialog(member: Member) {
    setQuotaTarget(member)
    if (member.storageQuotaBytes === null || member.storageQuotaBytes === undefined) {
      setIsUnlimited(true)
      setQuotaValue("")
    } else {
      setIsUnlimited(false)
      // Convert bytes to GB by default
      const gb = member.storageQuotaBytes / (1024 * 1024 * 1024)
      if (gb >= 1) {
        setQuotaValue(gb.toString())
        setQuotaUnit("GB")
      } else {
        const mb = member.storageQuotaBytes / (1024 * 1024)
        setQuotaValue(mb.toString())
        setQuotaUnit("MB")
      }
    }
  }

  const admins = members.filter(m => m.role === "admin")
  const users  = members.filter(m => m.role === "user")

  function renderSection(title: string, list: Member[], accentColor: string) {
    if (list.length === 0) return null
    return (
      <div>
        <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "10px" }}>
          {title} ({list.length})
        </p>
        <div className="flex flex-col gap-2">
          {list.map(member => {
            const isSelf = member.id === self?.id
            const isRoot = member.isRoot
            const isSuspended = member.status === "suspended"
            const statusBusy = updatingStatus === member.id

            return (
              <div key={member.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: isSuspended ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isSuspended ? "var(--border)" : "var(--border-light)"}`,
                  opacity: isSuspended ? 0.75 : 1,
                }}>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}aa 100%)` }}>
                  {member.avatar || member.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{member.name}</p>
                    {isSelf && (
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: "#00d2ff", background: "rgba(0,210,255,0.1)", padding: "1px 6px", borderRadius: "4px" }}>
                        YOU
                      </span>
                    )}
                    {isRoot && (
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        ROOT
                      </span>
                    )}
                    {isSuspended && (
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: "#ef4444", background: "rgba(239,68,68,0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        SUSPENDED
                      </span>
                    )}
                    {member.status === "pending" && (
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        PENDING
                      </span>
                    )}
                  </div>
                  <p style={{ color: "#6b7fa8", fontSize: "12px" }}>{member.email}</p>
                </div>

                {/* Joined */}
                <p className="hidden sm:block shrink-0" style={{ color: "#4a5578", fontSize: "11px" }}>
                  {new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>

                {/* Actions */}
                {!isSelf && !isRoot && (
                  <div className="flex items-center gap-1 shrink-0">

                    {/* Promote / Demote — root only */}
                    {isRootAdmin && (
                      member.role === "user" ? (
                        <button
                          onClick={() => setPendingRoleChange({ member, newRole: "admin" })}
                          title="Promote to Admin"
                          className="p-1.5 rounded-lg hover:bg-blue-500/10 transition-colors"
                          style={{ color: "#0B7FFF" }}>
                          <ShieldCheck size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setPendingRoleChange({ member, newRole: "user" })}
                          title="Demote to User"
                          className="p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                          style={{ color: "#f59e0b" }}>
                          <ShieldOff size={15} />
                        </button>
                      )
                    )}

                    {/* Suspend / Reactivate */}
                    <button
                      onClick={() => handleStatusToggle(member)}
                      disabled={statusBusy}
                      title={isSuspended ? "Reactivate" : "Suspend"}
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                      style={{
                        color: isSuspended ? "#00E5A0" : "#f59e0b",
                        background: isSuspended ? "rgba(0,229,160,0)" : "transparent",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = isSuspended ? "rgba(0,229,160,0.1)" : "rgba(245,158,11,0.1)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      {statusBusy
                        ? <Loader2 size={15} className="animate-spin" />
                        : isSuspended ? <UserCheck size={15} /> : <UserX size={15} />}
                    </button>

                    {/* Set Password */}
                    <button
                      onClick={() => { setPasswordTarget(member); setNewPassword("") }}
                      title="Set user password"
                      className="p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                      style={{ color: "#f59e0b" }}>
                      <Key size={15} />
                    </button>

                    {/* Configure Quota */}
                    <button
                      onClick={() => openQuotaDialog(member)}
                      title="Configure storage quota"
                      className="p-1.5 rounded-lg hover:bg-purple-500/10 transition-colors"
                      style={{ color: "#a855f7" }}>
                      <HardDrive size={15} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setMemberToDelete(member)}
                      title="Delete user"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                      style={{ color: "#ef4444" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--foreground)" }}>User Management</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>Manage platform accounts, roles and access</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(11,127,255,0.08)", border: "1px solid rgba(11,127,255,0.2)" }}>
            <Users size={14} style={{ color: "#0B7FFF" }} />
            <span style={{ color: "#0B7FFF", fontSize: "13px", fontWeight: 600 }}>{members.length} users</span>
          </div>
          <button
            onClick={() => setShowInviteDialog(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "14px", fontWeight: 600 }}>
            <UserPlus size={15} /> Invite User
          </button>
        </div>
      </div>

      {/* Legend */}
      {isRootAdmin && (
        <div className="flex flex-wrap gap-4 p-3 rounded-xl text-xs"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-1.5" style={{ color: "#0B7FFF" }}><ShieldCheck size={13} /> Promote to Admin</div>
          <div className="flex items-center gap-1.5" style={{ color: "#f59e0b" }}><ShieldOff size={13} /> Demote to User</div>
          <div className="flex items-center gap-1.5" style={{ color: "#f59e0b" }}><UserX size={13} /> Suspend</div>
          <div className="flex items-center gap-1.5" style={{ color: "#00E5A0" }}><UserCheck size={13} /> Reactivate</div>
          <div className="flex items-center gap-1.5" style={{ color: "#f59e0b" }}><Key size={13} /> Set Password</div>
          <div className="flex items-center gap-1.5" style={{ color: "#a855f7" }}><HardDrive size={13} /> Configure Quota</div>
          <div className="flex items-center gap-1.5" style={{ color: "#ef4444" }}><Trash2 size={13} /> Delete</div>
          <div className="flex items-center gap-1.5 ml-auto" style={{ color: "#4a5578" }}>
            <Crown size={13} style={{ color: "#f59e0b" }} />
            <span>Role changes are root-only</span>
          </div>
        </div>
      )}

      {/* User list */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Loader2 size={36} className="animate-spin text-[#0B7FFF] mb-3" />
          <p style={{ color: "#4a5578", fontSize: "10px", fontWeight: 700, letterSpacing: "0.3em" }}>LOADING USERS...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-5 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {renderSection("ADMINS", admins, "#0B7FFF")}
          {renderSection("USERS", users, "#00E5A0")}
        </div>
      )}

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={v => { setShowInviteDialog(v); setShowInviteRoleDropdown(false) }}>
        <DialogContent style={{ background: "var(--card-background)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-xl" style={{ color: "var(--foreground)" }}>Invite New User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>FULL NAME</label>
              <input
                type="text"
                placeholder="Jane Smith"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isInviting) handleInvite() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px", color:"var(--foreground)" }}
              />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>EMAIL</label>
              <input
                type="email"
                placeholder="jane@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isInviting) handleInvite() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px", color: "var(--foreground)" }}
              />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>INITIAL PASSWORD (OPTIONAL)</label>
              <input
                type="password"
                placeholder="••••••••"
                value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isInviting && isInvitePasswordStrong) handleInvite() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px", color: "var(--muted-foreground)" }}
              />
              {invitePassword && (
                <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-xl animate-fadeIn"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {passwordRequirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {req.test(invitePassword)
                        ? <Check size={10} style={{ color: "#00d2ff" }} />
                        : <div className="w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: "var(--muted-foreground)" }} />}
                      <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                        color: req.test(invitePassword) ? "var(--foreground)" : "var(--muted-foreground)"
                      }}>{req.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={{ color: "var(--foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>ROLE</label>
              {isRootAdmin ? (
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setShowInviteRoleDropdown(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg"
                    style={{ background: "var(--card-background)", border: "1px solid var(--foreground)", color: "var(--foreground)", fontSize: "14px" }}
                  >
                    <span>{inviteRole === "user" ? "User — standard access" : "Admin — full platform access"}</span>
                    <ChevronDown size={14} style={{ color: "var(--foreground)" }} />
                  </button>
                  {showInviteRoleDropdown && (
                    <div className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                      style={{ background: "var(--card-background)", border: "1px solid var(--foreground)", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
                      {(["user", "admin"] as const).map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => { setInviteRole(r); setShowInviteRoleDropdown(false) }}
                          className="w-full px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                          style={{ color: inviteRole === r ? "#0B7FFF" : "var(--foreground)", fontSize: "14px" }}
                        >
                          {r === "user" ? "User — standard access" : "Admin — full platform access"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full mt-1 px-4 py-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)", fontSize: "14px" }}>
                  User — standard access
                </div>
              )}
            </div>
            <p style={{ color: "#4a5578", fontSize: "12px" }}>
              {invitePassword 
                ? "The account will be created with the password provided and activated immediately."
                : "The account will be created with a temporary random password. The user will need an admin to set their credentials before they can sign in."}
            </p>
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setShowInviteDialog(false)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--foreground)" }}>
              Cancel
            </button>
            <button onClick={handleInvite} disabled={isInviting || !isInvitePasswordStrong}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isInviting && <Loader2 size={16} className="animate-spin" />}
              Create User
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm role change */}
      <AlertDialog open={!!pendingRoleChange} onOpenChange={() => setPendingRoleChange(null)}>
        <AlertDialogContent style={{ background: "var(--card-background)", border: "1px solid var(--foreground)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--foreground)" }}>
              {pendingRoleChange?.newRole === "admin" ? "Promote to Admin" : "Demote to User"}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              {pendingRoleChange?.newRole === "admin"
                ? `Grant ${pendingRoleChange?.member.name} full admin access to the platform? This includes user management and audit logs.`
                : `Remove admin privileges from ${pendingRoleChange?.member.name}? They will only be able to manage their own files.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--foreground)" }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleChange} disabled={isRoleChanging}
              className="flex items-center gap-2"
              style={{ background: pendingRoleChange?.newRole === "admin" ? "#0B7FFF" : "#f59e0b", color: "white" }}>
              {isRoleChanging && <Loader2 size={16} className="animate-spin" />}
              {pendingRoleChange?.newRole === "admin" ? "Promote" : "Demote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Password Dialog */}
      <Dialog open={!!passwordTarget} onOpenChange={v => { if (!v) setPasswordTarget(null) }}>
        <DialogContent style={{ background: "var(--card-background)", border: "1px solid var(--border)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--foreground)" }}>Set User Password</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
              Update the password for <span className="font-medium" style={{ color: "var(--foreground)" }}>{passwordTarget?.name}</span>.
            </p>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>NEW PASSWORD</label>
              <input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isSettingPassword && isNewPasswordStrong) handleSetPassword() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg placeholder:text-slate-500 outline-none"
                style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px", color: "var(--foreground)" }}
              />
              {newPassword && (
                <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-xl animate-fadeIn"
                  style={{ background: "var(--input-background)", border: "1px solid var(--border)" }}>
                  {passwordRequirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {req.test(newPassword)
                        ? <Check size={10} style={{ color: "#00d2ff" }} />
                        : <div className="w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: "var(--muted-foreground)" }} />}
                      <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                        color: req.test(newPassword) ? "var(--foreground)" : "var(--muted-foreground)"
                      }}>{req.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setPasswordTarget(null)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              Cancel
            </button>
            <button onClick={handleSetPassword} disabled={isSettingPassword || !isNewPasswordStrong}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "white" }}>
              {isSettingPassword && <Loader2 size={16} className="animate-spin" />}
              Update Password
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Quota Dialog */}
      <Dialog open={!!quotaTarget} onOpenChange={v => { if (!v) setQuotaTarget(null) }}>
        <DialogContent style={{ background: "var(--card-background)", border: "1px solid var(--border)" }}>
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <HardDrive size={20} style={{ color: "#a855f7" }} />
              Configure Storage Quota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
              Set storage quota for <span style={{ color: "var(--foreground)" }} className="font-medium">{quotaTarget?.name}</span>.
            </p>

            {/* Unlimited checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="unlimited-quota"
                checked={isUnlimited}
                onChange={e => setIsUnlimited(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: "#a855f7" }}
              />
              <label htmlFor="unlimited-quota" style={{ color: "var(--foreground)", fontSize: "14px", cursor: "pointer" }}>
                Unlimited Storage
              </label>
            </div>

            {/* Quota value input */}
            {!isUnlimited && (
              <div>
                <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  STORAGE LIMIT
                </label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    placeholder="10"
                    value={quotaValue}
                    onChange={e => setQuotaValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !isSettingQuota) handleSetQuota() }}
                    className="flex-1 px-4 py-2.5 rounded-lg placeholder:text-slate-500 outline-none"
                    style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px", color: "var(--foreground)" }}
                    min="0"
                    step="0.1"
                  />
                  <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      onClick={() => setQuotaUnit("MB")}
                      className="px-4 py-2.5 transition-colors"
                      style={{
                        background: quotaUnit === "MB" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)",
                        color: quotaUnit === "MB" ? "#a855f7" : "#6b7fa8",
                        fontSize: "14px",
                        fontWeight: 600
                      }}
                    >
                      MB
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotaUnit("GB")}
                      className="px-4 py-2.5 transition-colors"
                      style={{
                        background: quotaUnit === "GB" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)",
                        color: quotaUnit === "GB" ? "#a855f7" : "#6b7fa8",
                        fontSize: "14px",
                        fontWeight: 600,
                        borderLeft: "1px solid var(--border)"
                      }}
                    >
                      GB
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Current quota info */}
            {quotaTarget && (
              <div className="p-3 rounded-lg" style={{ background: "var(--input-background)", border: "1px solid var(--border)" }}>
                <p style={{ color: "#a855f7", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "4px" }}>
                  CURRENT QUOTA
                </p>
                <p style={{ color: "var(--foreground)", fontSize: "13px" }}>
                  {quotaTarget.storageQuotaBytes === null || quotaTarget.storageQuotaBytes === undefined
                    ? "Unlimited"
                    : `${(quotaTarget.storageQuotaBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setQuotaTarget(null)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              Cancel
            </button>
            <button onClick={handleSetQuota} disabled={isSettingQuota}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)", color: "white" }}>
              {isSettingQuota && <Loader2 size={16} className="animate-spin" />}
              Update Quota
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent style={{ background: "var(--input-background)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--foreground)" }}>Delete User</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              Permanently delete {memberToDelete?.name} ({memberToDelete?.email})? All their uploaded files will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}
              className="flex items-center gap-2"
              style={{ background: "#ef4444", color: "white" }}>
              {isDeleting && <Loader2 size={16} className="animate-spin" />}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}