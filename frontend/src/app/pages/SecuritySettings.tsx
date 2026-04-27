import { useState, useEffect } from "react";
import { Shield, Bell, Clock } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { apiRequest } from "../api/client";

export function SecuritySettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [loginAlerts, setLoginAlerts] = useState(true);
  


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
          setEmailNotifications(Boolean(data.loginNotifications));
          setLoginAlerts(Boolean(data.loginNotifications));
        }
      } catch (error) {
        toast.error("Failed to load security settings");
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleNotificationsToggle = async (newValue: boolean) => {
    const prevValue = emailNotifications; // they share the same backend field `loginNotifications`
    
    // Optimistic update
    setEmailNotifications(newValue);
    setLoginAlerts(newValue);

    try {
      await apiRequest("/security/settings", {
        method: "PATCH",
        body: { loginNotifications: newValue },
      });
      toast.success("Settings saved.");
    } catch (error) {
      toast.error("Failed to save settings.");
      // Revert on error
      setEmailNotifications(prevValue);
      setLoginAlerts(prevValue);
    }
  };

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
              onCheckedChange={handleNotificationsToggle}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Login Alerts</p>
              <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Get notified of new device logins</p>
            </div>
            <Switch
              checked={loginAlerts}
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
          <h2 className="text-white font-semibold text-lg">Session Management</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white font-medium">Session Timeout</p>
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

    </div>
  );
}
