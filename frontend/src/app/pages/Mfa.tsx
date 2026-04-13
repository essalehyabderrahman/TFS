import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { apiVerifyMfa } from "../api/auth";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function Mfa() {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBackupMode, setIsBackupMode] = useState(false);
  const navigate = useNavigate();
  const { isMfaPending, isInitializing, signIn, clearSession } = useAuth();
  const component = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInitializing) return;
    if (!isMfaPending) {
      navigate("/signin", { replace: true });
    }
  }, [isInitializing, isMfaPending, navigate]);

  // Animations in useLayoutEffect — only runs when guard passed
  useLayoutEffect(() => {
    if (isInitializing || !isMfaPending) return;

    window.scrollTo(0, 0);
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const lenis = new Lenis();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    const ctx = gsap.context(() => {
      gsap.from(".form-reveal", {
        opacity: 0,
        y: 40,
        duration: 1.2,
        stagger: 0.2,
        ease: "power3.out",
        delay: 0.3
      });
      gsap.to(".global-particles", {
        opacity: 0,
        scrollTrigger: {
          trigger: "footer",
          start: "top bottom",
          end: "top 60%",
          scrub: true,
        }
      });
    }, component);

    return () => {
      ctx.revert();
      lenis.destroy();
    };
  }, [isInitializing, isMfaPending]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || (isBackupMode ? code.length !== 8 : code.length !== 6)) {
      toast.error(isBackupMode ? "Please enter a valid 8-digit backup code" : "Please enter a valid 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiVerifyMfa({ code });

      if (!result.ok) {
        const messages: Record<string, string> = {
          INVALID_CODE: "Invalid verification code.",
          EXPIRED_TOKEN: "Verification session expired. Please sign in again.",
          TOTP_REPLAY: "Code already used. Please wait for a new code.",
          MFA_MAX_ATTEMPTS: "Too many attempts. Please sign in again.",
          MFA_MAX_ATTEMPTS_EXCEEDED: "Too many attempts. Please sign in again.",
          MFA_LOCKED: "MFA temporarily unavailable. Please sign in again.",
          TOO_MANY_REQUESTS: "Too many attempts. Please wait and try again.",
          NETWORK_ERROR: "Cannot reach the server. Please try again.",
          UNAUTHORIZED: "Session expired. Please sign in again.",
        };
        toast.error(messages[result.error ?? ""] ?? "Verification failed. Please try again.");

        if (result.error === "EXPIRED_TOKEN" || result.error === "MFA_MAX_ATTEMPTS" || result.error === "MFA_MAX_ATTEMPTS_EXCEEDED" || result.error === "MFA_LOCKED" || result.error === "UNAUTHORIZED") {
          // Clear any partial session state
          clearSession();
          navigate("/signin", { replace: true });
        }
        return;
      }

      // Store token (Rotation handled by backend returning a new token)
      // Cookie is automatically stored

      // Update global auth state
      if (result.user) signIn(result.user);

      toast.success("Identity verified!");
      navigate("/dashboard");
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    clearSession();
    navigate("/signin", { replace: true });
  };

  return (
    <div ref={component} className="relative min-h-screen bg-[#00010c] text-white flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      {/* Global Ambient Background Particles */}
      <div className="global-particles fixed inset-0 z-0 pointer-events-none">
        <BackgroundParticles />
        <div className="absolute inset-0 bg-gradient-to-b from-[#00010c] via-transparent to-[#00010c] opacity-40"></div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-10 h-10 bg-[#00d2ff] text-black rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-400/20 group-hover:scale-105 transition-transform">
            T
          </div>
          <span className="text-xl font-bold tracking-tight text-white uppercase italic">
            TFS
          </span>
        </div>

        <button
          onClick={handleCancel}
          className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 hover:bg-[#00f2ff] hover:text-black hover:border-transparent transition-all text-xs font-bold uppercase tracking-widest backdrop-blur-md cursor-pointer"
        >
          Cancel
        </button>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 px-6 flex flex-col items-center justify-center py-20">
        <div className="relative w-full max-w-md mx-auto form-reveal">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
              Secure <span className="text-[#00d2ff]">Verification</span>
            </h1>
            <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
              Enter the authentication vector to proceed
            </p>
          </div>

          {/* MFA Form */}
          <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

            <form onSubmit={handleVerify} className="space-y-8 relative z-10">
              <div className="space-y-4">
                <Label htmlFor="code" className="text-white/40 text-[10px] uppercase font-black tracking-widest block text-center">
                  Verification Code
                </Label>
                <div className="relative">
                  <Input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, isBackupMode ? 8 : 6))}
                    placeholder={isBackupMode ? "00000000" : "000 000"}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-20 text-center text-4xl font-black tracking-[0.3em] focus:border-[#00d2ff]/50 focus:ring-0 transition-all selection:bg-[#00d2ff]/20"
                    required
                    autoFocus
                  />
                  <div className="absolute inset-0 pointer-events-none rounded-2xl border border-white/5 bg-gradient-to-t from-white/[0.02] to-transparent"></div>
                </div>
                <p className="text-white/20 text-[9px] uppercase tracking-widest font-black text-center">
                  Codes refresh every 30 seconds in your authenticator app
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                {isLoading ? "Verifying..." : "Confirm Identity"}
              </Button>
            </form>

            <div className="mt-10 text-center space-y-4 relative z-10">
              <button
                type="button"
                onClick={() => { setIsBackupMode(m => !m); setCode(""); }}
                className="text-white/30 text-[10px] font-black uppercase tracking-widest hover:text-[#00d2ff] transition-colors cursor-pointer"
              >
                {isBackupMode ? "← Use authenticator app instead" : "Use a backup code instead"}
              </button>
            </div>

          </div>

          {/* Links — [Security] Use button+handleCancel, not a passive Link, to invalidate partial session */}
          <div className="mt-8 text-center">
            <button
              onClick={handleCancel}
              className="text-white/20 hover:text-[#00d2ff] transition-colors text-[10px] uppercase font-black tracking-[0.2em] cursor-pointer bg-transparent border-none"
            >
              ← Abort: Return to Secure Login
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-24 px-6 bg-black/40 backdrop-blur-3xl mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-12">
          <div className="text-[min(13vw,6rem)] lg:text-8xl font-black leading-[0.75] tracking-tighter uppercase italic select-none text-center stats-section pt-10">
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
