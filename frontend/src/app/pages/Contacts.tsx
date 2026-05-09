import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  Star, Users, Send, Download, UserPlus, Trash2,
  Loader2, Search, Edit2, Check, X, ExternalLink,
  Heart, Mail
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog"
import {
  fetchContacts, addContact, updateContact, deleteContact,
  type Contact, type ContactsResponse,
} from "../api/contacts"
import { useNavigate } from "react-router"
import { useAuth } from "../hooks/useAuth"

const SECTION_META: {
  key: keyof Omit<ContactsResponse, "all">
  label: string
  icon: React.ReactNode
  accent: string
  emptyText: string
}[] = [
  { key: "favorites",    label: "Favorites",     icon: <Star size={16} />,     accent: "#f59e0b", emptyText: "Star a contact to pin them here." },
  { key: "friends",      label: "Friends",       icon: <Heart size={16} />,    accent: "#0B7FFF", emptyText: "Add a friend to see them here." },
  { key: "sentTo",       label: "Sent To",       icon: <Send size={16} />,     accent: "#00E5A0", emptyText: "People you have sent files to will appear here automatically." },
  { key: "receivedFrom", label: "Received From", icon: <Download size={16} />, accent: "#a78bfa", emptyText: "People who have sent files to you will appear here automatically." },
]

function ContactCard({
  contact,
  onToggleFavorite,
  onToggleFriend,
  onDelete,
  onEdit,
  onQuickTransfer,
}: {
  contact: Contact
  onToggleFavorite: (c: Contact) => void
  onToggleFriend: (c: Contact) => void
  onDelete: (c: Contact) => void
  onEdit: (c: Contact) => void
  onQuickTransfer: (email: string) => void
}) {
  const initials = (contact.displayName || contact.email).slice(0, 2).toUpperCase()

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-white/5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white text-sm font-semibold truncate">{contact.displayName}</p>
          {contact.isExternal && (
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#6b7fa8", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "4px" }}>
              EXTERNAL
            </span>
          )}
        </div>
        {contact.nickname && contact.nickname !== contact.name && (
          <p style={{ color: "#4a5578", fontSize: "11px" }}>{contact.email}</p>
        )}
        {!contact.nickname && (
          <p style={{ color: "#4a5578", fontSize: "11px" }}>{contact.email}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onToggleFavorite(contact)}
          title={contact.isFavorite ? "Remove from favorites" : "Add to favorites"}
          className="p-1.5 rounded-lg transition-colors hover:bg-amber-500/10"
          style={{ color: contact.isFavorite ? "#f59e0b" : "#3d4f6e" }}
        >
          <Star size={14} fill={contact.isFavorite ? "#f59e0b" : "none"} />
        </button>
        <button
          onClick={() => onToggleFriend(contact)}
          title={contact.isFriend ? "Remove from friends" : "Add to friends"}
          className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
          style={{ color: contact.isFriend ? "#0B7FFF" : "#3d4f6e" }}
        >
          <Heart size={14} fill={contact.isFriend ? "#0B7FFF" : "none"} />
        </button>
        <button
          onClick={() => onEdit(contact)}
          title="Set nickname"
          className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: "#6b7fa8" }}
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={() => onQuickTransfer(contact.email)}
          title="Send file to this contact"
          className="p-1.5 rounded-lg transition-colors hover:bg-green-500/10"
          style={{ color: "#00E5A0" }}
        >
          <Send size={13} />
        </button>
        <button
          onClick={() => onDelete(contact)}
          title="Remove contact"
          className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
          style={{ color: "#ef4444" }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export function Contacts() {
  const navigate = useNavigate()
  const { isAppAdmin, isGroupAdmin } = useAuth()
  const [data, setData]         = useState<ContactsResponse | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [search, setSearch]     = useState("")

  // Add dialog
  const [showAdd, setShowAdd]         = useState(false)
  const [addEmail, setAddEmail]       = useState("")
  const [addNickname, setAddNickname] = useState("")
  const [isAdding, setIsAdding]       = useState(false)

  // Edit nickname dialog
  const [editTarget, setEditTarget]     = useState<Contact | null>(null)
  const [editNickname, setEditNickname] = useState("")
  const [isSavingNick, setIsSavingNick] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const [isDeleting, setIsDeleting]     = useState(false)

  useEffect(() => {
    fetchContacts().then(res => {
      if (!res.error && res.data) setData(res.data)
      else toast.error("Failed to load contacts.")
      setLoading(false)
    })
  }, [])

  function applyUpdate(updated: Contact) {
    if (!data) return
    const replace = (list: Contact[]) =>
      list.map(c => c.id === updated.id ? updated : c)
    setData({
      all:          replace(data.all),
      favorites:    replace(data.favorites),
      friends:      replace(data.friends),
      sentTo:       replace(data.sentTo),
      receivedFrom: replace(data.receivedFrom),
    })
    // Re-sort sections
    rebucket(data.all.map(c => c.id === updated.id ? updated : c))
  }

  function rebucket(all: Contact[]) {
    const favorites: Contact[]    = []
    const friends: Contact[]      = []
    const sentTo: Contact[]       = []
    const receivedFrom: Contact[] = []
    const seen = new Set<string>()
    const add = (bucket: Contact[], c: Contact) => {
      if (!seen.has(c.id)) { seen.add(c.id); bucket.push(c) }
    }
    for (const c of all) {
      if (c.isFavorite)              add(favorites, c)
      else if (c.isFriend)           add(friends, c)
      else if (c.source === "sent_to")       add(sentTo, c)
      else if (c.source === "received_from") add(receivedFrom, c)
    }
    setData({ all, favorites, friends, sentTo, receivedFrom })
  }

  async function handleToggleFavorite(contact: Contact) {
    const res = await updateContact(contact.id, { isFavorite: !contact.isFavorite })
    if (res.data) applyUpdate(res.data)
    else toast.error("Failed to update contact.")
  }

  async function handleToggleFriend(contact: Contact) {
    const res = await updateContact(contact.id, { isFriend: !contact.isFriend })
    if (res.data) { applyUpdate(res.data); rebucket(data!.all.map(c => c.id === res.data!.id ? res.data! : c)) }
    else toast.error("Failed to update contact.")
  }

  async function handleAdd() {
    if (!addEmail.trim()) { toast.error("Email is required."); return }
    setIsAdding(true)
    const res = await addContact(addEmail.trim(), addNickname.trim() || undefined)
    if (res.error) {
      const messages: Record<string, string> = {
        MISSING_EMAIL:       "Email is required.",
        CANNOT_ADD_SELF:     "You cannot add yourself as a contact.",
        ALREADY_IN_CONTACTS: "This person is already in your contacts.",
      }
      toast.error(messages[res.error] ?? "Failed to add contact.")
    } else {
      toast.success(`${addEmail} added to contacts.`)
      const newAll = [res.data!, ...(data?.all ?? [])]
      rebucket(newAll)
      setShowAdd(false)
      setAddEmail("")
      setAddNickname("")
    }
    setIsAdding(false)
  }

  async function handleSaveNickname() {
    if (!editTarget) return
    setIsSavingNick(true)
    const res = await updateContact(editTarget.id, { nickname: editNickname })
    if (res.data) { applyUpdate(res.data); toast.success("Nickname saved.") }
    else toast.error("Failed to save nickname.")
    setIsSavingNick(false)
    setEditTarget(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const res = await deleteContact(deleteTarget.id)
    if (res.ok) {
      toast.success("Contact removed.")
      const newAll = data!.all.filter(c => c.id !== deleteTarget.id)
      rebucket(newAll)
      setDeleteTarget(null)
    } else {
      toast.error("Failed to remove contact.")
    }
    setIsDeleting(false)
  }

  function handleQuickTransfer(email: string) {
    // Navigate to active transfers with the recipient pre-filled via query param
    navigate(`/dashboard/active?recipient=${encodeURIComponent(email)}`)
  }

  const filtered = (list: Contact[]) =>
    search
      ? list.filter(c =>
          c.email.toLowerCase().includes(search.toLowerCase()) ||
          (c.displayName || "").toLowerCase().includes(search.toLowerCase())
        )
      : list

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-white/40">
        <Loader2 size={40} className="animate-spin text-[#0B7FFF]" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Contacts...</p>
      </div>
    )
  }

  const totalContacts = data?.all.length ?? 0

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Contacts</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
            People you transfer files with — for faster, easier sharing
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(11,127,255,0.08)", border: "1px solid rgba(11,127,255,0.2)" }}>
            <Users size={14} style={{ color: "#0B7FFF" }} />
            <span style={{ color: "#0B7FFF", fontSize: "13px", fontWeight: 600 }}>
              {totalContacts} contact{totalContacts !== 1 ? "s" : ""}
            </span>
          </div>
          {(isAppAdmin || isGroupAdmin) && (
            <button
              onClick={() => navigate("/dashboard/users")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}
            >
              <Users size={16} /> Team Directory
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "14px", fontWeight: 600 }}
          >
            <UserPlus size={16} /> Add Contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b7fa8" }} />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }}
        />
      </div>

      {/* Sections */}
      {totalContacts === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl gap-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Mail size={48} style={{ color: "#3d4f6e" }} />
          <p style={{ color: "#6b7fa8", fontSize: "15px" }}>No contacts yet.</p>
          <p style={{ color: "#4a5578", fontSize: "13px" }}>
            Contacts are added automatically when you send or receive files. You can also add them manually.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {SECTION_META.map(({ key, label, icon, accent, emptyText }) => {
            const list = filtered(data?.[key] ?? [])
            if (!search && list.length === 0) return null
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: accent }}>{icon}</span>
                  <h2 style={{ fontSize: "13px", color: "#3d4f6e", fontWeight: 700, letterSpacing: "0.1em" }}>
                    {label.toUpperCase()}
                  </h2>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ color: accent, background: `${accent}18` }}>
                    {list.length}
                  </span>
                  <div className="flex-1" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
                </div>
                {list.length === 0 ? (
                  <p style={{ color: "#4a5578", fontSize: "13px", paddingLeft: "4px" }}>{emptyText}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {list.map(contact => (
                      <ContactCard
                        key={contact.id}
                        contact={contact}
                        onToggleFavorite={handleToggleFavorite}
                        onToggleFriend={handleToggleFriend}
                        onDelete={setDeleteTarget}
                        onEdit={c => { setEditTarget(c); setEditNickname(c.nickname ?? "") }}
                        onQuickTransfer={handleQuickTransfer}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Add Contact Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { setShowAdd(v); setAddEmail(""); setAddNickname("") }}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-white text-xl">Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>EMAIL</label>
              <input type="email" placeholder="contact@example.com" value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isAdding) handleAdd() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>NICKNAME (optional)</label>
              <input type="text" placeholder="e.g. Mike from Legal" value={addNickname}
                onChange={e => setAddNickname(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isAdding) handleAdd() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>Cancel</button>
            <button onClick={handleAdd} disabled={isAdding}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isAdding && <Loader2 size={16} className="animate-spin" />} Add Contact
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Nickname Dialog */}
      <Dialog open={!!editTarget} onOpenChange={v => { if (!v) setEditTarget(null) }}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-white text-xl">Set Nickname</DialogTitle></DialogHeader>
          <p style={{ color: "#6b7fa8", fontSize: "13px" }}>{editTarget?.email}</p>
          <div className="mt-2">
            <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>NICKNAME</label>
            <input type="text" placeholder="Leave blank to clear" value={editNickname}
              onChange={e => setEditNickname(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !isSavingNick) handleSaveNickname() }}
              className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>Cancel</button>
            <button onClick={handleSaveNickname} disabled={isSavingNick}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isSavingNick && <Loader2 size={16} className="animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Contact</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              Remove {deleteTarget?.displayName} ({deleteTarget?.email}) from your contacts? This does not affect your transfer history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}
              className="flex items-center gap-2"
              style={{ background: "#ef4444", color: "white" }}>
              {isDeleting && <Loader2 size={16} className="animate-spin" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
