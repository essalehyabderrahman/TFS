import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { apiSetupMfa, apiEnableMfa } from "../api/auth";
import { useAuth } from "../hooks/useAuth";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import { Copy, Check, ShieldCheck } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function MfaSetup() {
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasCopied, setHasCopied] = useState(false);
  
  const navigate = useNavigate();
  const { user, signIn, isMfaPending } = useAuth();
  const component = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSetup = async () => {
      try {
        const result = await apiSetupMfa();
        if (result.ok && result.secret && result.qrCode) {
          setSetupData({ secret: result.secret, qrCode: result.qrCode });
          setBackupCode(result.backupCode ?? null);
        } else {
          if (result.error === "MFA_ALREADY_ENABLED") {
            toast.error("MFA is already active on this account. Disable it first before re-enrolling.")
            return
          }
          toast.error("Failed to initialize MFA setup. Please try again.")
          const isOnboarding = !user?.mfaEnabled
          navigate(isOnboarding ? "/signin" : "/dashboard/security", { replace: true })
        }
      } catch (err) {
        toast.error("An unexpected error occurred.");
      } finally {
        setIsInitializing(false);
      }
    };

    fetchSetup();
  }, [navigate]);

  useLayoutEffect(() => {
    // Force scroll to top on refresh
    window.scrollTo(0, 0);
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Initialize Lenis Smooth Scroll
    const lenis = new Lenis();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    let ctx = gsap.context(() => {
      // Entry Animations
      gsap.from(".form-reveal", {
        opacity: 0,
        y: 40,
        duration: 1.2,
        stagger: 0.2,
        ease: "power3.out",
        delay: 0.3
      });

      // Global Background Particles Fade for Footer
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
  }, []);

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length < 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiEnableMfa(code);
      if (!result.ok) {
        toast.error(result.error === "INVALID_CODE" ? "Invalid verification code." : "Activation failed. Please try again.");
        return;
      }
      if (result.user) signIn(result.user, false);
      // Show backup code modal before navigating — user must acknowledge
      setShowBackupModal(true);
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setHasCopied(true);
      toast.success("Secret copied to clipboard");
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#00010c] text-white flex items-center justify-center font-black uppercase tracking-[0.5em] italic animate-pulse">
        Initializing Secure Protocol...
      </div>
    );
  }

  return (
    <div ref={component} className="relative min-h-screen bg-[#00010c] text-white flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      {showBackupModal && backupCode && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-[#0d1321] border border-[#00d2ff]/30 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
              {/* Top accent */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#00d2ff]/60 to-transparent" />

              {/* Warning icon */}
              <div className="w-14 h-14 rounded-full bg-[#00d2ff]/10 border border-[#00d2ff]/30 flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={28} className="text-[#00d2ff]" />
              </div>

              <h2 className="text-white font-black text-xl uppercase italic tracking-tight text-center mb-2">
                Save Your Backup Code
              </h2>
              <p className="text-white/50 text-[10px] uppercase tracking-widest text-center font-bold mb-6">
                This code will never be shown again
              </p>

              <p className="text-white/60 text-xs text-center leading-relaxed mb-6">
                If you ever lose access to your authenticator app, this is your only way back in.
                Store it somewhere safe — a password manager, printed paper, or secure note.
                You can regenerate it later from security settings using your authenticator app.
              </p>

              {/* The code itself */}
              <div className="bg-black/50 border border-white/10 rounded-xl px-4 py-5 text-center font-mono text-white text-2xl tracking-[0.4em] select-all mb-4">
                {backupCode}
              </div>

              {/* Copy button */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(backupCode)
                  toast.success("Backup code copied to clipboard")
                }}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-3 hover:bg-white/10 transition-all cursor-pointer mb-3"
              >
                <Copy size={14} className="text-white/40" />
                <span className="text-white/70 text-[9px] uppercase font-black tracking-widest">
                  Copy to Clipboard
                </span>
              </button>

              {/* Acknowledgment — only this closes the modal and proceeds */}
              <button
                type="button"
                onClick={() => {
                  setShowBackupModal(false)
                  navigate("/dashboard")
                }}
                className="w-full h-12 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                I have saved it — Continue
              </button>

              {/* Warning that closing without saving is permanent */}
              <p className="text-white/20 text-[9px] uppercase tracking-widest text-center font-bold mt-4">
                Closing this without saving means you will need to regenerate the code from security settings
              </p>
            </div>
          </div>
        </>
      )}
      {/* Global Ambient Background Particles */}
      <div className="global-particles fixed inset-0 z-0 pointer-events-none">
        <BackgroundParticles />
        <div className="absolute inset-0 bg-gradient-to-b from-[#00010c] via-transparent to-[#00010c] opacity-40"></div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div
          className={`flex items-center space-x-3 group ${isMfaPending ? "cursor-default" : "cursor-pointer"}`}
          onClick={() => { if (!isMfaPending) navigate("/") }}
        >
          <div className="w-10 h-10 bg-[#00d2ff] text-black rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-400/20 group-hover:scale-105 transition-transform">
            T
          </div>
          <span className="text-xl font-bold tracking-tight text-white uppercase italic">
            TFS
          </span>
        </div>

        {!isMfaPending && (
          <button
            onClick={() => navigate("/dashboard/account")}
            className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 hover:bg-[#00f2ff] hover:text-black hover:border-transparent transition-all text-xs font-bold uppercase tracking-widest backdrop-blur-md cursor-pointer"
          >
            ← Back
          </button>
        )}
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 px-6 flex flex-col items-center justify-center py-20">
        <div className="relative w-full max-w-2xl mx-auto form-reveal">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
              MFA <span className="text-[#00d2ff]">Activation</span>
            </h1>
            <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
              Provision your cryptographic authenticator
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Step 1: Scan QR */}
            <div className="flex flex-col bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
               <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#00d2ff]/50 to-transparent"></div>
               
               <h3 className="text-white/80 text-[10px] uppercase font-black tracking-widest mb-6 text-center">Step 01: Scan Protocol</h3>
               
               <div className="relative aspect-square max-w-[200px] mx-auto mb-6 p-4 bg-white rounded-3xl shadow-[0_0_50px_rgba(0,210,255,0.1)] group-hover:scale-[1.02] transition-transform duration-500">
                  <img 
                    src={setupData?.qrCode} 
                    alt="MFA QR Code" 
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 border-4 border-black/5 rounded-3xl pointer-events-none"></div>
               </div>

               <div className="mt-auto space-y-4">
                  <p className="text-white/60 text-[9px] uppercase tracking-widest leading-relaxed text-center font-bold px-4">
                    Scan this matrix with your biometric authenticator application (Google / Microsoft Auth)
                  </p>
                  
                  <div className="pt-4 border-t border-white/5">
                    <button 
                      onClick={copyToClipboard}
                      className="w-full py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-3 hover:bg-white/10 transition-all group/copy cursor-pointer"
                    >
                      <span className="text-white/70 text-[9px] uppercase font-black tracking-widest">
                        {hasCopied ? "Identity Copied" : "Manual Secret Copy"}
                      </span>
                      {hasCopied ? <Check size={14} className="text-[#00d2ff]" /> : <Copy size={14} className="text-white/40 group-hover/copy:text-white/80 transition-colors" />}
                    </button>
                  </div>
               </div>
            </div>

            {/* Step 2: Verify Code */}
            <div className="flex flex-col bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
               <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#00d2ff]/50 to-transparent"></div>
               
               <h3 className="text-white/80 text-[10px] uppercase font-black tracking-widest mb-6 text-center">Step 02: Verification</h3>

               <form onSubmit={handleEnable} className="flex-1 flex flex-col">
                  <div className="space-y-6 my-auto">
                    <div className="space-y-4">
                      <Label htmlFor="code" className="text-white/60 text-[10px] uppercase font-black tracking-widest block text-center">
                        Confirmation Code
                      </Label>
                      <Input
                        id="code"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-2xl h-16 text-center text-3xl font-black tracking-[0.2em] focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                        required
                      />
                    </div>
                    
                    <p className="text-center text-white/60 text-[9px] uppercase tracking-widest font-bold leading-relaxed px-4">
                      Enter the 6-digit sequence generated by your application to commit activation.
                    </p>
                  </div>

                  <div className="mt-auto pt-4 border-t border-transparent">
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 h-auto bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 cursor-pointer"
                    >
                      {isLoading ? "Synchronizing..." : "Enable Guardian"}
                    </Button>
                  </div>
               </form>
            </div>
          </div>



          {/* Links */}
          <div className="mt-12 text-center">
            {!isMfaPending && (
              <button
                onClick={() => navigate("/dashboard/account")}
                className="text-white/20 hover:text-[#00d2ff] transition-colors text-[10px] uppercase font-black tracking-[0.2em] cursor-pointer bg-transparent border-none"
              >
                ← Return to Account Settings
              </button>
            )}
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
          </div>
        </div>
      </footer>
    </div>
  );
}
