import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { useAuth } from "../hooks/useAuth"
import { toast } from "sonner"
import { Users, Plus, Trash2, Settings, UserPlus, Loader2, ChevronDown, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog"
import { Switch } from "../components/ui/switch"
import {
  fetchGroups, createGroup, deleteGroup,
  fetchGroupMembers, inviteGroupMember, updateGroupMember, removeGroupMember,
  fetchGroupSettings, updateGroupSettings,
  type Group, type GroupMember, type GroupSettings
} from "../api/groups"

export function TeamManagement() {
  const { isAppAdmin, isRootAdmin, isInitializing } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isInitializing && !isAppAdmin) {
      navigate("/dashboard", { replace: true })
    }
  }, [isInitializing, isAppAdmin, navigate])

  if (!isAppAdmin) return null

  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupMember[]>>({})
  const [groupSettings, setGroupSettings] = useState<Record<string, GroupSettings>>({})
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({})

  // Create group dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDesc, setNewGroupDesc] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  // Invite member dialog
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member")
  const [isInviting, setIsInviting] = useState(false)
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  const [openMemberRoleDropdown, setOpenMemberRoleDropdown] = useState<string | null>(null)

  // Delete group dialog
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Remove member dialog
  const [memberToRemove, setMemberToRemove] = useState<{ groupId: string; member: GroupMember } | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  useEffect(() => {
    loadGroups()
  }, [])

  async function loadGroups() {
    setIsLoading(true)
    const res = await fetchGroups()
    if (res.error) {
      toast.error("Failed to load groups.")
    } else {
      setGroups(res.data)
    }
    setIsLoading(false)
  }

  async function handleExpandGroup(groupId: string) {
    setOpenMemberRoleDropdown(null)
    if (expandedGroup === groupId) {
      setExpandedGroup(null)
      return
    }
    setExpandedGroup(groupId)
    if (!groupMembers[groupId]) {
      setLoadingMembers(p => ({ ...p, [groupId]: true }))
      const [membersRes, settingsRes] = await Promise.all([
        fetchGroupMembers(groupId),
        fetchGroupSettings(groupId),
      ])
      if (!membersRes.error) setGroupMembers(p => ({ ...p, [groupId]: membersRes.data }))
      if (!settingsRes.error && settingsRes.data) setGroupSettings(p => ({ ...p, [groupId]: settingsRes.data! }))
      setLoadingMembers(p => ({ ...p, [groupId]: false }))
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) { toast.error("Group name is required."); return }
    setIsCreating(true)
    const res = await createGroup(newGroupName.trim(), newGroupDesc.trim())
    if (res.error) {
      toast.error(res.error === "GROUP_NAME_TAKEN" ? "A group with this name already exists." : "Failed to create group.")
    } else {
      toast.success(`Group "${res.data!.name}" created.`)
      setGroups(p => [...p, res.data!])
      setShowCreateDialog(false)
      setNewGroupName("")
      setNewGroupDesc("")
    }
    setIsCreating(false)
  }

  async function handleDeleteGroup() {
    if (!groupToDelete) return
    setIsDeleting(true)
    const res = await deleteGroup(groupToDelete.id)
    if (res.error) {
      toast.error("Failed to delete group.")
    } else {
      toast.success(`Group "${groupToDelete.name}" deleted.`)
      setGroups(p => p.filter(g => g.id !== groupToDelete.id))
      setGroupToDelete(null)
      if (expandedGroup === groupToDelete.id) setExpandedGroup(null)
    }
    setIsDeleting(false)
  }

  function handleEmailInput(value: string) {
    setInviteEmail(value)
  }

  async function handleInviteMember() {
    if (!inviteGroupId || !inviteEmail.trim()) { toast.error("Email is required."); return }
    setIsInviting(true)
    const res = await inviteGroupMember(inviteGroupId, inviteEmail.trim(), inviteRole)
    if (res.error) {
      const messages: Record<string, string> = {
        USER_NOT_FOUND: "No user found with that email.",
        ALREADY_MEMBER: "This user is already a member of this group.",
        FORBIDDEN: "Only the root admin can invite members as group admin.",
        ROOT_PROTECTED: "The root admin account cannot be modified.",
      }
      toast.error(messages[res.error] ?? "Failed to invite member.")
    } else {
      toast.success(`${inviteEmail} invited successfully.`)
      setGroupMembers(p => ({
        ...p,
        [inviteGroupId]: [...(p[inviteGroupId] ?? []), res.data!]
      }))
      setGroups(p => p.map(g => g.id === inviteGroupId ? { ...g, memberCount: g.memberCount + 1 } : g))
      setInviteGroupId(null)
      setInviteEmail("")
      setInviteRole("member")
    }
    setIsInviting(false)
  }

  async function handleRoleChange(groupId: string, userId: string, newRole: "admin" | "member") {
    const res = await updateGroupMember(groupId, userId, newRole)
    if (res.error) {
      const messages: Record<string, string> = {
        LAST_GROUP_ADMIN_PROTECTED: "Cannot demote the last group admin.",
        FORBIDDEN: "Only the root admin can promote to group admin.",
        ROOT_PROTECTED: "The root admin account cannot be modified.",
      }
      toast.error(messages[res.error] ?? "Failed to update role.")
    } else {
      toast.success("Role updated.")
      setGroupMembers(p => ({
        ...p,
        [groupId]: p[groupId].map(m => m.userId === userId ? { ...m, role: newRole } : m)
      }))
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return
    setIsRemoving(true)
    const { groupId, member } = memberToRemove
    const res = await removeGroupMember(groupId, member.userId)
    if (res.error) {
      toast.error(res.error === "LAST_GROUP_ADMIN_PROTECTED"
        ? "Cannot remove the last group admin."
        : res.error === "ROOT_PROTECTED"
          ? "The root admin account cannot be modified."
          : "Failed to remove member.")
    } else {
      toast.success(`${member.userEmail} removed from group.`)
      setGroupMembers(p => ({ ...p, [groupId]: p[groupId].filter(m => m.userId !== member.userId) }))
      setGroups(p => p.map(g => g.id === groupId ? { ...g, memberCount: g.memberCount - 1 } : g))
      setMemberToRemove(null)
    }
    setIsRemoving(false)
  }

  async function handleSettingChange(groupId: string, field: string, value: boolean) {
    const prev = groupSettings[groupId]
    setGroupSettings(p => ({ ...p, [groupId]: { ...p[groupId], [field]: value } }))
    const res = await updateGroupSettings(groupId, { [field]: value } as any)
    if (res.error) {
      toast.error(res.error === "EXTERNAL_SHARING_DISABLED_GLOBALLY"
        ? "External sharing is disabled globally by the app admin."
        : "Failed to update settings.")
      setGroupSettings(p => ({ ...p, [groupId]: prev }))
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Team Management</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>Manage groups and their members</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "14px", fontWeight: 600 }}
        >
          <Plus size={16} />
          New Group
        </button>
      </div>

      {/* Groups List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl text-white/40"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Loader2 size={40} className="animate-spin text-[#0B7FFF] mb-4" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Groups...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Users size={48} style={{ color: "#3d4f6e", marginBottom: "16px" }} />
          <p style={{ color: "#6b7fa8", fontSize: "15px" }}>No groups yet. Create your first group.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(group => (
            <div key={group.id} className="rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {/* Group Header Row */}
              <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => handleExpandGroup(group.id)}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(11,127,255,0.15)", border: "1px solid rgba(11,127,255,0.2)" }}>
                  <Users size={20} style={{ color: "#0B7FFF" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{group.name}</p>
                  <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
                    {group.description || "No description"} · {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); setInviteGroupId(group.id) }}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    style={{ color: "#00E5A0" }} title="Invite member">
                    <UserPlus size={16} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); setGroupToDelete(group) }}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                    style={{ color: "#ef4444" }} title="Delete group">
                    <Trash2 size={16} />
                  </button>
                  {expandedGroup === group.id
                    ? <ChevronDown size={18} style={{ color: "#6b7fa8" }} />
                    : <ChevronRight size={18} style={{ color: "#6b7fa8" }} />}
                </div>
              </div>

              {/* Expanded Group Content */}
              {expandedGroup === group.id && (
                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  {loadingMembers[group.id] ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-[#0B7FFF]" />
                    </div>
                  ) : (
                    <div className="p-4 flex flex-col gap-4">
                      {/* Members Table */}
                      <div>
                        <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.1em" }} className="mb-3">
                          MEMBERS
                        </p>
                        {(groupMembers[group.id] ?? []).length === 0 ? (
                          <p style={{ color: "#6b7fa8", fontSize: "13px" }}>No members yet.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {(groupMembers[group.id] ?? []).map(member => (
                              <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg"
                                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                                  style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}>
                                  {member.userAvatar || member.userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-white text-sm font-medium truncate">{member.userName}</p>
                                    {/* Root badge — data comes from GroupMember which doesn't carry isRoot,
                                        so we skip it here; root badge is shown in the global team list */}
                                  </div>
                                  <p style={{ color: "#6b7fa8", fontSize: "12px" }}>{member.userEmail}</p>
                                </div>
                                {/* Any app admin can change group-member roles */}
                                {isAppAdmin ? (
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => setOpenMemberRoleDropdown(
                                        openMemberRoleDropdown === member.id ? null : member.id
                                      )}
                                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-white/10"
                                      style={{
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        color: member.role === "admin" ? "#0B7FFF" : "#6b7fa8",
                                        minWidth: "80px",
                                      }}
                                    >
                                      <span className="capitalize flex-1 text-left">{member.role}</span>
                                      <ChevronDown size={11} style={{ color: "#6b7fa8", flexShrink: 0 }} />
                                    </button>
                                    {openMemberRoleDropdown === member.id && (
                                      <div
                                        className="absolute right-0 mt-1 rounded-lg overflow-hidden z-20"
                                        style={{
                                          background: "#0d1228",
                                          border: "1px solid rgba(255,255,255,0.1)",
                                          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                                          minWidth: "110px",
                                        }}
                                      >
                                        {(["member", "admin"] as const).map(r => (
                                          <button
                                            key={r}
                                            type="button"
                                            onClick={() => {
                                              setOpenMemberRoleDropdown(null)
                                              if (r !== member.role) handleRoleChange(group.id, member.userId, r)
                                            }}
                                            className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                                            style={{
                                              color: r === member.role
                                                ? "#0B7FFF"
                                                : "#e2e8f0",
                                              fontWeight: r === member.role ? 700 : 400,
                                            }}
                                          >
                                            <span className="capitalize">{r}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="px-2 py-1 rounded text-xs capitalize"
                                    style={{ color: member.role === "admin" ? "#0B7FFF" : "#6b7fa8", background: "rgba(255,255,255,0.04)" }}>
                                    {member.role}
                                  </span>
                                )}
                                <button onClick={() => setMemberToRemove({ groupId: group.id, member })}
                                  className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                                  style={{ color: "#ef4444" }}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Group Settings */}
                      {groupSettings[group.id] && (
                        <div className="pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                          <div className="flex items-center gap-2 mb-3">
                            <Settings size={16} style={{ color: "#0B7FFF" }} />
                            <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.1em" }}>
                              GROUP SETTINGS
                            </p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { field: "allowMemberDirectory", label: "Member Directory", desc: "Members can see the group member list" },
                              { field: "allowMemberInvite", label: "Member Invitations", desc: "Group admins can invite new members" },
                              { field: "allowExternalSharing", label: "External Sharing", desc: "Files can be shared outside the group" },
                              { field: "allowGroupTransfers", label: "Group File Access", desc: "All members can see group-scoped files" },
                            ].map(({ field, label, desc }) => (
                              <div key={field} className="flex items-center justify-between p-3 rounded-lg"
                                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div>
                                  <p className="text-white text-sm font-medium">{label}</p>
                                  <p style={{ color: "#6b7fa8", fontSize: "11px" }}>{desc}</p>
                                </div>
                                <Switch
                                  checked={Boolean((groupSettings[group.id] as any)[field])}
                                  onCheckedChange={v => handleSettingChange(group.id, field, v)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Group Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-white text-xl">Create New Group</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>GROUP NAME</label>
              <input type="text" placeholder="Engineering Team" value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isCreating) handleCreateGroup() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>DESCRIPTION (optional)</label>
              <input type="text" placeholder="Responsible for backend and infrastructure" value={newGroupDesc}
                onChange={e => setNewGroupDesc(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isCreating) handleCreateGroup() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setShowCreateDialog(false)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
              Cancel
            </button>
            <button onClick={handleCreateGroup} disabled={isCreating}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isCreating && <Loader2 size={16} className="animate-spin" />}
              Create Group
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={!!inviteGroupId} onOpenChange={() => { setInviteGroupId(null); setShowRoleDropdown(false) }}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-white text-xl">Invite to Group</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>USER EMAIL</label>
              <input
                type="email"
                placeholder="user@company.com"
                value={inviteEmail}
                onChange={e => handleEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isInviting) handleInviteMember() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }}
              />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>ROLE</label>
              {isAppAdmin ? (
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setShowRoleDropdown(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#e2e8f0",
                      fontSize: "14px",
                    }}
                  >
                    <span>{inviteRole === "member" ? "Member — standard group access" : "Admin — can manage this group"}</span>
                    <ChevronDown size={14} style={{ color: "#6b7fa8", flexShrink: 0 }} />
                  </button>
                  {showRoleDropdown && (
                    <div
                      className="absolute left-0 right-0 mt-2 rounded-lg overflow-hidden z-10"
                      style={{
                        background: "#0d1228",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                      }}
                    >
                      {(["member", "admin"] as const).map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => { setInviteRole(r); setShowRoleDropdown(false) }}
                          className="w-full px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                          style={{
                            color: inviteRole === r ? "#0B7FFF" : "#e2e8f0",
                            fontSize: "14px",
                          }}
                        >
                          {r === "member" ? "Member — standard group access" : "Admin — can manage this group"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full mt-1 px-4 py-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)", fontSize: "14px" }}>
                  Member — standard group access
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setInviteGroupId(null)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
              Cancel
            </button>
            <button onClick={handleInviteMember} disabled={isInviting}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isInviting && <Loader2 size={16} className="animate-spin" />}
              Send Invite
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <AlertDialog open={!!groupToDelete} onOpenChange={() => setGroupToDelete(null)}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Group</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              Are you sure you want to delete "{groupToDelete?.name}"? All members will lose group access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGroup} disabled={isDeleting}
              className="flex items-center gap-2"
              style={{ background: "#ef4444", color: "white" }}>
              {isDeleting && <Loader2 size={16} className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Member</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              Remove {memberToRemove?.member.userEmail} from this group? Their files will remain but they will lose group access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} disabled={isRemoving}
              className="flex items-center gap-2"
              style={{ background: "#ef4444", color: "white" }}>
              {isRemoving && <Loader2 size={16} className="animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
