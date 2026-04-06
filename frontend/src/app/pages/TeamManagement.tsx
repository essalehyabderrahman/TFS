import { useState } from "react";
import { UserPlus, Trash2, Edit, Eye, Search, MoreVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { format } from "date-fns";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "pending" | "suspended";
  joinedAt: Date;
  lastActive: Date;
  transfersCount: number;
  avatar: string;
}

const mockTeamMembers: TeamMember[] = [
  {
    id: "tm1",
    name: "Admin User",
    email: "admin@company.com",
    role: "admin",
    status: "active",
    joinedAt: new Date(2025, 0, 15),
    lastActive: new Date(2026, 2, 6, 10, 15),
    transfersCount: 234,
    avatar: "AU",
  },
  {
    id: "tm2",
    name: "Sarah Chen",
    email: "sarah.chen@company.com",
    role: "editor",
    status: "active",
    joinedAt: new Date(2025, 2, 10),
    lastActive: new Date(2026, 2, 6, 9, 45),
    transfersCount: 187,
    avatar: "SC",
  },
  {
    id: "tm3",
    name: "Michael Roberts",
    email: "michael.roberts@company.com",
    role: "editor",
    status: "active",
    joinedAt: new Date(2025, 4, 22),
    lastActive: new Date(2026, 2, 5, 16, 30),
    transfersCount: 142,
    avatar: "MR",
  },
  {
    id: "tm4",
    name: "Emily Zhang",
    email: "emily.zhang@company.com",
    role: "viewer",
    status: "active",
    joinedAt: new Date(2025, 6, 8),
    lastActive: new Date(2026, 2, 6, 8, 20),
    transfersCount: 56,
    avatar: "EZ",
  },
  {
    id: "tm5",
    name: "David Martinez",
    email: "david.martinez@company.com",
    role: "editor",
    status: "active",
    joinedAt: new Date(2025, 8, 12),
    lastActive: new Date(2026, 2, 5, 14, 10),
    transfersCount: 98,
    avatar: "DM",
  },
  {
    id: "tm6",
    name: "Lisa Johnson",
    email: "lisa.johnson@company.com",
    role: "viewer",
    status: "pending",
    joinedAt: new Date(2026, 2, 5),
    lastActive: new Date(2026, 2, 5, 15, 20),
    transfersCount: 0,
    avatar: "LJ",
  },
];

export function TeamManagement() {
  const [members, setMembers] = useState<TeamMember[]>(mockTeamMembers);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [viewMember, setViewMember] = useState<TeamMember | null>(null);
  const [roleMember, setRoleMember] = useState<TeamMember | null>(null);
  const [roleSelection, setRoleSelection] = useState<"admin" | "editor" | "viewer">("viewer");

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "#0B7FFF";
      case "editor":
        return "#00E5A0";
      case "viewer":
        return "#6b7fa8";
      default:
        return "#6b7fa8";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "#00E5A0";
      case "pending":
        return "#f59e0b";
      case "suspended":
        return "#ef4444";
      default:
        return "#6b7fa8";
    }
  };

  const handleInvite = () => {
    console.log("Inviting:", inviteEmail, "as", inviteRole);
    setShowInviteDialog(false);
    setInviteEmail("");
    setInviteRole("viewer");
  };

  const handleDelete = (id: string) => {
    setMembers(members.filter(m => m.id !== id));
    setMemberToDelete(null);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Team Management</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
            Manage team members and their access permissions
          </p>
        </div>
        <button
          onClick={() => setShowInviteDialog(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
            color: "white",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          <UserPlus size={16} />
          Invite Member
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(11,127,255,0.08)",
            border: "1px solid rgba(11,127,255,0.2)",
          }}
        >
          <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
            TOTAL MEMBERS
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#0B7FFF" }}>
            {members.length}
          </p>
        </div>

        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(0,229,160,0.08)",
            border: "1px solid rgba(0,229,160,0.2)",
          }}
        >
          <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
            ACTIVE
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#00E5A0" }}>
            {members.filter(m => m.status === "active").length}
          </p>
        </div>

        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
            PENDING
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#f59e0b" }}>
            {members.filter(m => m.status === "pending").length}
          </p>
        </div>

        <div
          className="p-4 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
            ADMINS
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#e2e8f0" }}>
            {members.filter(m => m.role === "admin").length}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b7fa8" }} />
        <input
          type="text"
          placeholder="Search members..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: "14px",
          }}
        />
      </div>

      {/* Team Members Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredMembers.map((member) => (
          <div
            key={member.id}
            className="p-4 rounded-xl transition-all hover:bg-white/5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {member.avatar}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{member.name}</p>
                    <p style={{ color: "#6b7fa8", fontSize: "13px" }} className="truncate">{member.email}</p>
                  </div>
                  <button
                    onClick={() => setSelectedMember(member)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0"
                    style={{ color: "#6b7fa8" }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded"
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: getRoleColor(member.role),
                      background: `${getRoleColor(member.role)}15`,
                      border: `1px solid ${getRoleColor(member.role)}30`,
                    }}
                  >
                    {member.role.toUpperCase()}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded"
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: getStatusColor(member.status),
                      background: `${getStatusColor(member.status)}15`,
                      border: `1px solid ${getStatusColor(member.status)}30`,
                    }}
                  >
                    {member.status.toUpperCase()}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      JOINED
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "12px" }}>
                      {format(member.joinedAt, "MMM d, yy")}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      LAST ACTIVE
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "12px" }}>
                      {format(member.lastActive, "MMM d")}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      TRANSFERS
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "12px" }}>
                      {member.transfersCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white placeholder:text-slate-500 outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                ROLE
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              >
                <option value="viewer">Viewer - Can only view files</option>
                <option value="editor">Editor - Can upload and manage files</option>
                <option value="admin">Admin - Full access to all features</option>
              </select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowInviteDialog(false)}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#e2e8f0",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                color: "white",
              }}
            >
              Send Invitation
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Actions Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {selectedMember && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-xl">Member Actions</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-white/5 text-left"
                  style={{ color: "#e2e8f0" }}
                  onClick={() => {
                    setViewMember(selectedMember);
                    setSelectedMember(null);
                  }}
                >
                  <Eye size={18} />
                  View Details
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-white/5 text-left"
                  style={{ color: "#e2e8f0" }}
                  onClick={() => {
                    setRoleMember(selectedMember);
                    setRoleSelection(selectedMember.role);
                    setSelectedMember(null);
                  }}
                >
                  <Edit size={18} />
                  Edit Role
                </button>
                <button
                  onClick={() => {
                    setMemberToDelete(selectedMember.id);
                    setSelectedMember(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-red-500/10 text-left"
                  style={{ color: "#ef4444" }}
                >
                  <Trash2 size={18} />
                  Remove Member
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View Member Details Dialog */}
      <Dialog open={!!viewMember} onOpenChange={() => setViewMember(null)}>
        <DialogContent
          className="sm:max-w-lg"
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "90vh",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(11,127,255,0.2) transparent",
          }}
        >
          {viewMember && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-xl">Member Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {viewMember.avatar}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-lg">{viewMember.name}</p>
                    <p style={{ color: "#6b7fa8", fontSize: "14px" }}>{viewMember.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      ROLE
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "14px", textTransform: "capitalize" }}>
                      {viewMember.role}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      STATUS
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "14px", textTransform: "capitalize" }}>
                      {viewMember.status}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      JOINED
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "14px" }}>
                      {format(viewMember.joinedAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      LAST ACTIVE
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "14px" }}>
                      {format(viewMember.lastActive, "MMM d, yyyy")}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>
                      TRANSFERS
                    </p>
                    <p style={{ color: "#e2e8f0", fontSize: "14px" }}>
                      {viewMember.transfersCount}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!roleMember} onOpenChange={() => setRoleMember(null)}>
        <DialogContent
          className="sm:max-w-md"
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {roleMember && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-xl">Edit Role</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-white font-semibold">{roleMember.name}</p>
                  <p style={{ color: "#6b7fa8", fontSize: "13px" }}>{roleMember.email}</p>
                </div>
                <div>
                  <label
                    style={{
                      color: "#64748b",
                      fontSize: "12px",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                    }}
                  >
                    ROLE
                  </label>
                  <select
                    value={roleSelection}
                    onChange={(e) => setRoleSelection(e.target.value as "admin" | "editor" | "viewer")}
                    className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                    style={{
                      background: "rgba(15,23,42,0.9)",
                      border: "1px solid rgba(148,163,184,0.4)",
                      fontSize: "14px",
                    }}
                  >
                    <option value="viewer">Viewer - Can only view files</option>
                    <option value="editor">Editor - Can upload and manage files</option>
                    <option value="admin">Admin - Full access to all features</option>
                  </select>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <button
                  onClick={() => setRoleMember(null)}
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e2e8f0",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setMembers((prev) =>
                      prev.map((m) =>
                        m.id === roleMember.id ? { ...m, role: roleSelection } : m,
                      ),
                    );
                    setRoleMember(null);
                  }}
                  className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                    color: "white",
                  }}
                >
                  Save Role
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              Are you sure you want to remove this team member? They will lose access to all shared files and transfers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#e2e8f0",
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToDelete && handleDelete(memberToDelete)}
              style={{
                background: "#ef4444",
                color: "white",
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
