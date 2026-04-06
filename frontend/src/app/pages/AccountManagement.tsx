import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Building, CreditCard, Crown, Download, Upload, HardDrive, Calendar, Settings, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { format } from "date-fns";

interface UserProfile {
  name: string;
  email: string;
  company: string;
  role: "admin" | "user";
  plan: "free" | "pro" | "enterprise";
  joinDate: Date;
  avatar: string;
}

interface UsageStats {
  transfersThisMonth: number;
  storageUsed: number;
  storageLimit: number;
  downloadsThisMonth: number;
}

export function AccountManagement() {
  const navigate = useNavigate();
  const [isAdmin] = useState(true); // Change to false for normal users
  const [profile, setProfile] = useState<UserProfile>({
    name: "Admin User",
    email: "admin@company.com",
    company: "Tech Solutions Inc.",
    role: "admin",
    plan: "pro",
    joinDate: new Date(2025, 0, 15),
    avatar: "AU",
  });
  const [usage] = useState<UsageStats>({
    transfersThisMonth: 234,
    storageUsed: 45.7,
    storageLimit: 100,
    downloadsThisMonth: 567,
  });
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBillingDialog, setShowBillingDialog] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [orgCompany, setOrgCompany] = useState(profile.company);
  const [orgTeamSize, setOrgTeamSize] = useState("6");

  const handleSaveProfile = () => {
    setProfile(editedProfile);
    setShowEditDialog(false);
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

  return (
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
                  {isAdmin && (
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
              <button
                onClick={() => {
                  setEditedProfile(profile);
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
                onClick={() => navigate("/")}
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
                <span style={{ color: "#00E5A0", fontSize: "14px" }}>Verified</span>
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
                THIS MONTH
              </span>
            </div>
            <p className="text-3xl font-bold mb-1" style={{ color: "#0B7FFF" }}>
              {usage.transfersThisMonth}
            </p>
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Transfers</p>
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
                THIS MONTH
              </span>
            </div>
            <p className="text-3xl font-bold mb-1" style={{ color: "#00E5A0" }}>
              {usage.downloadsThisMonth}
            </p>
            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Downloads</p>
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
                {usage.storageUsed} GB / {usage.storageLimit} GB
              </span>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(usage.storageUsed / usage.storageLimit) * 100}%`,
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

      {/* Admin-Only Organization Settings */}
      {isAdmin && (
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
                EMAIL
              </label>
              <input
                type="email"
                value={editedProfile.email}
                onChange={(e) => setEditedProfile({ ...editedProfile, email: e.target.value })}
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
                COMPANY
              </label>
              <input
                type="text"
                value={editedProfile.company}
                onChange={(e) => setEditedProfile({ ...editedProfile, company: e.target.value })}
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
                setProfile((prev) => ({ ...prev, company: orgCompany }));
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
    </div>
  );
}
