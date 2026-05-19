import { useState, useLayoutEffect, useRef } from "react";
import { useNavigate, Link } from "react-router";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { apiSubmitRecoveryRequest } from "../api/auth";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

type Step = "form" | "mfa" | "done";

export function ForgotPassword() {
  const navigate  = useNavigate();
  const component = useRef<HTMLDivElement>(null);

  const [step, setStep]           = useState<Step>("form");
  const [email, setEmail]         = useState("");
  const [fullName, setFullName]   = useState("");
  const [message, setMessage]     = useState("");
  const [mfaCode, setMfaCode]     = useState("");
  const [lastTransferredFile, setLastTransferredFile] = useState("");
  const [estimatedRegistrationDate, setEstimatedRegistrationDate] = useState("");
  const [loading, setLoading]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Animations (identical to SignIn / SignUp) ─────────────────────────────
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const lenis = new Lenis();
    function raf(time: number) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    const ctx = gsap.context(() => {
      gsap.from(".form-reveal", {
        opacity: 0, y: 40, duration: 1.2, stagger: 0.2,
        ease: "power3.out", delay: 0.3,
      });
      gsap.to(".global-particles", {
        opacity: 0,
        scrollTrigger: { trigger: "footer", start: "top bottom", end: "top 60%", scrub: true },
      });
    }, component);

    return () => { ctx.revert(); lenis.destroy(); };
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async (code?: string) => {
    setFormError(null);
    setLoading(true);
    const res = await apiSubmitRecoveryRequest({
      email, fullName,
      message: message.trim() || undefined,
      mfaCode: (code ?? mfaCode) || undefined,
      lastTransferredFile: lastTransferredFile.trim() || undefined,
      estimatedRegistrationDate: estimatedRegistrationDate.trim() || undefined,
    });
    setLoading(false);

    if (res.error === "MFA_REQUIRED" || res.mfaRequired) {
      setStep("mfa");
      toast.info("Your account requires MFA verification.");
      return;
    }
    if (res.error === "RECOVERY_FIELDS_REQUIRED") {
      setFormError("MFA is not enabled on this account. You must provide the last transferred file and estimated registration date to verify your identity.");
      return;
    }
    if (res.error === "INVALID_CODE") {
      setFormError("Invalid MFA code. Please try again.");
      return;
    }
    if (res.error === "MFA_MAX_ATTEMPTS_EXCEEDED") {
      setFormError("Too many incorrect codes. Contact your administrator directly.");
      return;
    }
    if (!res.ok) {
      setFormError("Something went wrong. Please try again.");
      return;
    }
    setStep("done");
  };

  // ── Single return — shell never unmounts ──────────────────────────────────
  return (
    <div ref={component} className="relative min-h-screen bg-[#00010c] text-white flex flex-col selection:bg-blue-500/30 overflow-x-hidden">

      {/* Particles */}
      <div className="global-particles fixed inset-0 z-0 pointer-events-none">
        <BackgroundParticles />
        <div className="absolute inset-0 bg-gradient-to-b from-[#00010c] via-transparent to-[#00010c] opacity-40" />
      </div>

      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-10 h-10 bg-[#00d2ff] text-black rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-400/20 group-hover:scale-105 transition-transform">
            T
          </div>
          <span className="text-xl font-bold tracking-tight text-white uppercase italic">TFS</span>
        </div>
        <button
          onClick={() => navigate("/signin")}
          className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 hover:bg-[#00f2ff] hover:text-black hover:border-transparent transition-all text-xs font-bold uppercase tracking-widest backdrop-blur-md cursor-pointer"
        >
          Sign In
        </button>
      </nav>

      {/* Main */}
      <main className="relative z-10 flex-1 px-6 flex flex-col items-center justify-center py-20">
        <div className="relative w-full max-w-md mx-auto form-reveal">

          {/* ── STEP: DONE ─────────────────────────────────────────────── */}
          {step === "done" && (
            <>
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
                  Request <span className="text-[#00d2ff]">Sent</span>
                </h1>
                <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
                  Your request has been submitted to an administrator
                </p>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                <div className="relative z-10 space-y-6 text-center">
                  <div className="w-16 h-16 bg-green-400/10 border border-green-400/20 rounded-2xl flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} className="text-green-400" />
                  </div>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Once an administrator approves your request, you will receive a temporary password by email.
                    You will be required to change it immediately upon signing in.
                  </p>
                  <Button
                    onClick={() => navigate("/signin")}
                    className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 cursor-pointer"
                  >
                    Back to Sign In
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: MFA ──────────────────────────────────────────────── */}
          {step === "mfa" && (
            <>
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
                  MFA <span className="text-[#00d2ff]">Verification</span>
                </h1>
                <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
                  Identity confirmation required
                </p>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                <div className="relative z-10 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="mfa-code" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">
                      MFA Code
                    </Label>
                    <Input
                      id="mfa-code"
                      value={mfaCode}
                      onChange={e => setMfaCode(e.target.value.replace(/\s/g, ""))}
                      onKeyDown={e => { if (e.key === "Enter" && mfaCode.length >= 6 && !loading) submit(mfaCode); }}
                      placeholder="000000"
                      maxLength={8}
                      autoFocus
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 text-center text-2xl tracking-[0.5em] focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    />
                    <p className="text-white/20 text-[10px] text-center pt-1 uppercase tracking-widest">
                      6-digit TOTP · or · 8-digit backup code
                    </p>
                  </div>

                  {formError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <p className="text-red-400 text-xs font-bold uppercase tracking-wider">{formError}</p>
                    </div>
                  )}

                  <div className="bg-yellow-400/5 border border-yellow-400/15 rounded-xl p-4 flex items-start gap-3">
                    <ShieldAlert size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-yellow-400/70 text-[10px] leading-relaxed uppercase tracking-wide font-bold">
                      MFA is mandatory. Without your authenticator or backup code, account recovery is not possible — contact your administrator directly.
                    </p>
                  </div>

                  <Button
                    onClick={() => submit(mfaCode)}
                    disabled={loading || mfaCode.length < 6}
                    className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 cursor-pointer"
                  >
                    {loading ? "Verifying..." : "Verify & Submit Request"}
                  </Button>

                  <button
                    onClick={() => { setStep("form"); setMfaCode(""); setFormError(null); }}
                    className="w-full text-white/20 text-[10px] uppercase tracking-widest hover:text-white transition-colors"
                  >
                    ← Back to form
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: FORM ─────────────────────────────────────────────── */}
          {step === "form" && (
            <>
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
                  Key <span className="text-[#00d2ff]">Recovery</span>
                </h1>
                <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
                  Submit a recovery request to your administrator
                </p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                <form className="space-y-5 relative z-10" onSubmit={e => { e.preventDefault(); submit(); }}>
                  {/* Full Name */}
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">
                      Full Name
                    </Label>
                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="John Doe"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                      required
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="recov-email" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">
                      Account Email
                    </Label>
                    <Input
                      id="recov-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@nexus.com"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                      required
                    />
                  </div>

                  {/* Last Transferred File */}
                  <div className="space-y-2">
                    <Label htmlFor="last-transferred-file" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">
                      Last Transferred File{" "}
                      <span className="text-white/20 normal-case font-normal">(optional if MFA active)</span>
                    </Label>
                    <Input
                      id="last-transferred-file"
                      type="text"
                      value={lastTransferredFile}
                      onChange={e => setLastTransferredFile(e.target.value)}
                      placeholder="e.g. project_presentation.pdf"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    />
                  </div>

                  {/* Estimated Registration Date */}
                  <div className="space-y-2">
                    <Label htmlFor="estimated-registration-date" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">
                      Estimated Registration Date{" "}
                      <span className="text-white/20 normal-case font-normal">(optional if MFA active)</span>
                    </Label>
                    <Input
                      id="estimated-registration-date"
                      type="date"
                      value={estimatedRegistrationDate}
                      onChange={e => setEstimatedRegistrationDate(e.target.value)}
                      className="bg-white/5 border-white/10 text-white rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    />
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <Label className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">
                      Message{" "}
                      <span className="text-white/20 normal-case font-normal">(optional)</span>
                    </Label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Additional context for the administrator..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 text-white placeholder:text-white/10
                                 rounded-2xl p-4 text-sm focus:border-[#00d2ff]/50 focus:outline-none
                                 resize-none transition-all"
                    />
                  </div>

                  {formError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <p className="text-red-400 text-xs font-bold uppercase tracking-wider">{formError}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !email.trim() || !fullName.trim()}
                    className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 mt-2 cursor-pointer"
                  >
                    {loading ? "Submitting..." : "Submit Recovery Request"}
                  </Button>
                </form>

                <div className="mt-8 text-center space-y-4 relative z-10">
                  <p className="text-white/30 text-[11px] font-bold uppercase tracking-wider">
                    Remembered your password?{" "}
                    <Link to="/signin" className="text-[#00d2ff] hover:text-white transition-colors cursor-pointer">
                      Authorize Access
                    </Link>
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Bottom link — always visible */}
          {step !== "done" && (
            <div className="mt-8 text-center">
              <Link to="/" className="text-white/20 hover:text-[#00d2ff] transition-colors text-[10px] uppercase font-black tracking-[0.2em] cursor-pointer">
                ← System Override: Return to Landing
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-24 px-6 bg-black/40 backdrop-blur-3xl mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-12">
          <div className="text-[min(13vw,6rem)] lg:text-8xl font-black leading-[0.75] tracking-tighter uppercase italic select-none text-center pt-10">
            <div><span className="text-white/30">An impenetrable</span></div>
            <div><span className="text-white/50">place.</span></div>
            <div><span className="text-[#00d2ff]/50">Sounds right</span></div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between w-full pt-12 border-t border-white/5 gap-8">
            <div className="text-white/40 text-[10px] font-bold tracking-[0.2em] uppercase">
              &copy; 2026 Trusted File System. Secure Node Alpha.
            </div>
            <div className="flex items-center space-x-8 text-white/20 text-[10px] font-black uppercase tracking-[0.2em]">
              <a href="#" className="hover:text-[#00d2ff] transition-colors">Integrity</a>
              <a href="#" className="hover:text-[#00d2ff] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[#00d2ff] transition-colors">Nodes</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}