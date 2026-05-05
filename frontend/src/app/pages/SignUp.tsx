import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router";
import { apiSignUp } from "../api/auth";
import { useAuth } from "../hooks/useAuth";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Check, X, ShieldCheck } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

export function SignUp() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated, isInitializing, signIn } = useAuth();
  const component = useRef<HTMLDivElement>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, isInitializing, navigate]);

  // [Security] Password policy — must mirror backend _validate_password exactly
  const passwordRequirements = [
    { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
    { label: "Contains a number", test: (p: string) => /\d/.test(p) },
    { label: "Lowercase & Uppercase", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: "Special character", test: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(p) },
  ];

  const isPasswordStrong = passwordRequirements.every(req => req.test(formData.password));
  const doesPasswordMatch = formData.password && formData.password === formData.confirmPassword;

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setFormError("Identity confirmation failed: Access Keys do not match.");
      return;
    }
    if (!isPasswordStrong) {
      setFormError("Security protocol violation: Access Key strength does not meet requirements.");
      return;
    }

    setIsLoading(true);
    setFormError(null);
    try {
      const result = await apiSignUp({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      if (!result.ok) {
      const messages: Record<string, string> = {
          EMAIL_TAKEN:           "An account with this email already exists.",
          PASSWORD_TOO_SHORT:    "Password must be at least 12 characters.",
          PASSWORD_NO_UPPERCASE: "Password must contain an uppercase letter.",
          PASSWORD_NO_LOWERCASE: "Password must contain a lowercase letter.",
          PASSWORD_NO_DIGIT:     "Password must contain a number.",
          PASSWORD_NO_SYMBOL:    "Password must contain a special character.",
          MISSING_FIELDS:        "Please provide all required credentials.",
          SIGNUP_DISABLED:       "New account registration is currently disabled by the administrator.",
          NETWORK_ERROR:         "Cannot reach the server. Please try again.",
        };
        const message = messages[result.error ?? ""] ?? "Failed to create account. Please try again.";
        setFormError(message);
        toast.error(message);
        return;
      }

      // ── MFA Onboarding Flow ───────────────────────────────────────
      // The backend returns an HttpOnly cookie with mfa_pending: True
      if (result.user) signIn(result.user, true);

      toast.success("Profile initialized! Security protocol activation required.");
      navigate("/dashboard/mfa-setup");
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
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
            <h1 className="text-4xl md:text-5xl font-black mb-4 uppercase italic tracking-tighter">
              Create <span className="text-[#00d2ff]">Identity</span>
            </h1>
            <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">
              Initialize your secure cryptographic profile
            </p>
          </div>

          {/* Sign Up Form */}
          <div className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
            
            <form onSubmit={handleSignUp} className="space-y-5 relative z-10">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">Email Protocol</Label>
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

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">Access Key</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    required
                  />
                  
                  {formData.password && (
                    <div className="grid grid-cols-2 gap-2 mt-4 p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
                      {passwordRequirements.map((req, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {req.test(formData.password) ? (
                            <Check size={10} className="text-[#00d2ff]" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-white/10 ml-1"></div>
                          )}
                          <span className={`text-[9px] font-black uppercase tracking-tighter ${req.test(formData.password) ? 'text-white/60' : 'text-white/20'}`}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">Confirm Identity Key</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all"
                    required
                  />
                  
                  {formData.confirmPassword && (
                    <div className={`flex items-center gap-2 mt-1 pl-1 transition-all ${doesPasswordMatch ? 'opacity-100' : 'animate-pulse'}`}>
                      {doesPasswordMatch ? (
                        <>
                          <ShieldCheck size={12} className="text-[#00d2ff]" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#00d2ff]">Cryptographic match confirmed</span>
                        </>
                      ) : (
                        <>
                          <X size={12} className="text-red-500" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-red-500/60">Sequence mismatch detected</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                  <p className="text-red-400 text-xs font-bold uppercase tracking-wider">{formError}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 mt-4 cursor-pointer"
              >
                {isLoading ? "Provisioning..." : "Initialize Profile"}
              </Button>
            </form>

            <div className="mt-8 text-center space-y-4 relative z-10">
              <p className="text-white/30 text-[11px] font-bold uppercase tracking-wider">
                Already registered?{" "}
                <Link to="/signin" className="text-[#00d2ff] hover:text-white transition-colors cursor-pointer">
                  Authorize Access
                </Link>
              </p>
            </div>
          </div>

          {/* Links */}
          <div className="mt-8 text-center">
            <Link to="/" className="text-white/20 hover:text-[#00d2ff] transition-colors text-[10px] uppercase font-black tracking-[0.2em] cursor-pointer">
              ← System Override: Return to Landing
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-24 px-6 bg-black/40 backdrop-blur-3xl">
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
