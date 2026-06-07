import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../hooks/useAuth"
import { toast } from "sonner"
import { ArrowUpCircle, Check, X, Loader2, Filter } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog"
import { fetchPendingQuotaRequests, resolveQuotaRequest, type QuotaRequestData } from "../api/quota-requests"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function QuotaRequests() {
  const { isAppAdmin, isInitializing } = useAuth()
  const [requests, setRequests] = useState<QuotaRequestData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending")

  // Resolve dialog
  const [resolveTarget, setResolveTarget] = useState<{ req: QuotaRequestData; action: "approve" | "reject" } | null>(null)
  const [adminNote, setAdminNote] = useState("")
  const [isResolving, setIsResolving] = useState(false)

  const loadRequests = useCallback(async () => {
    setIsLoading(true)
    const res = await fetchPendingQuotaRequests(statusFilter)
    if (!res.error) setRequests(res.data)
    setIsLoading(false)
  }, [statusFilter])

  useEffect(() => { loadRequests() }, [loadRequests])

  async function handleResolve() {
    if (!resolveTarget) return
    setIsResolving(true)
    const res = await resolveQuotaRequest(resolveTarget.req.id, resolveTarget.action, adminNote.trim() || undefined)
    setIsResolving(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(resolveTarget.action === "approve"
      ? `Quota approved for ${resolveTarget.req.userName}. Their quota has been increased.`
      : `Quota request from ${resolveTarget.req.userName} has been rejected.`
    )
    setResolveTarget(null)
    setAdminNote("")
    loadRequests()
  }

  if (isInitializing) return null
  if (!isAppAdmin) return <p style={{ color: "var(--muted-foreground)" }}>Access denied.</p>

  const pendingCount = requests.filter(r => r.status === "pending").length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: "var(--foreground)" }}>
            <ArrowUpCircle size={28} style={{ color: "#00d2ff" }} />
            Quota Requests
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.25)" }}>
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: "14px", marginTop: "4px" }}>
            Review and manage storage quota increase requests
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: "var(--muted-foreground)" }} />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as "pending" | "all")}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "var(--input-background)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}>
            <option value="pending">Pending Only</option>
            <option value="all">All Requests</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: "#00d2ff" }} />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Check size={40} style={{ color: "#00E5A0", opacity: 0.4 }} />
            <p style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>
              {statusFilter === "pending" ? "No pending quota requests." : "No quota requests found."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--accent)" }}>
            {requests.map(req => {
              const isPending = req.status === "pending"
              const isApproved = req.status === "approved"
              const newQuota = (req.currentQuotaBytes ?? 0) + req.requestedBytes

              return (
                <div key={req.id} className="p-4 sm:p-5 flex flex-col gap-3 hover:bg-white/[0.015] transition-colors">
                  {/* Top row: user + meta */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg, #0B7FFF 0%, #0960D9 100%)" }}>
                      {req.userAvatar || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-sm font-semibold">{req.userName}</p>
                      <p style={{ color: "var(--muted-foreground)", fontSize: "12px" }}>{req.userEmail}</p>
                    </div>

                    {/* Quota change visual */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <span style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600 }}>
                        {req.currentQuotaBytes != null ? formatBytes(req.currentQuotaBytes) : "∞"}
                      </span>
                      <span style={{ color: "#00d2ff", fontSize: "12px" }}>→</span>
                      <span style={{ color: "#00E5A0", fontSize: "12px", fontWeight: 700 }}>
                        {formatBytes(newQuota)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: "rgba(0,210,255,0.08)", color: "#00d2ff", border: "1px solid rgba(0,210,255,0.15)" }}>
                        +{formatBytes(req.requestedBytes)}
                      </span>
                    </div>

                    {/* Status badge */}
                    <div
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0"
                      style={{
                        background: isPending ? "rgba(251,191,36,0.08)" : isApproved ? "rgba(0,229,160,0.08)" : "rgba(239,68,68,0.08)",
                        color: isPending ? "#FBBF24" : isApproved ? "#00E5A0" : "#EF4444",
                        border: `1px solid ${isPending ? "rgba(251,191,36,0.2)" : isApproved ? "rgba(0,229,160,0.2)" : "rgba(239,68,68,0.2)"}`,
                      }}>
                      {req.status}
                    </div>

                    <p style={{ color: "var(--muted-foreground)", fontSize: "11px" }} className="shrink-0">
                      {timeAgo(req.createdAt)}
                    </p>
                  </div>

                  {/* Justification */}
                  <div className="pl-13 sm:pl-[52px]">
                    <p style={{ color: "var(--muted-foreground)", fontSize: "13px", lineHeight: "1.6" }}>
                      "{req.justification}"
                    </p>
                    {req.adminNote && (
                      <p style={{ color: "var(--muted-foreground)", fontSize: "12px", marginTop: "4px", fontStyle: "italic" }}>
                        Admin note: {req.adminNote}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="pl-13 sm:pl-[52px] flex items-center gap-2">
                      <button
                        onClick={() => { setResolveTarget({ req, action: "approve" }); setAdminNote("") }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                        style={{ background: "rgba(0,229,160,0.1)", color: "#00E5A0", border: "1px solid rgba(0,229,160,0.2)" }}>
                        <Check size={13} /> Approve
                      </button>
                      <button
                        onClick={() => { setResolveTarget({ req, action: "reject" }); setAdminNote("") }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <X size={13} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Resolve confirmation dialog */}
      <Dialog open={!!resolveTarget} onOpenChange={() => setResolveTarget(null)}>
        <DialogContent style={{ background: "var(--card-background)", border: "1px solid var(--border)" }}>
          <DialogHeader>
            <DialogTitle className="text-foreground text-lg">
              {resolveTarget?.action === "approve" ? "✅ Approve Request" : "❌ Reject Request"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-foreground text-sm font-semibold">{resolveTarget?.req.userName}</p>
              <p style={{ color: "var(--muted-foreground)", fontSize: "12px" }}>
                Requesting +{formatBytes(resolveTarget?.req.requestedBytes ?? 0)}
              </p>
              {resolveTarget?.action === "approve" && (
                <p style={{ color: "#00E5A0", fontSize: "12px", marginTop: "4px" }}>
                  New quota will be: {formatBytes((resolveTarget?.req.currentQuotaBytes ?? 0) + (resolveTarget?.req.requestedBytes ?? 0))}
                </p>
              )}
            </div>
            <div>
              <label style={{ color: "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, letterSpacing: "0.05em" }}>
                ADMIN NOTE (optional)
              </label>
              <textarea
                placeholder={resolveTarget?.action === "reject" ? "Reason for rejection..." : "Optional note..."}
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={2}
                className="w-full mt-1 px-4 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground outline-none resize-none"
                style={{ background: "var(--input-background)", border: "1px solid var(--border)", fontSize: "13px" }}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <button onClick={() => setResolveTarget(null)}
              className="px-4 py-2 rounded-lg"
              style={{ background: "var(--input-background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              Cancel
            </button>
            <button
              onClick={handleResolve}
              disabled={isResolving}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              style={{
                background: resolveTarget?.action === "approve"
                  ? "linear-gradient(135deg, #00E5A0 0%, #00B87C 100%)"
                  : "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
                color: "white",
                fontWeight: 600,
              }}>
              {isResolving && <Loader2 size={16} className="animate-spin" />}
              {resolveTarget?.action === "approve" ? "Approve" : "Reject"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
