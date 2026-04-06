import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router";
import { apiSignUp } from "../api/auth";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function SignUp() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const component = useRef<HTMLDivElement>(null);

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
      toast.error("Passwords do not match");
      return;
    }
    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiSignUp({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      if (!result.ok) {
        const messages: Record<string, string> = {
          EMAIL_TAKEN:        "An account with this email already exists.",
          PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
          NETWORK_ERROR:      "Cannot reach the server. Please try again.",
        };
        toast.error(messages[result.error ?? ""] ?? "Failed to create account. Please try again.");
        return;
      }

      toast.success("Account created successfully! Please sign in.");
      navigate("/signin");
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">Access Key</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all text-xs"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-white/40 text-[10px] uppercase font-black tracking-widest pl-1">Confirm Key</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/10 rounded-2xl h-14 focus:border-[#00d2ff]/50 focus:ring-0 transition-all text-xs"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-[#00f2ff] hover:bg-white text-black font-black uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 mt-4"
              >
                {isLoading ? "Provisioning..." : "Initialize Profile"}
              </Button>
            </form>

            <div className="mt-8 text-center space-y-4 relative z-10">
              <p className="text-white/30 text-[11px] font-bold uppercase tracking-wider">
                Already registered?{" "}
                <Link to="/signin" className="text-[#00d2ff] hover:text-white transition-colors">
                  Authorize Access
                </Link>
              </p>
            </div>
          </div>

          {/* Links */}
          <div className="mt-8 text-center">
            <Link to="/" className="text-white/20 hover:text-[#00d2ff] transition-colors text-[10px] uppercase font-black tracking-[0.2em]">
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
