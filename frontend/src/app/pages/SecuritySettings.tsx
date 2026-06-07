import { useState, useEffect } from "react";
import { Shield, Bell, Clock, Globe, KeyRound, UserPlus } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { apiRequest } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function SecuritySettings() {
  const { isRootAdmin } = useAuth()
  const [isLoading, setIsLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loginNotifications, setLoginNotifications] = useState(true);

  // Platform policy (root admin only)
  const [isPolicyLoading, setIsPolicyLoading] = useState(true);
  const [requireMfa, setRequireMfa] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);
  const [allowExternalSharing, setAllowExternalSharing] = useState(false);
  


  useEffect(() => {
    async function fetchSettings() {
      try {
        setIsLoading(true);
        const data = await apiRequest<{
          mfaEnabled: boolean;
          loginNotifications: boolean;
          sessionTimeout: number;
          encryptionLevel: string;
        }>("/security/settings");
        if (data) {
          setMfaEnabled(Boolean(data.mfaEnabled));
          setLoginNotifications(Boolean(data.loginNotifications));
        }
      } catch (error) {
        toast.error("Failed to load security settings");
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!isRootAdmin) return
    async function fetchPolicySettings() {
      try {
        const data = await apiRequest<{
          requireMfa: boolean
          allowSignup: boolean
          allowExternalSharing: boolean
        }>("/app/settings")
        setRequireMfa(Boolean(data.requireMfa))
        setAllowSignup(Boolean(data.allowSignup))
        setAllowExternalSharing(Boolean(data.allowExternalSharing))
      } catch {
        toast.error("Failed to load platform policy settings.")
      } finally {
        setIsPolicyLoading(false)
      }
    }
    fetchPolicySettings()
  }, [isRootAdmin]);

  async function handlePolicyToggle(
    field: "requireMfa" | "allowSignup" | "allowExternalSharing",
    newValue: boolean,
    setter: (v: boolean) => void,
    prevValue: boolean,
  ) {
    setter(newValue)
    try {
      await apiRequest("/app/settings", {
        method: "PATCH",
        body: { [field]: newValue },
      })
      toast.success("Platform policy updated.")
    } catch {
      toast.error("Failed to update platform policy.")
      setter(prevValue)
    }
  }

  const handleNotificationsToggle = async (newValue: boolean) => {
    const prevValue = loginNotifications;
    setLoginNotifications(newValue);
    try {
      await apiRequest("/security/settings", {
        method: "PATCH",
        body: { loginNotifications: newValue },
      });
      toast.success("Settings saved.");
    } catch {
      toast.error("Failed to save settings.");
      setLoginNotifications(prevValue);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--foreground)" }}>Security Settings</h1>
        <p style={{ color: "#6b7fa8", fontSize: "14px" }}>
          Manage your security preferences and authentication methods
        </p>
      </div>

      {/* Security Status Card */}
      <div
        className="p-5 rounded-xl"
        style={{
          background: "var(--card-background)",
          border: "1px solid var(--border)",
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
              <h3 className="text-foreground font-semibold text-lg">Security Status: Excellent</h3>
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
              {isLoading ? (
                <span className="opacity-50">Loading status...</span>
              ) : (
                <>Your account is secured with {mfaEnabled ? "two-factor authentication and " : ""}military-grade encryption.</>
              )}
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
          <h2 className="text-foreground font-semibold text-lg">Security Notifications</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-foreground font-medium">Login Notifications</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Receive alerts for new sign-ins and security events</p>
            </div>
            <Switch
              checked={loginNotifications}
              onCheckedChange={handleNotificationsToggle}
              disabled={isLoading}
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
          <h2 className="text-foreground font-semibold text-lg">Session Management</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-foreground font-medium">Session Timeout</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>
                Sessions automatically expire after 15 minutes of inactivity and 8 hours absolute maximum.
              </p>
            </div>
            <span
              className="px-3 py-1 rounded-lg"
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#00E5A0",
                background: "rgba(0,229,160,0.1)",
                border: "1px solid rgba(0,229,160,0.2)",
              }}
            >
              ENFORCED
            </span>
          </div>
        </div>
      </section>

      {/* Platform Policy — root admin only */}
      {isRootAdmin && (
        <section
          className="p-5 rounded-xl"
          style={{
            background: "rgba(245,158,11,0.04)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Shield size={20} style={{ color: "#f59e0b" }} />
            <h2 className="text-foreground font-semibold text-lg">Platform Policy</h2>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ml-1"
              style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              Root Only
            </span>
          </div>
          <p style={{ color: "#6b7fa8", fontSize: "13px", marginBottom: "16px" }}>
            App-wide policies enforced for all users regardless of individual settings.
          </p>

          <div className="space-y-1">
            {[
              {
                icon: <KeyRound size={18} style={{ color: "#f59e0b" }} />,
                label: "Require MFA for All Users",
                desc: "Users without MFA enabled will be redirected to set it up before accessing the app.",
                checked: requireMfa,
                onChange: (v: boolean) => handlePolicyToggle("requireMfa", v, setRequireMfa, requireMfa),
              },
              {
                icon: <Globe size={18} style={{ color: "#f59e0b" }} />,
                label: "Allow External File Sharing",
                desc: "Permit files to be shared with users outside the groups. Can be further restricted per group.",
                checked: allowExternalSharing,
                onChange: (v: boolean) => handlePolicyToggle("allowExternalSharing", v, setAllowExternalSharing, allowExternalSharing),
              },
              {
                icon: <UserPlus size={18} style={{ color: "#f59e0b" }} />,
                label: "Allow New User Signups",
                desc: "When disabled, the signup page is locked and only admins can create new accounts via User Management.",
                checked: allowSignup,
                onChange: (v: boolean) => handlePolicyToggle("allowSignup", v, setAllowSignup, allowSignup),
              },
            ].map(({ icon, label, desc, checked, onChange }) => (
              <div
                key={label}
                className="flex items-center justify-between py-3.5 border-b last:border-0"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{icon}</div>
                  <div>
                    <p className="text-foreground font-medium">{label}</p>
                    <p style={{ color: "#6b7fa8", fontSize: "13px" }}>{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={onChange}
                  disabled={isPolicyLoading}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
