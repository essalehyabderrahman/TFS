import { useState } from "react";
import { Shield, Key, Bell, Lock, Smartphone, Globe, Clock, AlertTriangle, Check } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";

export function SecuritySettings() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [autoLogout, setAutoLogout] = useState(true);
  const [encryptionLevel, setEncryptionLevel] = useState<"standard" | "enhanced">("enhanced");
  const [allowExternalSharing, setAllowExternalSharing] = useState(true);
  const [requirePasswordProtection, setRequirePasswordProtection] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [show2FADialog, setShow2FADialog] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold mb-1">Security Settings</h1>
        <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
          Manage your security preferences and authentication methods
        </p>
      </div>

      {/* Security Status Card */}
      <div
        className="p-5 rounded-xl"
        style={{
          background: "linear-gradient(135deg, rgba(0,229,160,0.12) 0%, rgba(0,229,160,0.05) 100%)",
          border: "1px solid rgba(0,229,160,0.25)",
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(0,229,160,0.2)",
            }}
          >
            <Shield size={24} style={{ color: "#00E5A0" }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-white font-semibold text-lg">Security Status: Excellent</h3>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded"
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "#00E5A0",
                  background: "rgba(0,229,160,0.15)",
                }}
              >
                PROTECTED
              </span>
            </div>
            <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
              Your account is secured with two-factor authentication and military-grade encryption.
            </p>
          </div>
        </div>
      </div>

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
          <h2 className="text-white font-semibold text-lg">Authentication</h2>
        </div>

        <div className="space-y-4">
          {/* Change Password */}
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-white font-medium">Password</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Last changed 30 days ago</p>
            </div>
            <button
              onClick={() => setShowChangePasswordDialog(true)}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(11,127,255,0.12)",
                border: "1px solid rgba(11,127,255,0.2)",
                color: "#0B7FFF",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Change
            </button>
          </div>

          {/* Two-Factor Authentication */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-start gap-3">
              <Smartphone size={20} style={{ color: "#6b7fa8", marginTop: "2px" }} />
              <div>
                <p className="text-white font-medium">Two-Factor Authentication</p>
                <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
                  Add an extra layer of security to your account
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {twoFactorEnabled && (
                <button
                  onClick={() => setShow2FADialog(true)}
                  className="px-3 py-1.5 rounded-lg transition-colors text-sm"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e2e8f0",
                  }}
                >
                  Configure
                </button>
              )}
              <Switch
                checked={twoFactorEnabled}
                onCheckedChange={setTwoFactorEnabled}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Notifications Section */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Bell size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">Security Notifications</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-white font-medium">Email Notifications</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Receive security alerts via email</p>
            </div>
            <Switch
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Login Alerts</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Get notified of new device logins</p>
            </div>
            <Switch
              checked={loginAlerts}
              onCheckedChange={setLoginAlerts}
            />
          </div>
        </div>
      </section>

      {/* File Security Section */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">File Security</h2>
        </div>

        <div className="space-y-4">
          {/* Encryption Level */}
          <div className="py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <p className="text-white font-medium mb-3">Encryption Level</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setEncryptionLevel("standard")}
                className="p-4 rounded-lg text-left transition-all"
                style={{
                  background: encryptionLevel === "standard" ? "rgba(11,127,255,0.12)" : "rgba(255,255,255,0.04)",
                  border: encryptionLevel === "standard" ? "1px solid rgba(11,127,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-medium">Standard (AES-128)</p>
                  {encryptionLevel === "standard" && <Check size={18} style={{ color: "#0B7FFF" }} />}
                </div>
                <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
                  Balanced security and performance
                </p>
              </button>
              <button
                onClick={() => setEncryptionLevel("enhanced")}
                className="p-4 rounded-lg text-left transition-all"
                style={{
                  background: encryptionLevel === "enhanced" ? "rgba(11,127,255,0.12)" : "rgba(255,255,255,0.04)",
                  border: encryptionLevel === "enhanced" ? "1px solid rgba(11,127,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-medium">Enhanced (AES-256)</p>
                  {encryptionLevel === "enhanced" && <Check size={18} style={{ color: "#0B7FFF" }} />}
                </div>
                <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
                  Military-grade encryption (recommended)
                </p>
              </button>
            </div>
          </div>

          {/* External Sharing */}
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-start gap-3">
              <Globe size={20} style={{ color: "#6b7fa8", marginTop: "2px" }} />
              <div>
                <p className="text-white font-medium">Allow External Sharing</p>
                <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Share files with people outside your organization</p>
              </div>
            </div>
            <Switch
              checked={allowExternalSharing}
              onCheckedChange={setAllowExternalSharing}
            />
          </div>

          {/* Password Protection */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Require Password Protection</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>All transfers must be password protected</p>
            </div>
            <Switch
              checked={requirePasswordProtection}
              onCheckedChange={setRequirePasswordProtection}
            />
          </div>
        </div>
      </section>

      {/* Session Management Section */}
      <section
        className="p-5 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} style={{ color: "#0B7FFF" }} />
          <h2 className="text-white font-semibold text-lg">Session Management</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-white font-medium">Auto Logout</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Automatically logout after 30 minutes of inactivity</p>
            </div>
            <Switch
              checked={autoLogout}
              onCheckedChange={setAutoLogout}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Active Sessions</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>You have 2 active sessions</p>
            </div>
            <button
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              End All
            </button>
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
          <h2 className="text-white font-semibold text-lg">Danger Zone</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Delete All Transfer History</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Permanently delete all your transfer records</p>
            </div>
            <button
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </section>

      {/* Change Password Dialog */}
      <Dialog open={showChangePasswordDialog} onOpenChange={setShowChangePasswordDialog}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "90vh",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(11,127,255,0.2) transparent",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                CURRENT PASSWORD
              </label>
              <input
                type="password"
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
                NEW PASSWORD
              </label>
              <input
                type="password"
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
                CONFIRM NEW PASSWORD
              </label>
              <input
                type="password"
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
              onClick={() => setShowChangePasswordDialog(false)}
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
              onClick={() => setShowChangePasswordDialog(false)}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                color: "white",
              }}
            >
              Update Password
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA Configuration Dialog */}
      <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
        <DialogContent
          style={{
            background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "90vh",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(11,127,255,0.2) transparent",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Configure Two-Factor Authentication</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
          <div
            className="p-4 rounded-lg text-center"
            style={{
              background: "rgba(15,23,42,0.9)",
              border: "1px solid rgba(148,163,184,0.25)",
            }}
          >
            <div
              className="w-48 h-48 mx-auto rounded-lg flex items-center justify-center mb-4"
              style={{
                background: "radial-gradient(circle at 20% 20%, rgba(15,118,255,0.25), transparent 60%), #020617",
                border: "1px solid rgba(148,163,184,0.4)",
              }}
            >
              <p className="text-slate-100 text-sm">QR Code Placeholder</p>
            </div>
            <p style={{ color: "#cbd5f5", fontSize: "13px" }}>
              Scan this QR code with your authenticator app
            </p>
          </div>
            <div>
              <label style={{ color: "#4a5578", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                VERIFICATION CODE
              </label>
              <input
                type="text"
                placeholder="Enter 6-digit code"
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-white text-center tracking-widest outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "18px",
                  fontWeight: 600,
                }}
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShow2FADialog(false)}
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
              onClick={() => setShow2FADialog(false)}
              className="px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)",
                color: "white",
              }}
            >
              Verify & Enable
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
