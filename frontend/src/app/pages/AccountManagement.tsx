import { useState, useEffect, useCallback } from "react";
import { User, Building2, Mail, Shield, Trash2, Key, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { apiRequest } from "../api/client";
import { apiGetAccount, apiChangePassword, apiDeleteAccount } from "../api/auth";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router";

interface AccountData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar: string;
  company: string;
  plan: string;
  mfaEnabled: boolean;
  joinedAt: string;
  lastActive: string;
  transfersCount: number;
  storageUsedBytes: number;
  totalUsers: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function AccountManagement() {
  const { signOut, signIn } = useAuth();
  const navigate = useNavigate();

  const [account, setAccount] = useState<AccountData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [isEditLoading, setIsEditLoading] = useState(false);

  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const loadAccount = useCallback(async () => {
    setIsLoading(true);
    const result = await apiGetAccount();
    if (result.ok) {
      setAccount(result as AccountData);
    } else {
      toast.error("Failed to load account data.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const openEditDialog = () => {
    if (!account) return;
    setEditName(account.name);
    setEditCompany(account.company);
    setShowEditDialog(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error("Name cannot be empty."); return; }
    setIsEditLoading(true);
    try {
      const updated = await apiRequest<AccountData>("/account", {
        method: "PATCH",
        body: { name: editName.trim(), company: editCompany.trim() },
      });
      setAccount((prev) => prev ? { ...prev, name: updated.name, company: updated.company } : prev);
      signIn(updated as any);
      setShowEditDialog(false);
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("All password fields are required."); return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match."); return;
    }
    setIsPasswordLoading(true);
    const result = await apiChangePassword(currentPassword, newPassword);
    if (result.ok) {
      toast.success("Password changed. All other sessions have been invalidated.");
      setShowPasswordDialog(false);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } else {
      const messages: Record<string, string> = {
        WRONG_PASSWORD: "Current password is incorrect.",
        PASSWORD_TOO_SHORT: "Password must be at least 12 characters.",
        PASSWORD_NO_UPPERCASE: "Password must contain an uppercase letter.",
        PASSWORD_NO_LOWERCASE: "Password must contain a lowercase letter.",
        PASSWORD_NO_DIGIT: "Password must contain a number.",
        PASSWORD_NO_SYMBOL: "Password must contain a special character.",
        CSRF_TOKEN_MISSING: "Session error. Please refresh the page.",
        CSRF_TOKEN_INVALID: "Session error. Please refresh the page.",
      };
      toast.error(messages[result.error] ?? result.error ?? "Failed to change password.");
    }
    setIsPasswordLoading(false);
  };

  const handleDeleteAccount = async () => {
    setIsDeleteLoading(true);
    const result = await apiDeleteAccount();
    if (result.ok) {
      toast.success("Account deleted successfully.");
      signOut();
      navigate("/signin");
    } else {
      if (result.error === "LAST_ADMIN_PROTECTED") {
        toast.error("Cannot delete account: you are the last active admin.");
      } else {
        toast.error(result.error || "Account deletion failed.");
      }
    }
    setIsDeleteLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-white/40">
        <Loader2 size={40} className="animate-spin text-[#0B7FFF]" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Account...</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p style={{ color: "#ef4444" }}>Failed to load account data.</p>
        <button onClick={loadAccount} className="flex items-center gap-2 px-4 py-2 rounded-lg text-white"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const roleColor = account.role === "admin" ? "#0B7FFF" : "#00E5A0";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold mb-1">Account Management</h1>
          <p style={{ color: "#6b7fa8", fontSize: "14px" }}>Manage your profile and account settings</p>
        </div>
        <button onClick={openEditDialog} className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "14px", fontWeight: 600 }}>
          <User size={16} /> Edit Profile
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "TRANSFERS", value: account.transfersCount, color: "#0B7FFF" },
          { label: "STORAGE USED", value: formatBytes(account.storageUsedBytes), color: "#00E5A0" },
          { label: "TEAM SIZE", value: account.role === "admin" ? account.totalUsers ?? "—" : "—", color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} className="p-4 rounded-xl"
            style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}30` }}>
            <p style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>{stat.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="p-5 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2 mb-4">
          <User size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">Profile</h2>
        </div>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", fontSize: "20px", fontWeight: 700, color: "#fff" }}>
            {account.avatar}
          </div>
          <div>
            <p className="text-white font-bold text-xl">{account.name}</p>
            <p style={{ color: "#6b7fa8", fontSize: "14px" }}>{account.email}</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded mt-1"
              style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", color: roleColor, background: `${roleColor}15`, border: `1px solid ${roleColor}30` }}>
              {account.role.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "EMAIL", value: account.email, icon: <Mail size={14} style={{ color: "#6b7fa8" }} /> },
            { label: "COMPANY", value: account.company, icon: <Building2 size={14} style={{ color: "#6b7fa8" }} /> },
            { label: "PLAN", value: account.plan },
            { label: "MFA", value: account.mfaEnabled ? "Enabled" : "Disabled",
              valueStyle: { color: account.mfaEnabled ? "#00E5A0" : "#ef4444" } },
            { label: "JOINED", value: new Date(account.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
            { label: "LAST ACTIVE", value: new Date(account.lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
          ].map(({ label, value, icon, valueStyle }) => (
            <div key={label}>
              <p style={{ color: "#4a5578", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</p>
              <div className="flex items-center gap-2 mt-1">
                {icon}
                <p style={{ color: "#e2e8f0", fontSize: "14px", textTransform: "capitalize", ...valueStyle }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-5 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">Security</h2>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-white font-medium">Password</p>
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Change your login password</p>
          </div>
          <button onClick={() => setShowPasswordDialog(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-90"
            style={{ background: "rgba(11,127,255,0.12)", border: "1px solid rgba(11,127,255,0.2)", color: "#0B7FFF", fontSize: "14px", fontWeight: 600 }}>
            <Key size={14} /> Change
          </button>
        </div>
      </section>

      <section className="p-5 rounded-xl"
        style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <h2 className="text-white font-semibold text-lg mb-1">Danger Zone</h2>
        <p style={{ color: "#6b7fa8", fontSize: "13px", marginBottom: "16px" }}>Irreversible actions. Proceed with caution.</p>
        <button onClick={() => setShowDeleteDialog(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:opacity-90"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontSize: "14px", fontWeight: 600 }}>
          <Trash2 size={16} /> Delete Account
        </button>
      </section>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-white text-xl">Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {[{ label: "FULL NAME", value: editName, setter: setEditName, type: "text" },
              { label: "COMPANY", value: editCompany, setter: setEditCompany, type: "text" }].map(({ label, value, setter, type }) => (
              <div key={label}>
                <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</label>
                <input type={type} value={value} onChange={(e) => setter(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
              </div>
            ))}
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setShowEditDialog(false)} className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>Cancel</button>
            <button onClick={handleSaveProfile} disabled={isEditLoading}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isEditLoading && <Loader2 size={16} className="animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader><DialogTitle className="text-white text-xl">Change Password</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {[{ label: "CURRENT PASSWORD", value: currentPassword, setter: setCurrentPassword },
              { label: "NEW PASSWORD", value: newPassword, setter: setNewPassword },
              { label: "CONFIRM NEW PASSWORD", value: confirmPassword, setter: setConfirmPassword }].map(({ label, value, setter }) => (
              <div key={label}>
                <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</label>
                <input type="password" value={value} onChange={(e) => setter(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "14px" }} />
              </div>
            ))}
            <p style={{ color: "#4a5578", fontSize: "12px" }}>Min 12 chars · uppercase · lowercase · number · symbol</p>
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => { setShowPasswordDialog(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}
              className="px-4 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>Cancel</button>
            <button onClick={handleChangePassword} disabled={isPasswordLoading}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isPasswordLoading && <Loader2 size={16} className="animate-spin" />} Change Password
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7fa8" }}>
              This will permanently delete your account and all uploaded files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleteLoading}
              className="flex items-center gap-2 disabled:opacity-50" style={{ background: "#ef4444", color: "white" }}>
              {isDeleteLoading && <Loader2 size={16} className="animate-spin" />} Delete My Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
