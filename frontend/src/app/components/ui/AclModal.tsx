import { useState, useEffect } from "react"
import { X, Shield, Trash2, Loader2, Plus, Check, Users } from "lucide-react"
import { fetchAcl, grantAcl, revokeAcl, type AclEntry } from "../../api/transfers"
import { fetchGroupMembers, type GroupMember } from "../../api/groups"
import { toast } from "sonner"

interface AclModalProps {
  transferId: string
  transferName: string
  groupId: string
  onClose: () => void
}

const PERM_LABELS = [
  { key: "canRead",   label: "Read",   color: "#10b981" },
  { key: "canWrite",  label: "Write",  color: "#3b82f6" },
  { key: "canDelete", label: "Delete", color: "#ef4444" },
  { key: "canShare",  label: "Share",  color: "#a855f7" },
] as const

export function AclModal({ transferId, transferName, groupId, onClose }: AclModalProps) {
  const [entries, setEntries] = useState<AclEntry[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const [email, setEmail] = useState("")
  const [perms, setPerms] = useState({ canRead: true, canWrite: false, canDelete: false, canShare: false })

  useEffect(() => {
    Promise.all([fetchAcl(transferId), fetchGroupMembers(groupId)]).then(([aclRes, memRes]) => {
      if (!aclRes.error) setEntries(aclRes.data)
      if (!memRes.error) setMembers(memRes.data)
      setLoading(false)
    })
  }, [transferId, groupId])

  const handleGrant = async (applyToAll = false) => {
    if (!applyToAll && !email.trim()) return toast.error("Enter a user email.")
    setSaving(true)
    const payload = applyToAll 
      ? { applyToAll: true, ...perms } 
      : { userEmail: email.trim(), ...perms }
      
    const res = await grantAcl(transferId, payload)
    if (res.error) {
      const errorMessages: Record<string, string> = {
        USER_NOT_FOUND: "User not found.",
        EXTERNAL_SHARING_DISABLED: "Sharing outside this group is disabled by the administrator.",
        CANNOT_GRANT_TO_SELF: "You cannot grant permissions to yourself.",
      }
      toast.error(errorMessages[res.error] ?? res.error)
    } else {
      toast.success(applyToAll ? "Permissions applied to all members." : "Permissions saved.")
      setEmail("")
      setPerms({ canRead: true, canWrite: false, canDelete: false, canShare: false })
      const updated = await fetchAcl(transferId)
      if (!updated.error) setEntries(updated.data)
    }
    setSaving(false)
  }

  const handleRevoke = async (userId: string) => {
    setRevoking(userId)
    const res = await revokeAcl(transferId, userId)
    if (res.ok) {
      toast.success("Access revoked.")
      setEntries(prev => prev.filter(e => e.userId !== userId))
    } else {
      toast.error("Failed to revoke access.")
    }
    setRevoking(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-lg rounded-2xl flex flex-col gap-0 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Shield size={16} style={{ color: "#a855f7" }} />
            <p className="text-white font-bold text-sm truncate max-w-[300px]">Permissions — {transferName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={16} style={{ color: "#64748b" }} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">

          {/* Add / Edit permission */}
          <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest">Grant Access</p>

            {/* Email input with datalist */}
            <input
              list="member-emails"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="member@email.com"
              className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <datalist id="member-emails">
              {members.map(m => <option key={m.id} value={m.userEmail} />)}
            </datalist>

            {/* Permission toggles */}
            <div className="flex gap-2 flex-wrap">
              {PERM_LABELS.map(({ key, label, color }) => {
                const active = perms[key as keyof typeof perms]
                return (
                  <button
                    key={key}
                    onClick={() => setPerms(p => ({ ...p, [key]: !p[key as keyof typeof perms] }))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: active ? `${color}1a` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? `${color}55` : "rgba(255,255,255,0.08)"}`,
                      color: active ? color : "#64748b",
                    }}
                  >
                    {active && <Check size={11} />}
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleGrant(false)}
                disabled={saving || !email.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)" }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Grant to User
              </button>
              
              <button
                onClick={() => handleGrant(true)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold text-[#a855f7] transition-all disabled:opacity-40 hover:bg-purple-500/10"
                style={{ border: "1px solid rgba(168,85,247,0.4)" }}
                title="Apply these permissions to all members"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                Apply to All
              </button>
            </div>
          </div>

          {/* Current ACL list */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest">Current Access</p>

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={24} className="animate-spin text-[#a855f7]" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-xs text-[#475569] py-3">No specific permissions set. File is public within the group.</p>
            ) : entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{entry.userEmail}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {PERM_LABELS.filter(({ key }) => entry[key as keyof AclEntry]).map(({ key, label, color }) => (
                      <span key={key} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ color, background: `${color}1a`, border: `1px solid ${color}33` }}>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(entry.userId)}
                  disabled={revoking === entry.userId}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors ml-2 shrink-0"
                >
                  {revoking === entry.userId
                    ? <Loader2 size={14} className="animate-spin text-[#64748b]" />
                    : <Trash2 size={14} style={{ color: "#ef4444" }} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
