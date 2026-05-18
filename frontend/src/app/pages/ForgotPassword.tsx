import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Send, ShieldAlert, CheckCircle2 } from "lucide-react";
import { csrfFetch } from "../lib/csrfFetch";

gsap.registerPlugin(ScrollTrigger);

export function ForgotPassword() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    registrationDate: "",
    lastFile: "",
    message: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const component = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const lenis = new Lenis();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    let ctx = gsap.context(() => {
      gsap.from(".form-reveal", {
        opacity: 0,
        y: 40,
        duration: 1.2,
        stagger: 0.2,
        ease: "power3.out",
        delay: 0.3,
      });

      gsap.to(".global-particles", {
        opacity: 0,
        scrollTrigger: {
          trigger: "footer",
          start: "top bottom",
          end: "top 60%",
          scrub: true,
        },
      });
    }, component);

    return () => {
      ctx.revert();
      lenis.destroy();
    };
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.fullName.trim() ||
      !formData.email.trim() ||
      !formData.message.trim()
    ) {
      setFormError("Full name, email, and message are required fields.");
      return;
    }

    setIsLoading(true);
    setFormError(null);

    try {
      // Send recovery request to the backend which forwards to admin Gmail
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const response = await csrfFetch(`${API_BASE_URL}/auth/recovery-request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          registrationDate: formData.registrationDate || null,
          lastFile: formData.lastFile || null,
          message: formData.message,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const messages: Record<string, string> = {
          MISSING_FIELDS: "Please fill in all required fields.",
          INVALID_EMAIL: "Please enter a valid email address.",
          TOO_MANY_REQUESTS: "Too many requests. Please try again later.",
          NETWORK_ERROR: "Cannot reach the server. Please try again.",
        };
        const message =
          messages[data?.error ?? ""] ??
          "Failed to send request. Please try again.";
        setFormError(message);
        toast.error(message);
        return;
      }

      setIsSubmitted(true);
      window.scrollTo(0, 0);
      toast.success("Recovery request transmitted to administration.");
    } catch {
      toast.error("An unexpected error occurred.");
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      ref={component}
      className="relative min-h-screen bg-[#00010c] text-white flex flex-col selection:bg-blue-500/30 overflow-x-hidden"
    >
      {/* Global Ambient Background Particles */}
      <div className="global-particles fixed inset-0 z-0 pointer-events-none">
        <BackgroundParticles />
        <div className="absolute inset-0 bg-gradient-to-b from-[#00010c] via-transparent to-[#00010c] opacity-40"></div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div
          className="flex items-center space-x-3 group cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div className="w-10 h-10 bg-[#00d2ff] text-black rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-400/20 group-hover:scale-105 transition-transform">
            T
          </div>
          <span className="text-xl font-bold tracking-tight text-white uppercase italic">
            TFS
          </span>
        </div>

        <button
          onClick={() => navigate("/signin")}
          className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 hover:bg-[#00f2ff] hover:text-black hover:border-transparent transition-all text-xs font-bold uppercase tracking-widest backdrop-blur-md cursor-pointer"
        >
          Sign In
        </button>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 px-6 flex flex-col items-center justify-center py-20">
        <div className="relative w-full max-w-md mx-auto form-reveal">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShieldAlert size={24} className="text-amber-400" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
              Key <span className="text-[#00d2ff]">Recovery</span>
            </h1>
            <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
              Submit an identity verification request to administration
            </p>
          </div>

          {!isSubmitted ? (
            /* ── Recovery Form ─────────────────────────────────────────── */
            <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

              {/* Info Banner */}
              <div className="mb-8 p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl flex gap-3 items-start">
                <div className="w-1 h-full min-h-[2rem] rounded-full bg-amber-500/40 flex-shrink-0 mt-0.5"></div>
                <p className="text-amber-400/70 text-[10px] font-bold uppercase tracking-wider leading-relaxed">
                  Your request will be reviewed by the system administrator. A
                  new temporary access key will be transmitted to your registered
                  email once your identity is confirmed.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-5 relative z-10"
              >
                {/* Full Name */}
                <div className="space-y-2">
                  <Label
                    htmlFor="fullName"
                    className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1"
                  >
                    Full Name{" "}
                    <span className="text-[#00d2ff]/60 ml-1">*</span>
                  </Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="John Doe"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    required
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1"
                  >
                    Account Email{" "}
                    <span className="text-[#00d2ff]/60 ml-1">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="name@nexus.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    required
                  />
                </div>

                {/* Registration Date */}
                <div className="space-y-2">
                  <Label
                    htmlFor="registrationDate"
                    className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1"
                  >
                    Approximate Registration Date{" "}
                    <span className="text-white/20 ml-1">(optional)</span>
                  </Label>
                  <Input
                    id="registrationDate"
                    name="registrationDate"
                    type="text"
                    value={formData.registrationDate}
                    onChange={handleInputChange}
                    placeholder="e.g. March 2025, early 2024…"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                  />
                </div>

                {/* Last File */}
                <div className="space-y-2">
                  <Label
                    htmlFor="lastFile"
                    className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1"
                  >
                    Last File / Folder Transferred{" "}
                    <span className="text-white/20 ml-1">(optional)</span>
                  </Label>
                  <Input
                    id="lastFile"
                    name="lastFile"
                    type="text"
                    value={formData.lastFile}
                    onChange={handleInputChange}
                    placeholder="e.g. project_backup.zip, /invoices/2025…"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                  />
                </div>

                {/* Free Message */}
                <div className="space-y-2">
                  <Label
                    htmlFor="message"
                    className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1"
                  >
                    Recovery Message{" "}
                    <span className="text-[#00d2ff]/60 ml-1">*</span>
                  </Label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Describe how you lost access to your account and any additional details that may help verify your identity…"
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 text-white placeholder:text-white/10 rounded-2xl px-4 py-4 text-sm focus:border-[#00d2ff]/50 focus:outline-none transition-all resize-none"
                    required
                  />
                </div>

                {formError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0"></div>
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wider">
                      {formError}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 mt-4 cursor-pointer flex items-center justify-center gap-3"
                >
                  {isLoading ? (
                    "Transmitting..."
                  ) : (
                    <>
                      <Send size={16} />
                      Transmit Recovery Request
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center space-y-4 relative z-10">
                <p className="text-white/30 text-[11px] font-bold uppercase tracking-wider">
                  Remembered your key?{" "}
                  <Link
                    to="/signin"
                    className="text-[#00d2ff] hover:text-white transition-colors cursor-pointer"
                  >
                    Authorize Access
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            /* ── Success State ─────────────────────────────────────────── */
            <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden text-center">
              <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent pointer-events-none"></div>

              <div className="relative z-10 flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-3xl bg-[#00d2ff]/10 border border-[#00d2ff]/20 flex items-center justify-center">
                  <CheckCircle2 size={36} className="text-[#00d2ff]" />
                </div>

                <div>
                  <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-3">
                    Request <span className="text-[#00d2ff]">Transmitted</span>
                  </h2>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-widest leading-relaxed max-w-xs mx-auto">
                    Your identity verification request has been forwarded to the
                    system administrator. Check your inbox — a response will be
                    sent once your identity is confirmed.
                  </p>
                </div>

                <div className="w-full p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl mt-2">
                  <p className="text-white/20 text-[9px] font-black uppercase tracking-[0.2em] mb-2">
                    Request submitted for
                  </p>
                  <p className="text-[#00d2ff] text-sm font-black tracking-wide truncate">
                    {formData.email}
                  </p>
                </div>

                <Button
                  onClick={() => navigate("/signin")}
                  className="w-full h-14 bg-white/10 hover:bg-[#00f2ff] hover:text-black border border-white/10 hover:border-transparent text-white font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer mt-2"
                >
                  Return to Sign In
                </Button>
              </div>
            </div>
          )}

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link
              to="/"
              className="text-white/20 hover:text-[#00d2ff] transition-colors text-[10px] uppercase font-black tracking-[0.2em] cursor-pointer"
            >
              ← System Override: Return to Landing
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-24 px-6 bg-black/40 backdrop-blur-3xl mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-12">
          <div className="text-[min(13vw,6rem)] lg:text-8xl font-black leading-[0.75] tracking-tighter uppercase italic select-none text-center stats-section pt-10">
            <div>
              <span className="text-white/30">An impenetrable</span>
            </div>
            <div>
              <span className="text-white/50">place.</span>
            </div>
            <div>
              <span className="text-[#00d2ff]/50">Sounds right</span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between w-full pt-12 border-t border-white/5 gap-8">
            <div className="text-white/40 text-[10px] font-bold tracking-[0.2em] uppercase">
              &copy; 2026 Trusted File System. Secure Node Alpha.
            </div>

            <div className="flex items-center space-x-8 text-white/20 text-[10px] font-black uppercase tracking-[0.2em]">
              <a href="#" className="hover:text-[#00d2ff] transition-colors">
                Integrity
              </a>
              <a href="#" className="hover:text-[#00d2ff] transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-[#00d2ff] transition-colors">
                Nodes
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}