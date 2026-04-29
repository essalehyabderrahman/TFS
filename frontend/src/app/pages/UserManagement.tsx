import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../hooks/useAuth"
import { toast } from "sonner"
import { Users, Trash2, Loader2, ShieldCheck, ShieldOff, UserCheck, UserX, Crown } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog"
import { apiRequest } from "../api/client"

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
                  border: `1px solid ${isSuspended ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.07)"}`,
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
                    <p className="text-white text-sm font-semibold truncate">{member.name}</p>
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
          <h1 className="text-white text-2xl font-bold mb-1">User Management</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>Manage platform accounts, roles and access</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background: "rgba(11,127,255,0.08)", border: "1px solid rgba(11,127,255,0.2)" }}>
          <Users size={14} style={{ color: "#0B7FFF" }} />
          <span style={{ color: "#0B7FFF", fontSize: "13px", fontWeight: 600 }}>{members.length} users</span>
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

      {/* Confirm role change */}
      <AlertDialog open={!!pendingRoleChange} onOpenChange={() => setPendingRoleChange(null)}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {pendingRoleChange?.newRole === "admin" ? "Promote to Admin" : "Demote to User"}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              {pendingRoleChange?.newRole === "admin"
                ? `Grant ${pendingRoleChange?.member.name} full admin access to the platform? This includes user management and audit logs.`
                : `Remove admin privileges from ${pendingRoleChange?.member.name}? They will only be able to manage their own files.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
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

      {/* Confirm delete */}
      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete User</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              Permanently delete {memberToDelete?.name} ({memberToDelete?.email})? All their uploaded files will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
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