import { useLayoutEffect, useRef } from "react";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router";
import { ParticleLock } from "../components/ui/ParticleLock";
import { BackgroundParticles } from "../components/ui/BackgroundParticles";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function Welcome() {
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
      // Hero Animations
      gsap.from(".hero-content", {
        opacity: 0,
        y: 60,
        duration: 1.5,
        ease: "power4.out",
        delay: 0.2
      });

      // Reveal Animations for Scroll
      const revealItems = gsap.utils.toArray(".reveal-text, .reveal-card");
      revealItems.forEach((item: any) => {
        gsap.to(item, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.2,
          ease: "power3.out",
          scrollTrigger: {
            trigger: item,
            start: "top 85%",
            toggleActions: "play none none none"
          }
        });
      });

      // Stats Reveal & Count-up Animation
      gsap.from(".reveal-stat", {
        opacity: 0,
        y: 30,
        scale: 0.95,
        duration: 1,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".stats-container",
          start: "top 75%",
          toggleActions: "play none none none"
        },
        onComplete: () => {
          const counters = document.querySelectorAll(".count-up");
          counters.forEach((el: any) => {
            const target = parseFloat(el.getAttribute("data-value") || "0");
            const decimals = parseInt(el.getAttribute("data-decimals") || "0");
            const obj = { val: 0 };
            gsap.to(obj, {
              val: target,
              duration: 2.5,
              ease: "power2.out",
              onUpdate: () => {
                el.innerText = obj.val.toFixed(decimals);
              }
            });
          });
        }
      });

      // Split text reveal simulation for the large paragraph
      gsap.to(".progressive-text", {
        backgroundPositionY: "0%",
        stagger: 1,
        scrollTrigger: {
          trigger: ".progressive-text",
          start: "top bottom",
          end: "220",
          scrub: true
        }
      });

      // Hero Buttons Reveal
      gsap.from(".hero-btns-reveal", {
        opacity: 0,
        y: 20,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".hero-btns-reveal",
          start: "top 95%",
          toggleActions: "play none none reverse"
        }
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

  return (
    <div ref={component} className="relative min-h-screen bg-[#00010c] text-white flex flex-col selection:bg-blue-500/30 overflow-x-hidden">
      {/* Global Ambient Background Particles */}
      <div className="global-particles fixed inset-0 z-0 pointer-events-none">
        <BackgroundParticles />
        <div className="absolute inset-0 bg-gradient-to-b from-[#00010c] via-transparent to-[#00010c] opacity-40"></div>
      </div>
      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full scroll-exit">
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

      {/* ── Hero Section ───────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 px-6 flex flex-col items-center justify-center pt-24 pb-40">
        <div className="text-center max-w-5xl mx-auto hero-content scroll-exit">
          {/* Tagline Badge inspired by 73 strings */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[#00d2ff] text-[8px] lg:text-[10px] font-black tracking-[0.3em] uppercase mb-12">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Next-Gen Data Guardianship
          </div>

          <h1 className="text-[min(17vw,8rem)] font-black mb-12 leading-[0.85] tracking-tighter uppercase italic">
            <div><span className="text-white opacity-40">Transfer</span></div>
            <div><span className="text-white">Your Files</span></div>
            <div><span className="text-[#00d2ff]">Securely</span></div>
          </h1>

          <p className="progressive-text text-xl md:text-3xl font-medium max-w-3xl mx-auto mb-16 leading-relaxed text-white/20"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #fff 50%, rgba(255,255,255,0.1) 51%)',
              backgroundSize: '100% 200%',
              backgroundPositionY: '100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
            Decoding the future of secure data infrastructure by building the world's most resilient encryption protocols for global enterprise assets.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 hero-btns-reveal">
            <Button
              onClick={() => navigate("/signin")}
              className="h-16 px-12 rounded-full bg-[#00f2ff] hover:bg-white text-black font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              Sign In
            </Button>
            <Button
              onClick={() => navigate("/signup")}
              variant="outline"
              className="h-16 px-12 rounded-full border-[#00d2ff]/30 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-black text-sm uppercase tracking-widest backdrop-blur-md transition-all duration-500 hover:shadow-[0_0_25px_rgba(0,210,255,0.2)] hover:scale-105 active:scale-95 cursor-pointer"
            >
              Sign Up
            </Button>
          </div>
        </div>

        {/* ── Security Stats & Lock Section ────────────────────────── */}
        <section id="security" className="relative w-full py-32 overflow-hidden mt-20">
          <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 px-6 items-center stats-container">
            {/* Left: 3D Particle Lock */}
            <div className="relative w-[calc(100%+30px)] ml-[5px] h-[500px] md:h-[600px] order-2 md:order-1 hidden lg:block">
              {typeof window !== 'undefined' && window.innerWidth >= 1024 && <ParticleLock />}
              {/* Top Fade */}
              <div className="absolute inset-x-0 top-0 h-[1%] bg-[#00010c] pointer-events-none z-10"></div>
              {/* Bottom Fade */}
              <div className="absolute inset-x-0 bottom-0 h-[1%] bg-[#00010c] pointer-events-none z-10"></div>
              {/* Left Fade */}
              <div className="absolute inset-y-0 left-0 w-[1%] bg-[#00010c] pointer-events-none z-10"></div>
              {/* Right Fade */}
              <div className="absolute inset-y-0 right-0 w-[1%] bg-[#00010c] pointer-events-none z-10"></div>
            </div>

            {/* Right: Security Metrics */}
            <div className="flex flex-col gap-12 md:gap-16 order-1 md:order-2 stats-section lg:pl-[130px]">
              {[
                { label: "Secure Transfer Ratio", value: 99.9, suffix: "%", decimals: 1 },
                { label: "Neutralized Cyber Threats", value: 1.2, suffix: "M+", decimals: 1 },
                { label: "Data Integrity Guarantee", value: 100, suffix: "%", decimals: 0 }
              ].map((stat, i) => (
                <div key={i} className="text-center lg:text-left reveal-stat group">
                  <div className="text-6xl md:text-8xl font-black text-[#00d2ff] mb-2 tracking-tighter italic tabular-nums group-hover:scale-105 transition-transform origin-center lg:origin-left">
                    <span className="count-up" data-value={stat.value} data-decimals={stat.decimals}>0</span>
                    {stat.suffix}
                  </div>
                  <div className="text-white/40 uppercase tracking-[0.4em] text-[10px] font-black leading-relaxed pl-1">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features Grid ─────────────────────────────────────────────── */}
        <div id="features" className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto w-full mt-60 px-4">
          {[
            {
              title: "AES-256-GCM Core",
              desc: "Military-grade encryption protocols that evolve with emerging threat vectors.",
              icon: "🛡️",
            },
            {
              title: "Sharded Storage",
              desc: "Fragmented data distribution across geopolitical zones for absolute redundancy.",
              icon: "🧩",
            },
            {
              title: "Neural Access",
              desc: "Zero-knowledge proofs with biometric hardware key integration.",
              icon: "🧠",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="reveal-card scroll-exit group p-10 rounded-[3rem] bg-white/[0.02] border border-white/[0.05] backdrop-blur-3xl hover:bg-white/[0.05] transition-all"
            >
              <div className="w-16 h-16 rounded-3xl bg-[#00d2ff]/10 flex items-center justify-center text-3xl mb-8 border border-white/10">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter italic group-hover:text-[#00d2ff] transition-colors">
                {feature.title}
              </h3>
              <p className="text-white/40 leading-relaxed text-sm font-medium">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-24 px-6 bg-black/40 backdrop-blur-3xl">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-12">
          <div className="text-[min(13vw,6rem)] font-black leading-[0.75] tracking-tighter uppercase italic select-none text-center stats-section pt-10">
            <div><span className="text-white/30">An impenetrable</span></div>
            <div><span className="text-white/50">place.</span></div>
            <div><span className="text-[#00d2ff]/50">Sounds right</span></div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between w-full pt-12 border-t border-white/5 gap-8">
            <div className="text-white/40 text-[10px] font-bold tracking-[0.2em] uppercase">
              © 2025 TFS Layer. All Rights Reserved.
            </div>
            <div className="flex items-center gap-10 text-[10px] font-black tracking-widest uppercase text-white/40">
              <a href="#" className="hover:text-[#00f2ff] transition-colors">Status</a>
              <a href="#" className="hover:text-[#00f2ff] transition-colors">Security</a>
              <a href="#" className="hover:text-[#00f2ff] transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

