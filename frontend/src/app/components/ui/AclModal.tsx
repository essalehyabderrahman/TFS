import { useState, useEffect } from "react"
import { X, Shield, Loader2, Check, Crown } from "lucide-react"
import { fetchAcl, grantAcl, revokeAcl, type AclEntry } from "../../api/transfers"
import { fetchGroupMembers, type GroupMember } from "../../api/groups"
import { toast } from "sonner"
import { useAuth } from "../../hooks/useAuth"

interface AclModalProps {
  transferId: string
  transferName: string
  groupId: string
  onClose: () => void
}

const PERM_LABELS = [
  { key: "canRead",     label: "Read",     color: "#10b981" },
  { key: "canWrite",    label: "Write",    color: "#3b82f6" },
  { key: "canDelete",   label: "Delete",   color: "#ef4444" },
  { key: "canShare",    label: "Share",    color: "#a855f7" },
  { key: "canDownload", label: "Download", color: "#06b6d4" },
] as const

type PermKey = typeof PERM_LABELS[number]["key"]

interface MemberRow {
  userId: string
  email: string
  name: string
  avatar: string
  role: string       // "admin" | "member"
  isOwner: boolean   // true if this user uploaded the file
  perms: Record<PermKey, boolean>
  hasAcl: boolean    // true if an explicit ACL entry exists
  aclEntryId?: string
}

export function AclModal({ transferId, transferName, groupId, onClose }: AclModalProps) {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const { user: currentUser } = useAuth()

  // Load members + existing ACLs and merge them
  useEffect(() => {
    Promise.all([fetchAcl(transferId), fetchGroupMembers(groupId)]).then(([aclRes, memRes]) => {
      if (aclRes.error || memRes.error) {
        toast.error("Failed to load permissions.")
        setLoading(false)
        return
      }

      const aclMap = new Map<string, AclEntry>()
      for (const entry of aclRes.data) {
        aclMap.set(entry.userId, entry)
      }

      const merged: MemberRow[] = memRes.data.map((m: GroupMember) => {
        const acl = aclMap.get(m.userId)
        const isAdmin = m.role === "admin"

        return {
          userId: m.userId,
          email: m.userEmail,
          name: m.userName || m.userEmail,
          avatar: m.userAvatar || (m.userName ? m.userName[0].toUpperCase() : "?"),
          role: m.role,
          isOwner: false, // will be updated if we know the uploader
          perms: isAdmin
            ? { canRead: true, canWrite: true, canDelete: true, canShare: true, canDownload: true }
            : {
                canRead:     acl?.canRead     ?? false,
                canWrite:    acl?.canWrite    ?? false,
                canDelete:   acl?.canDelete   ?? false,
                canShare:    acl?.canShare    ?? false,
                canDownload: acl?.canDownload ?? true,
              },
          hasAcl: !!acl,
          aclEntryId: acl?.id,
        }
      })

      // Sort: admins first, then by name
      merged.sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1
        if (a.role !== "admin" && b.role === "admin") return 1
        return a.name.localeCompare(b.name)
      })

      setRows(merged)
      setLoading(false)
    })
  }, [transferId, groupId])

  const togglePerm = (userId: string, key: PermKey) => {
    setRows(prev =>
      prev.map(r =>
        r.userId === userId && r.role !== "admin"
          ? { ...r, perms: { ...r.perms, [key]: !r.perms[key] } }
          : r
      )
    )
  }

  const savePerms = async (row: MemberRow) => {
    setSavingUser(row.userId)

    // If all perms are off and an ACL existed → revoke
    const allOff = !row.perms.canRead && !row.perms.canWrite && !row.perms.canDelete && !row.perms.canShare && !row.perms.canDownload
    if (allOff && row.hasAcl) {
      const res = await revokeAcl(transferId, row.userId)
      if (res.ok) {
        toast.success(`Access revoked for ${row.email}`)
        setRows(prev => prev.map(r => r.userId === row.userId ? { ...r, hasAcl: false, aclEntryId: undefined } : r))
      } else {
        toast.error("Failed to revoke access.")
      }
      setSavingUser(null)
      return
    }

    // Grant or update
    const payload = { userEmail: row.email, ...row.perms }
    const res = await grantAcl(transferId, payload)
    if (res.error) {
      toast.error(res.error === "USER_NOT_FOUND" ? "User not found." : `Error: ${res.error}`)
    } else {
      toast.success(`Permissions saved for ${row.email}`)
      setRows(prev => prev.map(r => r.userId === row.userId ? { ...r, hasAcl: true } : r))
    }
    setSavingUser(null)
  }



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(var(--background))" }} onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col gap-0 overflow-hidden"
        style={{ background: "var(--card-background)", border: "1px solid var(--border)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Shield size={16} style={{ color: "#a855f7" }} />
            <p className="font-bold text-sm truncate max-w-[400px]" style={{color: "var(--foreground)"}}>Permissions — {transferName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X size={16} style={{ color: "#64748b" }} />
          </button>
        </div>

        {/* Description */}
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <p className="text-[11px] text-[#64748b]">
            Manage file access for all group members. Admins always have full access. Click permissions to toggle, then save.
          </p>
        </div>

        {/* Member list */}
        <div className="p-5 flex flex-col gap-2 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-[#a855f7]" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-[#475569] py-6 text-center">No members found in this group.</p>
          ) : (
            <>
              {/* Column headers */}
              <div className="flex items-center gap-3 px-3 py-2 mb-1">
                <div className="flex-1 text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Member</div>
                <div className="flex gap-1.5">
                  {PERM_LABELS.map(({ label, color }) => (
                    <div key={label} className="w-[58px] text-center text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
                  ))}
                </div>
                <div className="w-[60px]" />
              </div>

              {rows.map(row => {
                const isAdmin = row.role === "admin"
                const isSelf = row.userId === currentUser?.id

                return (
                  <div
                    key={row.userId}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                    style={{
                      background: isAdmin ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isAdmin ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.05)"}`,
                    }}
                  >
                    {/* Avatar + Name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: isAdmin ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.08)",
                          color: isAdmin ? "#a855f7" : "#94a3b8",
                        }}
                      >
                        {row.avatar}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate" style={{color: "var(--foreground)"}}>{row.name}</p>
                          {isAdmin && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#a855f7] bg-purple-500/10 px-1.5 py-0.5 rounded">
                              <Crown size={9} /> Admin
                            </span>
                          )}
                          {isSelf && (
                            <span className="text-[9px] font-bold text-[#64748b] bg-white/5 px-1.5 py-0.5 rounded">You</span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#475569] truncate">{row.email}</p>
                      </div>
                    </div>

                    {/* Permission toggles */}
                    <div className="flex gap-1.5">
                      {PERM_LABELS.map(({ key, color }) => {
                        const active = row.perms[key]
                        const disabled = isAdmin // admins always have full access

                        return (
                          <button
                            key={key}
                            onClick={() => !disabled && togglePerm(row.userId, key)}
                            disabled={disabled}
                            className="w-[58px] h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all"
                            style={{
                              background: active ? `${color}15` : "rgba(255,255,255,0.02)",
                              border: `1px solid ${active ? `${color}44` : "rgba(255,255,255,0.06)"}`,
                              color: active ? color : "#334155",
                              cursor: disabled ? "default" : "pointer",
                              opacity: disabled ? 0.6 : 1,
                            }}
                          >
                            {active && <Check size={13} strokeWidth={3} />}
                          </button>
                        )
                      })}
                    </div>

                    {/* Save button */}
                    <div className="w-[60px] flex justify-center">
                      {!isAdmin && (
                        <button
                          onClick={() => savePerms(row)}
                          disabled={savingUser === row.userId}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                          style={{
                            background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                            color: "white",
                            opacity: savingUser === row.userId ? 0.5 : 1,
                          }}
                        >
                          {savingUser === row.userId ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
