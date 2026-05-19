import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Copy, Mail, Key, RefreshCw, Check, X, Send, ShieldCheck,
  ClipboardCheck, AlertTriangle,
} from "lucide-react";
import {
  apiListRecoveryRequests,
  apiSetRecoveryPassword,
  apiSendRecoveryEmail,
  apiRejectRecoveryRequest,
} from "../api/auth";

// ── Types ────────────────────────────────────────────────────────────────────

interface RecoveryRequest {
  id: string;
  userEmail: string;
  fullName: string;
  message: string | null;
  status: string;
  createdAt: string;
  mfaEnabled: boolean;
  lastTransferredFile?: string | null;
  estimatedRegistrationDate?: string | null;
}

/** Which panel is currently open for a pending card */
type CardPanel = "idle" | "set_password" | "send_email";

interface CardState {
  panel: CardPanel;
  /** password currently shown in the Set Password panel */
  draftPassword: string;
  /** whether the draft is user-typed (false = auto-generated preview) */
  isManual: boolean;
  /** password that was confirmed with the backend */
  appliedPassword: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  loading: boolean;
}

// [Security] Password policy — must mirror backend _validate_password exactly
const passwordRequirements = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "Contains a number", test: (p: string) => /\d/.test(p) },
  { label: "Lowercase & Uppercase", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "Special character", test: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(p) },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Client-side preview password (same alphabet as backend) */
function genPreview(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let pw = Array.from(buf).map(b => chars[b % chars.length]).join("");
  // Ensure policy: upper + lower + digit + symbol (brute-force shuffle rarely needed)
  while (
    !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) ||
    !/\d/.test(pw)    || !/[!@#$%]/.test(pw)
  ) {
    crypto.getRandomValues(buf);
    pw = Array.from(buf).map(b => chars[b % chars.length]).join("");
  }
  return pw;
}

function buildEmailBody(name: string, password: string): string {
  return `Hello ${name},

Your account recovery request has been approved.

Your temporary password is:

    ${password}

Please sign in immediately and change your password — this temporary password is valid for one session only.

If you did not request this, please contact your administrator.

— TFS Security Team`;
}

function initCardState(req: RecoveryRequest): CardState {
  const preview = genPreview();
  return {
    panel: "idle",
    draftPassword: preview,
    isManual: false,
    appliedPassword: "",
    emailTo: req.userEmail,
    emailSubject: "[TFS Security] Your Temporary Password",
    emailBody: buildEmailBody(req.fullName, preview),
    loading: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecoveryManagement() {
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiListRecoveryRequests(filter);
    setRequests(data);
    setCardStates(prev => {
      const next = { ...prev };
      for (const req of data) {
        if (!next[req.id]) next[req.id] = initCardState(req);
      }
      return next;
    });
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const update = (id: string, patch: Partial<CardState>) =>
    setCardStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSetPassword = async (req: RecoveryRequest) => {
    const cs = cardStates[req.id];
    const pw = cs.isManual ? cs.draftPassword.trim() : cs.draftPassword;
    if (!pw) { toast.error("Password cannot be empty."); return; }

    const isPasswordStrong = passwordRequirements.every(reqRule => reqRule.test(pw));
    if (!isPasswordStrong) {
      toast.error("Security protocol violation: Password does not meet requirements.");
      return;
    }

    update(req.id, { loading: true });
    const res = await apiSetRecoveryPassword(req.id, { password: pw });
    update(req.id, { loading: false });

    if (!res.ok) {
      const msgs: Record<string, string> = {
        USER_NOT_FOUND:        "User account not found.",
        ALREADY_RESOLVED:      "This request has already been resolved.",
        FORBIDDEN:             "You do not have permission.",
        PASSWORD_TOO_SHORT:    "Password must be at least 12 characters.",
        PASSWORD_NO_UPPERCASE: "Password must contain an uppercase letter.",
        PASSWORD_NO_LOWERCASE: "Password must contain a lowercase letter.",
        PASSWORD_NO_DIGIT:     "Password must contain a number.",
        PASSWORD_NO_SYMBOL:    "Password must contain a special character.",
      };
      toast.error(msgs[res.error ?? ""] ?? res.error ?? "Failed to set password.");
      return;
    }

    const applied = res.password ?? pw;
    update(req.id, {
      panel: "send_email",
      appliedPassword: applied,
      emailBody: buildEmailBody(req.fullName, applied),
    });
    toast.success("Password applied. Compose and send the email below.");
  };

  const handleSendEmail = async (req: RecoveryRequest) => {
    const cs = cardStates[req.id];
    if (!cs.emailTo || !cs.emailSubject || !cs.emailBody) {
      toast.error("Please fill in all email fields."); return;
    }
    update(req.id, { loading: true });
    const res = await apiSendRecoveryEmail(req.id, {
      to: cs.emailTo, subject: cs.emailSubject, body: cs.emailBody,
    });
    update(req.id, { loading: false });

    if (!res.ok) {
      toast.error(res.error ?? "Failed to send email."); return;
    }
    if (res.emailSent) {
      toast.success("Email sent — request approved.");
    } else {
      toast.warning("Request approved, but email could not be sent. Check SMTP config.");
    }
    load();
  };

  const handleReject = async (req: RecoveryRequest) => {
    update(req.id, { loading: true });
    const res = await apiRejectRecoveryRequest(req.id);
    update(req.id, { loading: false });
    if (res.ok) { toast.success("Request rejected."); load(); }
    else toast.error(res.error ?? "Failed to reject.");
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const statusStyles: Record<string, string> = {
    pending:  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    approved: "text-green-400 bg-green-400/10 border-green-400/20",
    rejected: "text-red-400 bg-red-400/10 border-red-400/20",
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard.`);
  };

  const filters = ["pending", "approved", "rejected", "all"] as const;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-black uppercase italic tracking-tighter">
            Recovery <span className="text-[#00d2ff]">Management</span>
          </h1>
          <p className="text-white/30 text-xs uppercase tracking-widest mt-1">
            Admin · Password recovery requests
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                filter === f
                  ? "bg-[#00d2ff] text-black border-transparent"
                  : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-white/30 text-sm uppercase tracking-widest text-center py-24">
          Loading...
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-white/20">
          <ClipboardCheck size={40} className="opacity-30" />
          <p className="text-sm uppercase tracking-widest">No {filter} requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => {
            const cs = cardStates[req.id] ?? initCardState(req);
            const isPending = req.status === "pending";

            return (
              <div
                key={req.id}
                className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden"
              >
                {/* ── Request header ───────────────────────────── */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-[#00d2ff]/10 border border-[#00d2ff]/20
                                      flex items-center justify-center shrink-0
                                      text-[#00d2ff] text-sm font-black uppercase">
                        {req.fullName.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">{req.fullName}</span>
                          {/* Status badge */}
                          <span className={`text-[9px] font-black uppercase tracking-widest
                                           px-2 py-0.5 rounded-full border ${statusStyles[req.status] ?? ""}`}>
                            {req.status}
                          </span>
                          {/* MFA badge */}
                          {req.mfaEnabled && (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase
                                             tracking-widest px-2 py-0.5 rounded-full border
                                             text-[#00d2ff] bg-[#00d2ff]/10 border-[#00d2ff]/20">
                              <ShieldCheck size={9} /> MFA verified
                            </span>
                          )}
                        </div>
                        <div className="text-white/40 text-xs mt-0.5">{req.userEmail}</div>
                      </div>
                    </div>
                    <div className="text-white/20 text-[10px] text-right whitespace-nowrap shrink-0">
                      {new Date(req.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {/* User message */}
                  {req.message && (
                    <div className="mt-3 ml-13 pl-1 border-l border-white/10 ml-[52px]">
                      <p className="text-white/30 text-xs italic">"{req.message}"</p>
                    </div>
                  )}

                  {/* Verification data */}
                  {(req.lastTransferredFile || req.estimatedRegistrationDate) && (
                    <div className="mt-3 ml-[52px] p-3.5 rounded-xl bg-white/[0.01] border border-white/[0.04] space-y-1 text-xs">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#00d2ff] mb-1">
                        Identity Verification Data
                      </div>
                      {req.lastTransferredFile && (
                        <div>
                          <span className="text-white/30 uppercase font-black tracking-wider text-[9px] mr-1.5">Last File:</span>
                          <span className="text-white/70">{req.lastTransferredFile}</span>
                        </div>
                      )}
                      {req.estimatedRegistrationDate && (
                        <div>
                          <span className="text-white/30 uppercase font-black tracking-wider text-[9px] mr-1.5">Est. Registration Date:</span>
                          <span className="text-white/70">{req.estimatedRegistrationDate}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Pending actions ─────────────────────────── */}
                {isPending && (
                  <div className="border-t border-white/[0.05]">

                    {/* Step 1: Set Password panel */}
                    {cs.panel === "idle" && (() => {
                      const isPasswordStrong = passwordRequirements.every(reqRule => reqRule.test(cs.draftPassword));
                      return (
                        <div className="p-5 space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                            <Key size={11} /> Step 1 — Set a temporary password
                          </p>

                          {/* Password input row */}
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={cs.draftPassword}
                                onChange={e => update(req.id, {
                                  draftPassword: e.target.value,
                                  isManual: true,
                                  emailBody: buildEmailBody(req.fullName, e.target.value),
                                })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl h-10 px-3
                                           text-white font-mono text-sm tracking-widest outline-none
                                           focus:border-[#00d2ff]/50 transition-all"
                                placeholder="Auto-generated password..."
                              />
                            </div>
                            {/* Regenerate */}
                            <button
                              title="Regenerate password"
                              onClick={() => {
                                const p = genPreview();
                                update(req.id, {
                                  draftPassword: p,
                                  isManual: false,
                                  emailBody: buildEmailBody(req.fullName, p),
                                });
                              }}
                              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40
                                         hover:text-white hover:border-white/30 transition-all"
                            >
                              <RefreshCw size={14} />
                            </button>
                            {/* Copy */}
                            <button
                              title="Copy password"
                              onClick={() => copyToClipboard(cs.draftPassword, "Password")}
                              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40
                                         hover:text-white hover:border-white/30 transition-all"
                            >
                              <Copy size={14} />
                            </button>
                          </div>

                          {/* Password rules indicator */}
                          {cs.draftPassword && (
                            <div className="grid grid-cols-2 gap-2 p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
                              {passwordRequirements.map((reqRule, i) => {
                                const passed = reqRule.test(cs.draftPassword);
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    {passed ? (
                                      <Check size={10} className="text-[#00d2ff]" />
                                    ) : (
                                      <div className="w-1.5 h-1.5 rounded-full bg-white/10 ml-1"></div>
                                    )}
                                    <span className={`text-[9px] font-black uppercase tracking-tighter ${passed ? 'text-white/60' : 'text-white/20'}`}>
                                      {reqRule.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex gap-2">
                            {/* Set Password button */}
                            <button
                              onClick={() => handleSetPassword(req)}
                              disabled={cs.loading || !isPasswordStrong}
                              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black
                                         uppercase tracking-widest border transition-all disabled:opacity-40
                                         bg-[#00d2ff]/10 border-[#00d2ff]/20 text-[#00d2ff]
                                         hover:bg-[#00d2ff]/20"
                            >
                              {cs.loading ? <RefreshCw size={12} className="animate-spin" /> : <Key size={12} />}
                              {cs.loading ? "Setting..." : "Set Password & Continue"}
                            </button>
                            {/* Reject */}
                            <button
                              onClick={() => handleReject(req)}
                              disabled={cs.loading}
                              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black
                                         uppercase tracking-widest border transition-all disabled:opacity-40
                                         bg-red-500/10 border-red-500/20 text-red-400
                                         hover:bg-red-500/20"
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        </div>
                      );
                    })()}


                    {/* Step 2: Email composer panel */}
                    {cs.panel === "send_email" && (
                      <div className="p-5 space-y-4">
                        {/* Password confirmed badge */}
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/5
                                        border border-green-500/15">
                          <Check size={14} className="text-green-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-green-400 text-[10px] font-black uppercase tracking-widest">
                              Password set successfully
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <code className="text-white/60 font-mono text-xs tracking-widest truncate">
                                {cs.appliedPassword}
                              </code>
                              <button
                                onClick={() => copyToClipboard(cs.appliedPassword, "Password")}
                                className="text-white/30 hover:text-white transition-colors shrink-0"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Email composer */}
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                          <Mail size={11} /> Step 2 — Compose & send the notification email
                        </p>

                        <div className="space-y-3">
                          {/* To */}
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/30">
                              To
                            </label>
                            <input
                              type="email"
                              value={cs.emailTo}
                              onChange={e => update(req.id, { emailTo: e.target.value })}
                              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl h-9 px-3
                                         text-white text-sm outline-none focus:border-[#00d2ff]/50 transition-all"
                            />
                          </div>
                          {/* Subject */}
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-white/30">
                              Subject
                            </label>
                            <input
                              type="text"
                              value={cs.emailSubject}
                              onChange={e => update(req.id, { emailSubject: e.target.value })}
                              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl h-9 px-3
                                         text-white text-sm outline-none focus:border-[#00d2ff]/50 transition-all"
                            />
                          </div>
                          {/* Body */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-white/30">
                                Body
                              </label>
                              <button
                                onClick={() => update(req.id, {
                                  emailBody: buildEmailBody(req.fullName, cs.appliedPassword),
                                })}
                                className="text-[9px] font-black uppercase tracking-widest
                                           text-white/20 hover:text-[#00d2ff] transition-colors flex items-center gap-1"
                              >
                                <RefreshCw size={9} /> Reset to template
                              </button>
                            </div>
                            <textarea
                              value={cs.emailBody}
                              onChange={e => update(req.id, { emailBody: e.target.value })}
                              rows={9}
                              className="w-full bg-white/5 border border-white/10 rounded-xl p-3
                                         text-white/80 text-xs font-mono outline-none resize-y
                                         focus:border-[#00d2ff]/50 transition-all
                                         placeholder:text-white/20"
                            />
                          </div>
                        </div>

                        {/* Warning if SMTP might not be set */}
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-400/5
                                        border border-yellow-400/15">
                          <AlertTriangle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
                          <p className="text-yellow-400/70 text-[10px] leading-relaxed">
                            Make sure SMTP is configured in your backend <code>.env</code> (SMTP_SENDER_EMAIL, SMTP_APP_PASSWORD).
                            If not, the request will be approved but no email will be sent.
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleSendEmail(req)}
                            disabled={cs.loading}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black
                                       uppercase tracking-widest border transition-all disabled:opacity-40
                                       bg-[#00d2ff] border-transparent text-black
                                       hover:bg-white"
                          >
                            {cs.loading ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                            {cs.loading ? "Sending..." : "Send Email & Approve"}
                          </button>
                          <button
                            onClick={() => handleReject(req)}
                            disabled={cs.loading}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black
                                       uppercase tracking-widest border transition-all disabled:opacity-40
                                       bg-red-500/10 border-red-500/20 text-red-400
                                       hover:bg-red-500/20"
                          >
                            <X size={12} /> Reject
                          </button>
                          <button
                            onClick={() => update(req.id, { panel: "idle" })}
                            disabled={cs.loading}
                            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest
                                       text-white/20 hover:text-white transition-colors"
                          >
                            ← Back
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
