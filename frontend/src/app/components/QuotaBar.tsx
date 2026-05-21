import { useState, useEffect } from "react";
import { HardDrive, Infinity, ArrowUpCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGetAccount } from "../api/auth";
import { submitQuotaRequest } from "../api/quota-requests";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";

interface QuotaInfo {
  hasQuota: boolean;
  quotaBytes: number | null;
  usedBytes: number;
  remainingBytes: number | null;
  usagePercent: number | null;
}

interface PendingRequest {
  id: string;
  requestedBytes: number;
  status: string;
  createdAt: string;
}

interface QuotaBarProps {
  refreshKey?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getBarColor(percent: number): { gradient: string; glow: string; text: string } {
  if (percent < 60) {
    return {
      gradient: "linear-gradient(90deg, #00E5A0 0%, #00d2ff 100%)",
      glow: "rgba(0,229,160,0.3)",
      text: "#00E5A0",
    };
  }
  if (percent < 85) {
    return {
      gradient: "linear-gradient(90deg, #FBBF24 0%, #F59E0B 100%)",
      glow: "rgba(251,191,36,0.3)",
      text: "#FBBF24",
    };
  }
  return {
    gradient: "linear-gradient(90deg, #F87171 0%, #EF4444 100%)",
    glow: "rgba(248,113,113,0.3)",
    text: "#F87171",
  };
}

export function QuotaBar({ refreshKey }: QuotaBarProps) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Request dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [justification, setJustification] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestUnit, setRequestUnit] = useState<"MB" | "GB">("MB");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    apiGetAccount().then((res) => {
      if (res.ok) {
        if (res.quotaInfo) setQuota(res.quotaInfo);
        setPendingRequest(res.pendingQuotaRequest ?? null);
      }
      setIsLoading(false);
    });
  }, [refreshKey]);

  async function handleSubmitRequest() {
    if (!justification.trim() || justification.trim().length < 20) {
      toast.error("Please provide a justification of at least 20 characters.");
      return;
    }
    const numVal = parseFloat(requestAmount);
    if (!requestAmount || isNaN(numVal) || numVal <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    const requestedBytes = Math.round(numVal * (requestUnit === "GB" ? 1073741824 : 1048576));

    setIsSubmitting(true);
    const result = await submitQuotaRequest(justification.trim(), requestedBytes);
    setIsSubmitting(false);

    if (result.error) {
      const messages: Record<string, string> = {
        JUSTIFICATION_TOO_SHORT: "Justification must be at least 20 characters.",
        INVALID_REQUESTED_AMOUNT: "Please enter a valid amount.",
        PENDING_REQUEST_EXISTS: "You already have a pending request.",
      };
      toast.error(messages[result.error] ?? result.error);
      return;
    }

    toast.success("Quota increase request submitted successfully!");
    setPendingRequest(result.data ?? null);
    setShowDialog(false);
    setJustification("");
    setRequestAmount("");
  }

  if (isLoading) {
    return (
      <div
        className="rounded-xl px-5 py-4 animate-pulse"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          minHeight: "72px",
        }}
      />
    );
  }

  if (!quota || !quota.hasQuota) {
    return (
      <div
        className="rounded-xl px-5 py-4 flex items-center gap-4"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,210,255,0.1)" }}
        >
          <Infinity size={18} style={{ color: "#00d2ff" }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: 600 }}>
            Storage Quota
          </p>
          <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>
            No quota limit — Unlimited storage
          </p>
        </div>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", fontWeight: 500 }}>
          {formatBytes(quota?.usedBytes ?? 0)} used
        </p>
      </div>
    );
  }

  const percent = quota.usagePercent ?? 0;
  const colors = getBarColor(percent);
  const showRequestButton = percent >= 75 && !pendingRequest;

  return (
    <>
      <div
        className="rounded-xl px-5 py-4 flex flex-col gap-3"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(0,210,255,0.1)" }}
          >
            <HardDrive size={18} style={{ color: "#00d2ff" }} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: 600 }}>
              Storage Quota
            </p>
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "1px" }}>
              {formatBytes(quota.usedBytes)} / {formatBytes(quota.quotaBytes!)} used
            </p>
          </div>

          {/* Pending badge */}
          {pendingRequest && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0"
              style={{
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
                animation: "pulse-subtle 2s ease-in-out infinite",
              }}
            >
              <Clock size={12} style={{ color: "#FBBF24" }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#FBBF24" }}>
                Request Pending
              </span>
            </div>
          )}

          {/* Request more space button */}
          {showRequestButton && (
            <button
              onClick={() => setShowDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0 transition-all hover:scale-105"
              style={{
                background: "linear-gradient(135deg, rgba(0,210,255,0.15) 0%, rgba(11,127,255,0.15) 100%)",
                border: "1px solid rgba(0,210,255,0.25)",
                color: "#00d2ff",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              <ArrowUpCircle size={13} />
              Request More Space
            </button>
          )}

          <div className="text-right shrink-0">
            <p
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: colors.text,
                lineHeight: 1.1,
              }}
            >
              {percent.toFixed(1)}%
            </p>
            <p style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "2px" }}>
              {formatBytes(quota.remainingBytes!)} remaining
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative w-full overflow-hidden" style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.06)" }}>
          <div
            className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(percent, 100)}%`,
              background: colors.gradient,
              borderRadius: "4px",
              boxShadow: `0 0 12px ${colors.glow}`,
            }}
          />
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${Math.min(percent, 100)}%`,
              borderRadius: "4px",
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2s ease-in-out infinite",
            }}
          />
        </div>

        {/* Warning message */}
        {percent >= 85 && (
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: percent >= 95 ? "#EF4444" : "#FBBF24",
            }}
          >
            {percent >= 95
              ? "⚠️ Critical: Your storage is almost full. Delete files or request a quota increase."
              : "⚠️ Warning: You are running low on storage space."}
          </p>
        )}

        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes pulse-subtle {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>

      {/* Request More Space Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent style={{ background: "linear-gradient(180deg, #0d1228 0%, #0b0f20 100%)", border: "1px solid var(--border)" }}>
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <ArrowUpCircle size={20} style={{ color: "#00d2ff" }} />
              Request More Space
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current usage summary */}
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div>
                <p style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em" }}>CURRENT USAGE</p>
                <p style={{ color: "var(--foreground)", fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>
                  {formatBytes(quota.usedBytes)} / {formatBytes(quota.quotaBytes!)}
                </p>
              </div>
              <div className="text-right">
                <p style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em" }}>REMAINING</p>
                <p style={{ color: colors.text, fontSize: "14px", fontWeight: 700, marginTop: "2px" }}>
                  {formatBytes(quota.remainingBytes!)}
                </p>
              </div>
            </div>

            {/* Amount requested */}
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                ADDITIONAL SPACE NEEDED
              </label>
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={requestAmount}
                  onChange={e => setRequestAmount(e.target.value)}
                  min="1"
                  step="1"
                  className="flex-1 px-4 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground outline-none"
                  style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "14px" }}
                />
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  {(["MB", "GB"] as const).map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setRequestUnit(u)}
                      className="px-3 py-2.5 text-sm font-semibold transition-colors"
                      style={{
                        background: requestUnit === u ? "rgba(0,210,255,0.15)" : "var(--input-background)",
                        color: requestUnit === u ? "#00d2ff" : "#6b7fa8",
                      }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Justification */}
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                JUSTIFICATION <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <textarea
                placeholder="Explain why you need additional storage (min. 20 characters)..."
                value={justification}
                onChange={e => setJustification(e.target.value)}
                rows={4}
                className="w-full mt-1 px-4 py-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none resize-none"
                style={{
                  background: "var(--input-background)",
                  border: `1px solid ${justification.length > 0 && justification.length < 20 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
                  fontSize: "13px",
                  lineHeight: "1.6",
                }}
              />
              <div className="flex justify-between mt-1">
                <p style={{ color: justification.length > 0 && justification.length < 20 ? "#EF4444" : "#475569", fontSize: "10px" }}>
                  {justification.length > 0 && justification.length < 20
                    ? `${20 - justification.length} more characters needed`
                    : "Minimum 20 characters"}
                </p>
                <p style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>
                  {justification.length} characters
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <button onClick={() => setShowDialog(false)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              Cancel
            </button>
            <button
              onClick={handleSubmitRequest}
              disabled={isSubmitting || justification.trim().length < 20 || !requestAmount}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0B7FFF 100%)", color: "white", fontWeight: 600 }}>
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              Submit Request
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
