import { useState } from "react";
import { Shield, Bell, Lock, Globe, Clock, Copy } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";

export function SecuritySettings() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [autoLogout, setAutoLogout] = useState(true);
  const [allowExternalSharing, setAllowExternalSharing] = useState(true);
  const [requirePasswordProtection, setRequirePasswordProtection] = useState(false);



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

    </div>
  );
}
