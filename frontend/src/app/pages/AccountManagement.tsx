import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Mail, Building, CreditCard, Crown, Download, Upload, HardDrive, Calendar, Settings, LogOut, Loader2, Key, Smartphone, AlertTriangle, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { format, parseISO } from "date-fns";
import { apiGetAccount, apiChangePassword, apiDeleteAccount, apiRegenerateBackupCode } from "../api/auth";
import { apiRequest } from "../api/client";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";

interface UserProfile {
  name: string;
  email: string;
  company: string;
  role: "admin" | "editor" | "viewer";
  plan: "free" | "pro" | "enterprise";
  joinDate: Date;
  avatar: string;
}

interface UsageStats {
  transfersCount: number;
  storageUsedBytes: number;
  storageLimit: number;
  downloadsCount: number;
}

export function AccountManagement() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBillingDialog, setShowBillingDialog] = useState(false);
  const [editedProfile, setEditedProfile] = useState<{name: string, email: string, company: string}>({
    name: "",
    email: "",
    company: ""
  });
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [orgCompany, setOrgCompany] = useState("");
  const [orgTeamSize, setOrgTeamSize] = useState("6");

  // Security States
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [regenStep, setRegenStep] = useState<"idle" | "warning" | "confirming" | "revealed">("idle");
  const [regenCode, setRegenCode] = useState("");
  const [newBackupCode, setNewBackupCode] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);

  const handleRegenConfirm = async () => {
    if (regenCode.length !== 6) {
      toast.error("Please enter your 6-digit authenticator code");
      return;
    }
    setRegenLoading(true);
    const result = await apiRegenerateBackupCode(regenCode);
    setRegenLoading(false);
    if (!result.ok) {
      const messages: Record<string, string> = {
        INVALID_CODE:             "Invalid authenticator code.",
        TOTP_REQUIRED:            "You must use your authenticator app code, not a backup code.",
        MFA_CODE_ALREADY_USED:    "This code was already used. Wait 30 seconds for the next one.",
        MFA_MAX_ATTEMPTS_EXCEEDED:"Too many failed attempts. Please sign in again to reset your session.",
        TOO_MANY_REQUESTS:        "You cannot regenerate your backup code for the next hour. Please try again later.",
        NETWORK_ERROR:            "Cannot reach the server. Please try again.",
      };
      toast.error(messages[result.error ?? ""] ?? "Regeneration failed. Please try again.");
      return;
    }
    setNewBackupCode(result.backupCode ?? null);
    setRegenCode("");
    setRegenStep("revealed");
  };

  const loadAccount = async () => {
    setIsLoading(true);
    const res = await apiGetAccount();
    if (res.ok) {
      setProfile({
        name: res.name,
        email: res.email,
        company: res.company || "Individual",
        role: res.role,
        plan: res.plan || "free",
        joinDate: res.joinedAt ? parseISO(res.joinedAt) : new Date(),
        avatar: res.avatar,
      });
      setUsage({
        transfersCount: res.transfersCount || 0,
        storageUsedBytes: res.storageUsedBytes || 0,
        storageLimit: res.plan === "pro" ? 100 * 1024**3 : res.plan === "enterprise" ? 1000 * 1024**3 : 10 * 1024**3,
        downloadsCount: res.downloadsCount || 0, // Not strictly in backend yet but ready
      });
    } else {
      toast.error("Security Node failure: Access to account vault denied.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAccount();
  }, []);

  const handleSaveProfile = async () => {
    try {
      const res = await apiRequest<any>("/account", {
        method: "PATCH",
        body: {
          name: editedProfile.name,
          email: editedProfile.email,
          company: editedProfile.company
        }
      });
      setProfile(prev => prev ? { ...prev, ...res } : null);
      toast.success("Identity record updated in central vault.");
      setShowEditDialog(false);
      loadAccount(); // Refresh
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile.");
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case "enterprise":
        return "#0B7FFF";
      case "pro":
        return "#00E5A0";
      case "free":
        return "#6b7fa8";
      default:
        return "#6b7fa8";
    }
  };

  const passwordRequirements = [
    { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
    { label: "Contains a number", test: (p: string) => /\d/.test(p) },
    { label: "Lowercase & Uppercase", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: "Special character", test: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(p) },
  ];

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
        toast.error("New passwords do not match.");
        return;
    }
    
    // Find the first requirement that isn't met
    const failedReq = passwordRequirements.find(req => !req.test(passwords.new));
    if (failedReq) {
        toast.error(`Security requirement not met: ${failedReq.label}`);
        return;
    }
    const res = await apiChangePassword(passwords.current, passwords.new);
    if(res.ok) {
        toast.success("Security key updated globally.");
        setShowPasswordDialog(false);
        setPasswords({ current: "", new: "", confirm: "" });
    } else {
        const messages: Record<string, string> = {
          WRONG_PASSWORD:        "Current security key is incorrect.",
          PASSWORD_TOO_SHORT:    "New password must be at least 12 characters.",
          PASSWORD_NO_UPPERCASE: "New password must contain an uppercase letter.",
          PASSWORD_NO_LOWERCASE: "New password must contain a lowercase letter.",
          PASSWORD_NO_DIGIT:     "New password must contain a number.",
          PASSWORD_NO_SYMBOL:    "New password must contain a special character.",
          NETWORK_ERROR:         "Cannot reach the server. Please try again.",
        };
        const message = messages[res.error ?? ""] ?? "Failed to update security key.";
        toast.error(message);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== profile?.email) {
        toast.error("Confirmation signature failed. Deletion aborted.");
        return;
    }
    const res = await apiDeleteAccount();
    if(res.ok) {
        toast.success("Account and associated data structurally eliminated.");
        signOut();
    } else {
        toast.error(res.error || "Execution failed.");
    }
  };

  const getPlanName = (plan: string) => {
    switch (plan) {
      case "enterprise":
        return "Enterprise";
      case "pro":
        return "Pro";
      case "free":
        return "Free";
      default:
        return plan;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };



  if (isLoading || !profile || !usage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-blue-500" size={40} />
        <p className="text-slate-400 animate-pulse">Synchronizing with central vault...</p>
      </div>
    );
  }

  return (
    <>
      {regenStep !== "idle" && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-[#0d1321] border border-[#00d2ff]/30 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#00d2ff]/60 to-transparent" />

              {/* Step: warning */}
              {regenStep === "warning" && (
                <>
                  <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle size={28} className="text-red-400" />
                  </div>
                  <h2 className="text-white font-black text-xl uppercase italic tracking-tight text-center mb-2">
                    Regenerate Backup Code
                  </h2>
                  <p className="text-white/50 text-[10px] uppercase tracking-widest text-center font-bold mb-6">
                    This action is irreversible
                  </p>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 space-y-2">
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Warning</p>
                    <p className="text-white/60 text-xs leading-relaxed">
                      Your current backup code will be permanently invalidated the moment you confirm.
                      If you have not saved it somewhere safe, you will lose access to it immediately.
                      Your new code must be saved before closing this window — it will never be shown again.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRegenStep("confirming")}
                      className="flex-1 h-12 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-xs"
                    >
                      I understand — Continue
                    </button>
                    <button
                      onClick={() => setRegenStep("idle")}
                      className="flex-1 h-12 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {/* Step: confirming */}
              {regenStep === "confirming" && (
                <>
                  <div className="w-14 h-14 rounded-full bg-[#00d2ff]/10 border border-[#00d2ff]/30 flex items-center justify-center mx-auto mb-6">
                    <Key size={28} className="text-[#00d2ff]" />
                  </div>
                  <h2 className="text-white font-black text-xl uppercase italic tracking-tight text-center mb-2">
                    Confirm Identity
                  </h2>
                  <p className="text-white/50 text-[10px] uppercase tracking-widest text-center font-bold mb-6">
                    Enter your authenticator code to proceed
                  </p>
                  <input
                    type="text"
                    value={regenCode}
                    onChange={e => setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder:text-white/20 rounded-2xl h-16 text-center text-3xl font-black tracking-[0.2em] focus:border-[#00d2ff]/50 focus:outline-none transition-all mb-4"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleRegenConfirm}
                      disabled={regenLoading}
                      className="flex-1 h-12 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-xs disabled:opacity-50"
                    >
                      {regenLoading ? "Verifying..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => { setRegenStep("idle"); setRegenCode(""); }}
                      className="flex-1 h-12 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {/* Step: revealed */}
              {regenStep === "revealed" && newBackupCode && (
                <>
                  <div className="w-14 h-14 rounded-full bg-[#00d2ff]/10 border border-[#00d2ff]/30 flex items-center justify-center mx-auto mb-6">
                    <Check size={28} className="text-[#00d2ff]" />
                  </div>
                  <h2 className="text-white font-black text-xl uppercase italic tracking-tight text-center mb-2">
                    New Backup Code
                  </h2>
                  <p className="text-white/50 text-[10px] uppercase tracking-widest text-center font-bold mb-6">
                    Save this now — it will never be shown again
                  </p>
                  <div className="bg-black/50 border border-white/10 rounded-xl px-4 py-5 text-center font-mono text-white text-2xl tracking-[0.4em] select-all mb-4">
                    {newBackupCode}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(newBackupCode); toast.success("Backup code copied") }}
                    className="w-full py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-3 hover:bg-white/10 transition-all cursor-pointer mb-3"
                  >
                    <Copy size={14} className="text-white/40" />
                    <span className="text-white/70 text-[9px] uppercase font-black tracking-widest">Copy to Clipboard</span>
                  </button>
                  <button
                    onClick={() => { setRegenStep("idle"); setNewBackupCode(null) }}
                    className="w-full h-12 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-xs"
                  >
                    Done — I have saved it
                  </button>
                  <p className="text-white/20 text-[9px] uppercase tracking-widest text-center font-bold mt-4">
                    Closing without saving means this code is gone forever
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}

    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold mb-1">Account Management</h1>
        <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
          Manage your profile, subscription, and usage
        </p>
      </div>

      {/* Profile Card */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
              fontSize: "24px",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {profile.avatar}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-white text-xl font-bold mb-1">{profile.name}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{ color: "#6b7fa8", fontSize: "14px" }}>{profile.email}</span>
                  <span style={{ color: "#3d4f6e", fontSize: "14px" }}>•</span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded"
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: getPlanColor(profile.plan),
                      background: `${getPlanColor(profile.plan)}15`,
                      border: `1px solid ${getPlanColor(profile.plan)}30`,
                    }}
                  >
                    {getPlanName(profile.plan).toUpperCase()} PLAN
                  </span>
                  {profile.role === "admin" && (
                    <>
                      <span style={{ color: "#3d4f6e", fontSize: "14px" }}>•</span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded"
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          color: "#0B7FFF",
                          background: "rgba(11,127,255,0.15)",
                          border: "1px solid rgba(11,127,255,0.3)",
                        }}
                      >
                        ADMIN
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditedProfile({
                      name: profile.name,
                      email: profile.email,
                      company: profile.company
                    });
                    setShowEditDialog(true);
                  }}
                  className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 rounded-lg transition-all hover:bg-white/5 flex items-center gap-2"
                  style={{
                    border: "1px solid rgba(248,113,113,0.3)",
                    color: "#F87171",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  <LogOut size={16} />
                  Disconnect
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Building size={16} style={{ color: "#6b7fa8" }} />
                <span style={{ color: "#e2e8f0", fontSize: "14px" }}>{profile.company}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} style={{ color: "#6b7fa8" }} />
                <span style={{ color: "#e2e8f0", fontSize: "14px" }}>
                  Joined {format(profile.joinDate, "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={16} style={{ color: "#6b7fa8" }} />
                <span style={{ color: "#00E5A0", fontSize: "14px" }}>Verified Identity</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Usage Stats */}
      <section>
        <h2 className="text-white font-semibold text-lg mb-3">Usage Statistics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            className="p-4 rounded-xl"
            style={{
              background: "rgba(11,127,255,0.08)",
              border: "1px solid rgba(11,127,255,0.2)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <Upload size={20} style={{ color: "#0B7FFF" }} />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#4a5578",
                  letterSpacing: "0.05em",
                }}
              >
                TOTAL SENT
              </span>
            </div>
            <p className="text-3xl font-bold mb-1" style={{ color: "#0B7FFF" }}>
              {usage.transfersCount}
            </p>
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Security Transfers</p>
          </div>

          <div
            className="p-4 rounded-xl"
            style={{
              background: "rgba(0,229,160,0.08)",
              border: "1px solid rgba(0,229,160,0.2)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <Download size={20} style={{ color: "#00E5A0" }} />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#4a5578",
                  letterSpacing: "0.05em",
                }}
              >
                TOTAL RECEIVED
              </span>
            </div>
            <p className="text-3xl font-bold mb-1" style={{ color: "#00E5A0" }}>
              {usage.downloadsCount}
            </p>
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Secure Downloads</p>
          </div>

          <div
            className="p-4 rounded-xl col-span-1 sm:col-span-2"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive size={20} style={{ color: "#6b7fa8" }} />
                <span className="text-white font-medium">Storage Used</span>
              </div>
              <span style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}>
                {formatBytes(usage.storageUsedBytes)} / {formatBytes(usage.storageLimit)}
              </span>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(usage.storageUsedBytes / usage.storageLimit) * 100}%`,
                  background: "linear-gradient(90deg, #0B7FFF 0%, #0960D9 100%)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Section */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Crown size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">Subscription Plan</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Current Plan */}
          <div
            className="p-5 rounded-xl col-span-1 lg:col-span-2"
            style={{
              background: "linear-gradient(135deg, rgba(11,127,255,0.12) 0%, rgba(11,127,255,0.05) 100%)",
              border: "1px solid rgba(11,127,255,0.25)",
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-white font-bold text-xl mb-1">{getPlanName(profile.plan)} Plan</h3>
                <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
                  {profile.plan === "pro" && "Perfect for growing teams"}
                  {profile.plan === "enterprise" && "Unlimited power for large organizations"}
                  {profile.plan === "free" && "Get started with basic features"}
                </p>
              </div>
              <span className="text-white font-bold text-2xl">
                {profile.plan === "pro" && "$29"}
                {profile.plan === "enterprise" && "$99"}
                {profile.plan === "free" && "$0"}
                <span style={{ color: "#6b7fa8", fontSize: "14px", fontWeight: 400 }}>/mo</span>
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00E5A0" }} />
                <span style={{ color: "#e2e8f0", fontSize: "14px" }}>
                  {profile.plan === "free" && "Up to 10 GB storage"}
                  {profile.plan === "pro" && "Up to 100 GB storage"}
                  {profile.plan === "enterprise" && "Unlimited storage"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00E5A0" }} />
                <span style={{ color: "#e2e8f0", fontSize: "14px" }}>
                  {profile.plan === "free" && "Basic encryption"}
                  {profile.plan === "pro" && "AES-256 encryption"}
                  {profile.plan === "enterprise" && "Military-grade encryption"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00E5A0" }} />
                <span style={{ color: "#e2e8f0", fontSize: "14px" }}>
                  {profile.plan === "free" && "Email support"}
                  {profile.plan === "pro" && "Priority support"}
                  {profile.plan === "enterprise" && "24/7 dedicated support"}
                </span>
              </div>
              {(profile.plan === "pro" || profile.plan === "enterprise") && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00E5A0" }} />
                  <span style={{ color: "#e2e8f0", fontSize: "14px" }}>
                    Advanced audit logs
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Billing Actions */}
          <div className="space-y-3">
            <button
              onClick={() => setShowBillingDialog(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              <CreditCard size={16} />
              Manage Billing
            </button>
            {profile.plan !== "enterprise" && (
              <button
                className="w-full px-4 py-3 rounded-lg transition-colors"
                style={{
                  background: "rgba(0,229,160,0.12)",
                  border: "1px solid rgba(0,229,160,0.2)",
                  color: "#00E5A0",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Upgrade Plan
              </button>
            )}
            <button
              className="w-full px-4 py-3 rounded-lg transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#e2e8f0",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              View Invoices
            </button>
          </div>
        </div>
      </section>

      {/* Authentication Section */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Key size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">Identity Verification</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-white font-medium">Password Reset</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Rotate your cryptographic access token</p>
            </div>
            <button
              onClick={() => setShowPasswordDialog(true)}
              className="px-4 py-2 rounded-lg transition-colors cursor-pointer"
              style={{
                background: "rgba(11,127,255,0.12)",
                border: "1px solid rgba(11,127,255,0.2)",
                color: "#0B7FFF",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Update
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="flex items-start gap-3">
              <Smartphone size={20} style={{ color: "#6b7fa8", marginTop: "2px" }} />
              <div>
                <p className="text-white font-medium">Multi-Factor Gateway</p>
                <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
                  Provision an external biometric step
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => navigate("/dashboard/mfa-setup")}
                className="px-3 py-1.5 rounded-lg transition-colors text-sm cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#e2e8f0",
                }}
              >
                Configure
              </button>
              {user?.mfaEnabled && (
                <button
                  onClick={() => setRegenStep("warning")}
                  className="px-3 py-1.5 rounded-lg transition-colors text-sm cursor-pointer"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e2e8f0",
                  }}
                >
                  Regenerate Backup Code
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(239,68,68,0.05)",
          border: "1px solid rgba(239,68,68,0.15)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} style={{ color: "#ef4444" }} />
          <h2 className="text-white font-semibold text-lg">Sector Extinction</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Destroy Account & Assets</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Irreversibly delete your identity and wipe all files</p>
            </div>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="px-4 py-2 rounded-lg transition-colors cursor-pointer"
              style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Exterminate
            </button>
          </div>
        </div>
      </section>

      {/* Admin-Only Organization Settings */}
      {profile.role === "admin" && (
        <section
          className="p-5 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Settings size={20} style={{ color: "#0B7FFF" }} />
            <h2 className="text-white font-semibold text-lg">Organization Settings</h2>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded"
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "#0B7FFF",
                background: "rgba(11,127,255,0.15)",
              }}
            >
              ADMIN ONLY
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                COMPANY NAME
              </label>
              <p className="text-white mt-1">{profile.company}</p>
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                TEAM SIZE
              </label>
              <p className="text-white mt-1">6 members</p>
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                SUBSCRIPTION STATUS
              </label>
              <p style={{ color: "#00E5A0" }} className="mt-1">Active</p>
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                NEXT BILLING DATE
              </label>
              <p className="text-white mt-1">April 15, 2026</p>
            </div>
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => {
                setOrgCompany(profile.company);
                setOrgTeamSize("6");
                setShowOrgDialog(true);
              }}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(11,127,255,0.12)",
                border: "1px solid rgba(11,127,255,0.2)",
                color: "#0B7FFF",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Edit Organization Details
            </button>
          </div>
        </section>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                NAME
              </label>
              <input
                type="text"
                value={editedProfile.name}
                onChange={(e) => setEditedProfile({ ...editedProfile, name: e.target.value })}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                ORGANIZATION TYPE
              </label>
              <select
                value={editedProfile.company}
                onChange={(e) => setEditedProfile({ ...editedProfile, company: e.target.value })}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none appearance-none cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              >
                <option value="Individual" className="bg-[#0b0f20]">Individual</option>
                <option value="Small Business" className="bg-[#0b0f20]">Small Business</option>
                <option value="Enterprise" className="bg-[#0b0f20]">Enterprise</option>
                <option value="Non-Profit" className="bg-[#0b0f20]">Non-Profit</option>
              </select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowEditDialog(false)}
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
              onClick={handleSaveProfile}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                color: "white",
              }}
            >
              Save Changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Dialog */}
      <Dialog open={showBillingDialog} onOpenChange={setShowBillingDialog}>
        <DialogContent
          className="sm:max-w-2xl"
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Billing & Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                PAYMENT METHOD
              </label>
              <div
                className="mt-1 p-4 rounded-lg flex items-center justify-between"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center gap-3">
                  <CreditCard size={20} style={{ color: "#0B7FFF" }} />
                  <div>
                    <p className="text-white font-medium">•••• •••• •••• 4242</p>
                    <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Expires 12/26</p>
                  </div>
                </div>
                <button
                  className="px-3 py-1.5 rounded-lg transition-colors text-sm"
                  style={{
                    background: "rgba(11,127,255,0.12)",
                    border: "1px solid rgba(11,127,255,0.2)",
                    color: "#0B7FFF",
                    fontWeight: 600,
                  }}
                >
                  Update
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  CURRENT PERIOD
                </label>
                <p className="text-white mt-1">Mar 15 - Apr 15, 2026</p>
              </div>
              <div>
                <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                  AMOUNT DUE
                </label>
                <p className="text-white mt-1">
                  ${profile.plan === "pro" ? "29.00" : profile.plan === "enterprise" ? "99.00" : "0.00"}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowBillingDialog(false)}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#e2e8f0",
              }}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Organization Details Dialog */}
      <Dialog open={showOrgDialog} onOpenChange={setShowOrgDialog}>
        <DialogContent
          className="sm:max-w-md"
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Edit Organization Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label
                style={{
                  color: "#4a5578",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              >
                COMPANY NAME
              </label>
              <input
                type="text"
                value={orgCompany}
                onChange={(e) => setOrgCompany(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  color: "#4a5578",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              >
                TEAM SIZE
              </label>
              <input
                type="number"
                min={1}
                value={orgTeamSize}
                onChange={(e) => setOrgTeamSize(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowOrgDialog(false)}
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
                setProfile((prev) => prev ? { ...prev, company: orgCompany } : null);
                setShowOrgDialog(false);
              }}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                color: "white",
              }}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Security Actions Dialogs */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)"
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Rotate Cryptographic Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                CURRENT PASSWORD
              </label>
              <input
                type="password"
                value={passwords.current}
                onChange={e => setPasswords({...passwords, current: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none focus:border-[#00d2ff]/50 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                NEW PASSWORD
              </label>
              <input
                type="password"
                value={passwords.new}
                onChange={e => setPasswords({...passwords, new: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none focus:border-[#00d2ff]/50 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
              {passwords.new && (
                <div className="grid grid-cols-2 gap-2 mt-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl mb-4">
                  {passwordRequirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {req.test(passwords.new) ? (
                        <Check size={10} className="text-[#00d2ff]" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10 ml-1"></div>
                      )}
                      <span className={`text-[9px] font-black uppercase tracking-tighter ${req.test(passwords.new) ? 'text-white/60' : 'text-white/20'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                CONFIRM NEW PASSWORD
              </label>
              <input
                type="password"
                value={passwords.confirm}
                onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none focus:border-[#00d2ff]/50 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowPasswordDialog(false)}
              className="px-4 py-2 rounded-lg text-[#e2e8f0] bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handlePasswordChange}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90 bg-gradient-to-br from-[#0B7FFF] to-[#0960D9] text-white font-semibold"
            >
              Update Password
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #170505 0%, #0a0101 100%)",
            border: "1px solid rgba(239, 68, 68, 0.2)"
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-red-500 font-black tracking-widest uppercase">Warning: Sector Extinction</DialogTitle>
            <DialogDescription className="text-white/60">
              This action is permanent. Your identity, transfer history, and all physically uploaded assets currently retained by the system will be irretrievably destroyed.
            </DialogDescription>
          </DialogHeader>
          <div className="my-2">
              <label style={{ color: "#ef4444", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                TYPE "{profile?.email}" TO CONFIRM
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white outline-none focus:border-red-500/50 transition-colors"
                style={{
                  background: "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  fontSize: "14px",
                }}
              />
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowDeleteDialog(false)}
              className="px-4 py-2 rounded-lg text-white/80 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            >
              Abort
            </button>
            <button
              onClick={handleDeleteAccount}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90 bg-red-500 text-white font-black uppercase tracking-widest"
            >
              Purge Database
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </>
  );
}
