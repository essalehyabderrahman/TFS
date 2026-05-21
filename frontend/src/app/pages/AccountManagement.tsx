import { useState, useEffect, useCallback } from "react";
import { User, Building2, Mail, Shield, Trash2, Key, Loader2, RefreshCw, Copy, LogOut, Check, X, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { apiRequest } from "../api/client";
import { apiGetAccount, apiChangePassword, apiDeleteAccount, apiRegenerateBackupCode } from "../api/auth";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router";
import { csrfFetch } from "../lib/csrfFetch";

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
  backupCodeExists: boolean;
  joinedAt: string;
  lastActive: string;
  transfersCount: number;
  storageUsedBytes: number;
  totalUsers: number | null;
  groupCount: number | null;
  requireMfa: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function AccountManagement() {
  const { signOut, signIn, isRootAdmin, isPasswordResetRequired, clearPasswordResetRequired } = useAuth();
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

  const passwordRequirements = [
    { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
    { label: "Contains a number",       test: (p: string) => /\d/.test(p) },
    { label: "Lowercase & Uppercase",   test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: "Special character",       test: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(p) },
  ];
  const isNewPasswordStrong    = passwordRequirements.every(req => req.test(newPassword));
  const doesPasswordMatch      = newPassword.length > 0 && newPassword === confirmPassword;
  const isSameAsCurrent        = newPassword.length > 0 && newPassword === currentPassword;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const [showBackupRegenDialog, setShowBackupRegenDialog] = useState(false);
  const [backupRegenCode, setBackupRegenCode] = useState("");
  const [newBackupCode, setNewBackupCode] = useState<string | null>(null);
  const [isBackupRegenLoading, setIsBackupRegenLoading] = useState(false);

  const [showMfaDisableDialog, setShowMfaDisableDialog] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [isMfaDisableLoading, setIsMfaDisableLoading] = useState(false);

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

  // [Security] If a password reset is required, force the dialog open immediately
  useEffect(() => {
    if (isPasswordResetRequired && !isLoading) {
      setShowPasswordDialog(true);
      toast.info("Security Action Required: You must update your password before you can continue.", {
        id: "mandatory-reset",
        duration: Infinity,
      });
    }
    return () => { toast.dismiss("mandatory-reset"); };
  }, [isPasswordResetRequired, isLoading]);

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
      // [Fix] If this was a mandatory reset, unlock the full app layout.
      // The backend already issued a fresh cookie with password_reset_required=false,
      // so we just need to update the local auth state to match.
      if (isPasswordResetRequired) {
        clearPasswordResetRequired();
      }
    } else {
      const messages: Record<string, string> = {
        WRONG_PASSWORD: "Current password is incorrect.",
        PASSWORD_SAME_AS_CURRENT: "New password must differ from your current password.",
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
      const messages: Record<string, string> = {
        LAST_ADMIN_PROTECTED:      "Cannot delete account: you are the last active platform admin.",
        ROOT_PROTECTED:            "The root admin account cannot be deleted.",
        LAST_GROUP_ADMIN_PROTECTED: "Cannot delete account: you are the sole admin of one or more groups. Transfer group admin rights before deleting your account.",
      };
      toast.error(messages[result.error ?? ""] ?? "Account deletion failed.");
    }
    setIsDeleteLoading(false);
  };

  const handleDisableMfa = async () => {
    if (!mfaDisableCode.trim()) { toast.error("Please enter your current TOTP code."); return; }
    setIsMfaDisableLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const res = await csrfFetch(`${API_BASE_URL}/auth/mfa/disable`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaDisableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        const messages: Record<string, string> = {
          INVALID_CODE: "Invalid TOTP code.",
          MFA_MAX_ATTEMPTS_EXCEEDED: "Too many failed attempts. Please sign in again.",
          MFA_CODE_ALREADY_USED: "Code already used. Wait for the next code.",
          MFA_REQUIRED_BY_POLICY: "MFA cannot be disabled — it is enforced by platform policy.",
        };
        toast.error(messages[data.error] ?? "Failed to disable MFA.");
      } else {
        toast.success("MFA disabled. Signing you out of all sessions.");
        setShowMfaDisableDialog(false);
        setMfaDisableCode("");
        await signOut();
        navigate("/signin");
      }
    } catch { toast.error("Network error."); }
    finally { setIsMfaDisableLoading(false); }
  };

  const handleRegenerateBackupCode = async () => {
    if (!backupRegenCode.trim() || backupRegenCode.length !== 6) {
      toast.error("Please enter your 6-digit TOTP code."); return;
    }
    setIsBackupRegenLoading(true);
    const result = await apiRegenerateBackupCode(backupRegenCode);
    if (!result.ok) {
      const messages: Record<string, string> = {
        INVALID_CODE: "Invalid TOTP code.",
        MFA_MAX_ATTEMPTS_EXCEEDED: "Too many failed attempts.",
        MFA_CODE_ALREADY_USED: "Code already used. Wait for the next code.",
        TOTP_REQUIRED: "You must use a 6-digit TOTP code, not a backup code.",
        MFA_NOT_CONFIGURED: "MFA is not enabled on this account.",
      };
      toast.error(messages[result.error ?? ""] ?? "Failed to regenerate backup code.");
    } else {
      setNewBackupCode(result.backupCode ?? null);
      setBackupRegenCode("");
    }
    setIsBackupRegenLoading(false);
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
          <h1 className="text-foreground text-2xl font-bold mb-1">Account Management</h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>Manage your profile and account settings</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { signOut(); navigate("/signin"); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: "14px", fontWeight: 600 }}>
            <LogOut size={16} /> Sign Out
          </button>
          <button onClick={openEditDialog} className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white", fontSize: "14px", fontWeight: 600 }}>
            <User size={16} /> Edit Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "TRANSFERS", value: account.transfersCount, color: "#0B7FFF" },
          { label: "STORAGE USED", value: formatBytes(account.storageUsedBytes), color: "#00E5A0" },
          (() => {
            if (account.totalUsers !== null && account.totalUsers !== undefined) {
              // Root admin — show full platform headcount
              return { label: "TOTAL USERS", value: account.totalUsers, color: "#f59e0b" }
            }
            if (account.role === "admin") {
              // Regular admin — show groups they administrate
              return { label: "GROUPS MANAGED", value: account.groupCount ?? 0, color: "#f59e0b" }
            }
            // Regular user — show groups they belong to
            return { label: "MY GROUPS", value: account.groupCount ?? 0, color: "#f59e0b" }
          })(),
        ].map((stat) => (
          <div key={stat.label} className="p-4 rounded-xl"
            style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}30` }}>
            <p style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>{stat.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="p-5 rounded-xl"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <User size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-foreground font-semibold text-lg">Profile</h2>
        </div>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", fontSize: "20px", fontWeight: 700, color: "#fff" }}>
            {account.avatar}
          </div>
          <div>
            <p className="text-foreground font-bold text-xl">{account.name}</p>
            <p style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>{account.email}</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded mt-1"
              style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", color: roleColor, background: `${roleColor}15`, border: `1px solid ${roleColor}30` }}>
              {account.role.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "EMAIL", value: account.email, icon: <Mail size={14} style={{ color: "var(--muted-foreground)" }} /> },
            { label: "COMPANY", value: account.company, icon: <Building2 size={14} style={{ color: "var(--muted-foreground)" }} /> },
            { label: "PLAN", value: account.plan },
            { label: "MFA", value: account.mfaEnabled ? "Enabled" : "Disabled",
              valueStyle: { color: account.mfaEnabled ? "#00E5A0" : "#ef4444" } },
            { label: "JOINED", value: new Date(account.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
            { label: "LAST ACTIVE", value: new Date(account.lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
          ].map(({ label, value, icon, valueStyle }) => (
            <div key={label}>
              <p style={{ color: "var(--muted-foreground)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</p>
              <div className="flex items-center gap-2 mt-1">
                {icon}
                <p style={{ color: "var(--foreground)", fontSize: "14px", textTransform: "capitalize", ...valueStyle }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-5 rounded-xl"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-foreground font-semibold text-lg">Security</h2>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-foreground font-medium">Password</p>
            <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Change your login password</p>
          </div>
          <button onClick={() => setShowPasswordDialog(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-90"
            style={{ background: "rgba(11,127,255,0.12)", border: "1px solid rgba(11,127,255,0.2)", color: "#0B7FFF", fontSize: "14px", fontWeight: 600 }}>
            <Key size={14} /> Change
          </button>
        </div>
        {!account.requireMfa && (
          <div className="flex items-center justify-between py-3 border-t" style={{ borderColor: "var(--border)" }}>
            {account.mfaEnabled ? (
              <>
                <div>
                  <p className="text-foreground font-medium">Two-Factor Authentication</p>
                  <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>MFA is currently active on your account</p>
                </div>
                <button
                  onClick={() => setShowMfaDisableDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-90"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: "14px", fontWeight: 600 }}>
                  <Shield size={14} /> Disable MFA
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="text-foreground font-medium">Two-Factor Authentication</p>
                  <p style={{ color: "#ef4444", fontSize: "13px" }}>MFA is not active — your account is less secure</p>
                </div>
                <button onClick={() => navigate("/dashboard/mfa-setup")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-90"
                  style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.2)", color: "#00E5A0", fontSize: "14px", fontWeight: 600 }}>
                  <Shield size={14} /> Enable MFA
                </button>
              </>
            )}
          </div>
        )}
        
        {account.mfaEnabled && !account.requireMfa && (
          <div className="flex items-center justify-between py-3 border-t" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="text-foreground font-medium">Backup Code</p>
              <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>
                {account.backupCodeExists
                  ? "Regenerate your emergency single-use backup code"
                  : "No backup code — generate one to use if you lose access to your authenticator"}
              </p>
            </div>
            <button onClick={() => setShowBackupRegenDialog(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-90"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b", fontSize: "14px", fontWeight: 600 }}>
              <RefreshCw size={14} /> {account.backupCodeExists ? "Regenerate" : "Generate"}
            </button>
          </div>
        )}
      </section>

      {!isRootAdmin && (
        <section className="p-5 rounded-xl"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <h2 className="text-foreground font-semibold text-lg mb-1">Danger Zone</h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: "13px", marginBottom: "16px" }}>Irreversible actions. Proceed with caution.</p>
          <button onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:opacity-90"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontSize: "14px", fontWeight: 600 }}>
            <Trash2 size={16} /> Delete Account
          </button>
        </section>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid var(--border)" }}>
          <DialogHeader><DialogTitle className="text-foreground text-xl">Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {[{ label: "FULL NAME", value: editName, setter: setEditName, type: "text" },
              { label: "COMPANY", value: editCompany, setter: setEditCompany, type: "text" }].map(({ label, value, setter, type }) => (
              <div key={label}>
                <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>{label}</label>
                <input type={type} value={value} onChange={(e) => setter(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !isEditLoading) handleSaveProfile() }}
                  className="w-full mt-1 px-4 py-2.5 rounded-lg text-foreground outline-none"
                  style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px" }} />
              </div>
            ))}
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => setShowEditDialog(false)} className="px-4 py-2 rounded-lg"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>Cancel</button>
            <button onClick={handleSaveProfile} disabled={isEditLoading}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isEditLoading && <Loader2 size={16} className="animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog 
        open={showPasswordDialog} 
        onOpenChange={v => {
          // If reset is required, the user cannot close the dialog by clicking outside or pressing ESC
          if (isPasswordResetRequired) return;
          setShowPasswordDialog(v);
        }}
      >
        <DialogContent 
          onPointerDownOutside={e => { if (isPasswordResetRequired) e.preventDefault(); }}
          onEscapeKeyDown={e => { if (isPasswordResetRequired) e.preventDefault(); }}
          style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid var(--border)" }}
        >
          <DialogHeader><DialogTitle className="text-foreground text-xl">Change Password</DialogTitle></DialogHeader>
          <div className="space-y-4">

            {/* Current password */}
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>CURRENT PASSWORD</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isPasswordLoading && isNewPasswordStrong && doesPasswordMatch && !isSameAsCurrent) handleChangePassword() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-foreground outline-none"
                style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px" }} />
            </div>

            {/* New password + live requirements */}
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>NEW PASSWORD</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isPasswordLoading && isNewPasswordStrong && doesPasswordMatch && !isSameAsCurrent) handleChangePassword() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-foreground outline-none"
                style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px" }} />
              {newPassword && isSameAsCurrent && (
                <div className="flex items-center gap-2 mt-2 pl-1 animate-pulse">
                  <X size={12} style={{ color: "#ef4444" }} />
                  <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(239,68,68,0.6)" }}>
                    New password must differ from current password
                  </span>
                </div>
              )}
              {newPassword && !isSameAsCurrent && (
                <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                  {passwordRequirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {req.test(newPassword)
                        ? <Check size={10} style={{ color: "#00d2ff" }} />
                        : <div className="w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: "rgba(255,255,255,0.1)" }} />}
                      <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                        color: req.test(newPassword) ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"
                      }}>{req.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm password + match indicator */}
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>CONFIRM NEW PASSWORD</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !isPasswordLoading && isNewPasswordStrong && doesPasswordMatch && !isSameAsCurrent) handleChangePassword() }}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-foreground outline-none"
                style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px" }} />
              {confirmPassword && (
                <div className={`flex items-center gap-2 mt-1 pl-1 ${doesPasswordMatch ? "" : "animate-pulse"}`}>
                  {doesPasswordMatch ? (
                    <>
                      <ShieldCheck size={12} style={{ color: "#00d2ff" }} />
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#00d2ff" }}>
                        Passwords match
                      </span>
                    </>
                  ) : (
                    <>
                      <X size={12} style={{ color: "#ef4444" }} />
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(239,68,68,0.6)" }}>
                        Passwords do not match
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6">
            <button 
              onClick={() => { setShowPasswordDialog(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}
              disabled={isPasswordResetRequired}
              className="px-4 py-2 rounded-lg disabled:opacity-20"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              Cancel
            </button>
            <button onClick={handleChangePassword} disabled={isPasswordLoading || !isNewPasswordStrong || !doesPasswordMatch || isSameAsCurrent}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)", color: "white" }}>
              {isPasswordLoading && <Loader2 size={16} className="animate-spin" />} Change Password
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Account</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--muted-foreground)" }}>
              This will permanently delete your account and all uploaded files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleteLoading}
              className="flex items-center gap-2 disabled:opacity-50" style={{ background: "#ef4444", color: "white" }}>
              {isDeleteLoading && <Loader2 size={16} className="animate-spin" />} Delete My Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable MFA Dialog */}
      <Dialog open={showMfaDisableDialog} onOpenChange={v => { setShowMfaDisableDialog(v); setMfaDisableCode(""); }}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid var(--border)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground text-xl">Disable Two-Factor Authentication</DialogTitle>
          </DialogHeader>
          <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>
            Enter your current TOTP code from your authenticator app to confirm. All existing sessions will be invalidated.
          </p>
          <div className="mt-4">
            <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>TOTP CODE</label>
            <input type="text" maxLength={6} value={mfaDisableCode}
              onChange={e => setMfaDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => { if (e.key === "Enter" && !isMfaDisableLoading && mfaDisableCode.length === 6) handleDisableMfa() }}
              placeholder="000000"
              className="w-full mt-1 px-4 py-3 rounded-lg text-foreground text-center text-2xl tracking-[0.3em] outline-none"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)" }} />
          </div>
          <DialogFooter className="mt-6">
            <button onClick={() => { setShowMfaDisableDialog(false); setMfaDisableCode(""); }}
              className="px-4 py-2 rounded-lg"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>Cancel</button>
            <button
              onClick={handleDisableMfa}
              disabled={isMfaDisableLoading}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{ background: "#ef4444", color: "white" }}>
              {isMfaDisableLoading && <Loader2 size={16} className="animate-spin" />}
              Disable MFA
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Backup Code Dialog */}
      <Dialog open={showBackupRegenDialog} onOpenChange={v => { setShowBackupRegenDialog(v); setBackupRegenCode(""); setNewBackupCode(null); }}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid var(--border)" }}>
          <DialogHeader><DialogTitle className="text-foreground text-xl">Regenerate Backup Code</DialogTitle></DialogHeader>
          {newBackupCode ? (
            <div className="space-y-4">
              <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Your new backup code is shown below. Store it somewhere safe — it will never be shown again.</p>
              <div className="bg-black/50 border border-white/10 rounded-xl px-4 py-5 text-center font-mono text-white text-2xl tracking-[0.4em] select-all">
                {newBackupCode}
              </div>
              <button type="button" onClick={() => { navigator.clipboard.writeText(newBackupCode); toast.success("Backup code copied."); }}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-3 hover:bg-accent transition-all cursor-pointer">
                <Copy size={14} className="text-foreground/40" />
                <span className="text-foreground/70 text-[9px] uppercase font-black tracking-widest">Copy to Clipboard</span>
              </button>
              <button onClick={() => { setShowBackupRegenDialog(false); setNewBackupCode(null); }}
                className="w-full h-12 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-xl transition-all">
                I have saved it — Close
              </button>
            </div>
          ) : (
            <>
              <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Enter your current TOTP code to generate a new backup code. The old code is immediately invalidated.</p>
              <div className="mt-4">
                <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>TOTP CODE</label>
                <input type="text" maxLength={6} value={backupRegenCode}
                  onChange={e => setBackupRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter" && !isBackupRegenLoading && backupRegenCode.length === 6) handleRegenerateBackupCode() }}
                  placeholder="000000"
                  className="w-full mt-1 px-4 py-3 rounded-lg text-foreground text-center text-2xl tracking-[0.3em] outline-none"
                  style={{ background: "var(--input-background)", border: "1px solid var(--border)" }} />
              </div>
              <DialogFooter className="mt-6">
                <button onClick={() => { setShowBackupRegenDialog(false); setBackupRegenCode(""); }}
                  className="px-4 py-2 rounded-lg"
                  style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>Cancel</button>
                <button onClick={handleRegenerateBackupCode} disabled={isBackupRegenLoading}
                  className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                  style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                  {isBackupRegenLoading && <Loader2 size={16} className="animate-spin" />} Generate New Code
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
