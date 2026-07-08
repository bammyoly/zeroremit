import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  FileText,
  Layers,
  Heart,
  QrCode,
  Bell,
  Eye,
  GitBranch,
  BadgeCheck,
  Fingerprint,
  ShieldCheck,
  Zap,
  Globe,
  KeyRound,
  ArrowRight,
  ExternalLink,
  Cpu,
  BookOpen
} from 'lucide-react';


// ── Reveal hook ───────────────────────────────────────────────────────────────
function useReveal(threshold = 0.12, delay = 0) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          obs.disconnect(); // Only reveal once
      }},
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold, delay]);
  
  return [ref, visible];
}

const revealClass = (visible, delayClass = '') =>
  `transition-all duration-1000 ease-out ${delayClass} ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
  }`;

// ── Sleek Cryptographic Background ────────────────────────────────────────────
function CryptographicMatrix() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = canvas.getContext('2d');
    let raf;
    let running = true;
    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);

    const onResize = () => {
      if (!canvas) return;
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const fs = 14;
    const cols = Math.floor(w / fs) + 1;
    const drops = Array(cols).fill(1).map(() => Math.random() * -100); 
    const chars = '0123456789ABCDEFØXαβγ'.split('');

    function draw() {
      if (!running) return;
      ctx.fillStyle = 'rgba(9, 9, 11, 0.1)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `300 ${fs}px monospace`;
      
      for (let i = 0; i < drops.length; i++) {
        const t = chars[Math.floor(Math.random() * chars.length)];
        
        // Depth effect
        const opacity = Math.random() > 0.95 ? '0.6' : '0.15';
        const color = Math.random() > 0.99 ? `rgba(56, 189, 248, ${opacity})` : `rgba(113, 113, 122, ${opacity})`;
        
        ctx.fillStyle = color;
        if (drops[i] * fs > 0) {
           ctx.fillText(t, i * fs, drops[i] * fs);
        }
        
        if (drops[i] * fs > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.5; // Slowed down slightly for elegance
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none opacity-40 mix-blend-screen"
    />
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function StatChip({ value, label }) {
  return (
    <div className="relative group overflow-hidden flex flex-col items-center gap-2 p-5 min-w-[150px] border border-zinc-800/60 bg-zinc-950/50 backdrop-blur-sm transition-all duration-500 hover:border-sky-500/50 hover:bg-zinc-900/80 hover:-translate-y-1 hover:shadow-[0_8px_30px_-12px_rgba(56,189,248,0.2)] font-mono">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span className="relative z-10 text-2xl sm:text-3xl font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent tracking-tight group-hover:scale-105 transition-transform duration-500">{value}</span>
      <span className="relative z-10 text-[10px] text-zinc-400 uppercase tracking-widest font-semibold group-hover:text-sky-400 transition-colors duration-300">{label}</span>
    </div>
  );
}

// ── Encrypt/decrypt reveal text (continuous loop) ──────────────────────────
function CipherText({ text, className = '', active = true, pause = 3000 }) {
  const [display, setDisplay] = useState(text);
  const chars = '01ABCDEF#%&$Ø*+=';

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const scrambleOnce = () => {
      let frame = 0;
      const totalFrames = 30;
      const runFrame = () => {
        if (cancelled) return;
        frame++;
        const revealCount = Math.floor((frame / totalFrames) * text.length);
        const scrambled = text
          .split('')
          .map((ch, i) => {
            if (ch === ' ') return ' ';
            if (i < revealCount) return text[i];
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('');
        setDisplay(scrambled);
        if (frame < totalFrames) {
          setTimeout(runFrame, 30);
        } else {
          setDisplay(text);
          if (!cancelled) setTimeout(scrambleOnce, pause);
        }
      };
      runFrame();
    };

    scrambleOnce();
    return () => { cancelled = true; };
  }, [active, text, pause]);

  return <span className={`font-mono font-bold ${className}`}>{display}</span>;
}


// ── Live status badge ────────────────────────────────────────────────────────
function TrustBadge({ label }) {
  return (
    <div className="relative inline-flex overflow-hidden rounded-full p-[1px]">
      <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#09090b_0%,#38bdf8_50%,#09090b_100%)]" />
      <span className="inline-flex h-full w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-1.5 text-[11px] font-mono text-zinc-300 uppercase tracking-widest backdrop-blur-3xl">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
        </span>
        {label}
      </span>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay = 0 }) {
  const [ref, visible] = useReveal(0.1, delay);
  return (
    <div ref={ref} className={`group relative p-8 bg-zinc-900/10 border border-zinc-800/40 hover:border-sky-500/30 transition-all duration-500 overflow-hidden ${revealClass(visible)}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="w-12 h-12 bg-zinc-900/80 border border-zinc-800/60 rounded-xl flex items-center justify-center mb-6 group-hover:border-sky-500/40 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-300 shadow-lg relative z-10">
        {icon}
      </div>
      <h3 className="text-[14px] font-bold font-mono tracking-widest text-zinc-100 mb-3 uppercase relative z-10 group-hover:text-sky-400 transition-colors duration-300">
        {title}
      </h3>
      <p className="text-[14px] text-zinc-400 leading-relaxed font-sans normal-case relative z-10 group-hover:text-zinc-300 transition-colors duration-300">{desc}</p>
    </div>
  );
}

// ── How-it-works step ─────────────────────────────────────────────────────────
function Step({ n, title, desc, bullets, delay = 0 }) {
  const [ref, visible] = useReveal(0.1, delay);
  return (
    <div ref={ref} className={`group relative p-8 bg-zinc-900/20 border border-zinc-800/40 transition-all duration-500 hover:border-zinc-700/60 flex flex-col ${revealClass(visible)}`}>
      {/* Decorative line connecting steps on larger screens could go here */}
      <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-sm flex items-center justify-center text-sm font-bold text-sky-400 font-mono mb-6 group-hover:bg-sky-500/10 group-hover:border-sky-500/30 transition-colors duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:shadow-[0_0_20px_rgba(56,189,248,0.2)]">
        {n}
      </div>
      <div className="flex-1">
        <h3 className="text-[14px] font-bold text-zinc-100 mb-3 uppercase tracking-widest font-mono group-hover:text-white transition-colors duration-300">
          {title}
        </h3>
        <p className="text-[14px] text-zinc-400 normal-case font-sans leading-relaxed mb-6">{desc}</p>
      </div>
      <ul className="space-y-3 mt-auto">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3 items-start p-4 bg-zinc-950/60 border border-zinc-900/80 rounded-sm hover:border-zinc-700/50 transition-colors duration-200">
            <span className="text-sky-400 font-mono text-sm font-bold flex-shrink-0 mt-0.5">→</span>
            <p className="text-[13px] text-zinc-300 normal-case font-sans leading-relaxed">{b}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Trust card data ───────────────────────────────────────────────────────────
const trustItems = [
  {
    title: 'Open Source',
    desc: 'Fully auditable contracts and client code, nothing hidden.',
    icon: <GitBranch className="w-5 h-5 text-sky-400" strokeWidth={1.5} />,
  },
  {
    title: 'Verified On Etherscan',
    desc: 'Every contract is source-verified and publicly readable.',
    icon: <BadgeCheck className="w-5 h-5 text-emerald-400" strokeWidth={1.5} />,
  },
  {
    title: 'Zama FHE',
    desc: 'Fully Homomorphic Encryption keeps amounts computable while sealed.',
    icon: <Lock className="w-5 h-5 text-violet-400" strokeWidth={1.5} />,
  },
  {
    title: 'Dual Encryption',
    desc: 'Amounts are sealed both client-side and on-chain — two independent layers.',
    icon: <Fingerprint className="w-5 h-5 text-sky-400" strokeWidth={1.5} />,
  },
  {
    title: 'ZK Proofs',
    desc: 'Zero-knowledge validity proofs confirm payments without revealing values.',
    icon: <ShieldCheck className="w-5 h-5 text-amber-400" strokeWidth={1.5} />,
  },
  {
    title: 'Automation',
    desc: 'Burner-key signing and webhooks keep invoices moving with zero clicks.',
    icon: <Zap className="w-5 h-5 text-rose-400" strokeWidth={1.5} />,
  },
  {
    title: 'Sepolia Testnet',
    desc: 'Live on Ethereum Sepolia — inspect every transaction yourself.',
    icon: <Globe className="w-5 h-5 text-zinc-300" strokeWidth={1.5} />,
  },
  {
    title: 'AES-256-GCM',
    desc: 'Transport-layer encryption backs every request end to end.',
    icon: <KeyRound className="w-5 h-5 text-emerald-400" strokeWidth={1.5} />,
  },
];

function TrustCard({ icon, title, desc, href }) {
  const Wrapper = href ? 'a' : 'div';
  const linkProps = href
    ? { href, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...linkProps}
      className="group relative flex-shrink-0 w-[300px] p-7 bg-zinc-950/80 backdrop-blur-md
        border border-zinc-800/60 hover:border-sky-500/40 hover:bg-zinc-900/50 transition-all duration-300
        overflow-hidden block rounded-lg"
    >
      <div className="absolute -bottom-6 -right-2 text-[100px] font-black text-zinc-900/40
        select-none pointer-events-none font-mono leading-none group-hover:text-zinc-800/40 transition-colors duration-300">
        {title.slice(0, 2).toUpperCase()}
      </div>
      <div className="relative z-10">
        <div className="w-12 h-12 border border-zinc-800/70 bg-zinc-900/80 rounded-md
          flex items-center justify-center mb-6 group-hover:border-sky-500/40 group-hover:scale-110 transition-all duration-300 shadow-sm">
          {icon}
        </div>
        <h3 className="text-lg font-bold font-mono text-zinc-100 mb-3 tracking-wide uppercase group-hover:text-white transition-colors duration-300">
          {title}
        </h3>
        <p className="text-[13px] text-zinc-400 font-sans normal-case leading-relaxed pr-2 group-hover:text-zinc-300 transition-colors duration-300">
          {desc}
        </p>
        <div className="flex items-center gap-2 mt-6 text-sky-400 opacity-80 group-hover:opacity-100 transition-opacity">
          {href ? (
            <>
              <ExternalLink className="w-4 h-4" />
              <span className="text-[11px] font-mono uppercase tracking-widest font-semibold">Verify</span>
            </>
          ) : (
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
          )}
        </div>
      </div>
    </Wrapper>
  );
}

function TrustMarquee() {
  const track = [...trustItems, ...trustItems]; 
  return (
    <div className="relative overflow-hidden py-4
      [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex gap-6 w-max animate-[trust-scroll_40s_linear_infinite]
        hover:[animation-play-state:paused]">
        {track.map((item, i) => (
          <TrustCard key={i} {...item} />
        ))}
      </div>
      <style>{`
        @keyframes trust-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(calc(-50% - 12px)); } /* accounting for gap */
        }
      `}</style>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const FeatureIcons = {
  lock: <Lock className="w-6 h-6 text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" strokeWidth={2} />,
  single: <FileText className="w-6 h-6 text-zinc-300 drop-shadow-[0_0_8px_rgba(212,212,216,0.5)]" strokeWidth={1.5} />,
  multi: <Layers className="w-6 h-6 text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]" strokeWidth={1.5} />,
  heart: <Heart className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" strokeWidth={1.5} />,
  qr: <QrCode className="w-6 h-6 text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" strokeWidth={1.5} />,
  bell: <Bell className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" strokeWidth={1.5} />,
  eye: <Eye className="w-6 h-6 text-rose-400 drop-shadow-[0_0_8px_rgba(2fb,113,133,0.5)]" strokeWidth={1.5} />,
};

const TelegramIcon = (
  <svg className="w-6 h-6 text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const WebhookIcon = (
  <svg className="w-6 h-6 text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [heroRef, heroVis] = useReveal(0.1, 0);
  const [statsRef, statsVis] = useReveal(0.1, 200);
  const [problemRef, problemVis] = useReveal(0.15);
  const [thesisRef, thesisVis] = useReveal(0.15);
  const [featHeaderRef, featHeaderVis] = useReveal(0.15);
  const [howHeaderRef, howHeaderVis] = useReveal(0.15);
  const [tgRef, tgVis] = useReveal(0.15);
  const [trustRef, trustVis] = useReveal(0.15);
  const [ctaRef, ctaVis] = useReveal(0.15);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono selection:bg-sky-400 selection:text-zinc-950 overflow-x-hidden">
      
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 border-b border-zinc-900/60 pt-20 pb-10">
        <CryptographicMatrix />
        
        {/* Dynamic Orbs */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-sky-500/10 blur-[150px] rounded-full pointer-events-none animate-pulse duration-10000" />
        <div className="absolute top-1/2 left-1/4 -translate-x-1/2 w-[400px] h-[300px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent pointer-events-none z-10" />

        <div className="max-w-5xl mx-auto text-center relative z-20 flex-1 flex flex-col justify-center w-full">
          <div ref={heroRef} className={`space-y-8 ${revealClass(heroVis)}`}>
            <div className="flex justify-center mb-6">
              <TrustBadge label="Live on Sepolia Testnet" />
            </div>

            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter text-white leading-[1.05] uppercase drop-shadow-2xl">
              The Future Of<br />
              <span className="relative inline-block mt-2">
                <span className="absolute inset-0 bg-gradient-to-r from-sky-400 via-emerald-400 to-sky-400 blur-2xl opacity-20 animate-pulse"></span>
                <span className="relative bg-gradient-to-r from-zinc-100 via-zinc-300 to-sky-400 bg-clip-text text-transparent">
                  Private Payments
                </span>
              </span>
            </h1>

            <p className="text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed font-sans normal-case">
              Confidential invoicing on Ethereum. Send requests, share links,
              and receive payments using <strong className="text-white font-mono font-medium tracking-wide">Zama FHE.</strong> The blockchain never reveals what you charged.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-6">
              <Link
                to="/explorer"
                className="group relative px-10 py-4 bg-zinc-100 text-zinc-950 font-bold text-xs tracking-widest uppercase transition-all overflow-hidden rounded shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] active:scale-95 flex items-center justify-center gap-3 w-full sm:w-auto"
              >
                <div className="absolute inset-0 bg-white translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <span className="relative z-10 flex items-center gap-2">
                  Launch App
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                </span>
              </Link>
              <Link
                to="/docs"
                className="group px-10 py-4 border border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-500 text-zinc-300 hover:text-white font-bold text-xs tracking-widest uppercase transition-all backdrop-blur-md flex items-center justify-center gap-3 w-full sm:w-auto rounded"
              >
                <BookOpen className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                View Docs
              </Link>
            </div>
          </div>
        </div>

        {/* Stats pinned to bottom of hero */}
        <div ref={statsRef} className={`relative z-20 w-full max-w-5xl mx-auto pb-10 ${revealClass(statsVis)}`}>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 border-t border-zinc-800/50 pt-10">
            <StatChip value="256-BIT"   label="FHE Encryption" />
            <StatChip value="cUSDC"     label="Payment Token" />
            <StatChip value="3 FORMATS" label="Invoice Types" />
            <StatChip value="<1 MIN"    label="Alert Latency" />
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM ───────────────────────────────────────────────────── */}
      <section ref={problemRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 relative">
        <div className="absolute -left-32 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className={`relative z-10 ${revealClass(problemVis)}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

            <div className="space-y-8">
              <p className="inline-flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-rose-400 uppercase px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-sm">
                <Eye className="w-3.5 h-3.5" />
                The problem
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono tracking-tight text-white leading-[1.1] uppercase drop-shadow-lg">
                Public blockchains expose <span className="text-rose-400">every payment.</span>
              </h2>
              <p className="text-base text-zinc-300 font-sans normal-case leading-relaxed">
                Every on-chain transfer broadcasts the amount, wallet addresses,
                and transaction history to anyone watching — forever.
                For freelancers, agencies, and DAOs, that means your rates, clients, and revenue are fully public.
              </p>
              <ul className="space-y-5 pt-4">
                <li className="flex gap-4 items-start group">
                  <div className="mt-1 p-1 bg-zinc-900 border border-zinc-800 rounded group-hover:border-rose-500/50 group-hover:bg-rose-500/10 transition-colors">
                    {FeatureIcons.eye}
                  </div>
                  <span className="text-sm text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-white">Anyone can see your rates.</strong>{' '}
                    Competitors, clients, and explorers access every amount you've invoiced.
                  </span>
                </li>
                <li className="flex gap-4 items-start group">
                  <div className="mt-1 p-1 bg-zinc-900 border border-zinc-800 rounded group-hover:border-rose-500/50 group-hover:bg-rose-500/10 transition-colors">
                    {FeatureIcons.eye}
                  </div>
                  <span className="text-sm text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-white">Relationships are traceable.</strong>{' '}
                    Payment history permanently links your wallet to every business you've worked with.
                  </span>
                </li>
                <li className="flex gap-4 items-start group">
                  <div className="mt-1 p-1 bg-zinc-900 border border-zinc-800 rounded group-hover:border-rose-500/50 group-hover:bg-rose-500/10 transition-colors">
                    {FeatureIcons.eye}
                  </div>
                  <span className="text-sm text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-white">Revenue is visible.</strong>{' '}
                    Wallet balances and inflows are public on every standard EVM chain.
                  </span>
                </li>
              </ul>
            </div>

            {/* Contrast panel */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 to-emerald-500/5 rounded-2xl blur-xl" />
              <div className="space-y-6 relative z-10">
                {/* Standard chain */}
                <div className="p-8 bg-zinc-950/80 backdrop-blur-md border border-rose-900/30 rounded-xl shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/50" />
                  <p className="flex items-center gap-2 text-[12px] font-bold font-mono text-rose-400 uppercase tracking-widest mb-6">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                    Standard on-chain payment
                  </p>
                  <div className="space-y-3 font-mono text-[13px]">
                    <div className="flex justify-between border-b border-rose-900/20 pb-2">
                      <span className="text-zinc-400">Sender</span><span className="text-rose-300">0xA1b2…e9</span>
                    </div>
                    <div className="flex justify-between border-b border-rose-900/20 pb-2">
                      <span className="text-zinc-400">Recipient</span><span className="text-rose-300">0xF3c4…d1</span>
                    </div>
                    <div className="flex justify-between border-b border-rose-900/20 pb-2">
                      <span className="text-zinc-400">Amount</span><span className="text-rose-400 font-bold bg-rose-950 px-2 py-0.5 rounded">2,400.00 USDC</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-zinc-400">Visibility</span><span className="text-rose-300">Public to everyone</span>
                    </div>
                  </div>
                </div>

                {/* Zeroremit */}
                <div className="p-8 bg-zinc-950/80 backdrop-blur-md border border-emerald-900/30 rounded-xl shadow-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-colors duration-500">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50" />
                  <p className="flex items-center gap-2 text-[12px] font-bold font-mono text-emerald-400 uppercase tracking-widest mb-6">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    Zeroremit invoice payment
                  </p>
                  <div className="space-y-3 font-mono text-[13px]">
                    <div className="flex justify-between border-b border-emerald-900/20 pb-2">
                      <span className="text-zinc-400">Sender</span><span className="text-emerald-300">0xA1b2…e9</span>
                    </div>
                    <div className="flex justify-between border-b border-emerald-900/20 pb-2">
                      <span className="text-zinc-400">Recipient</span><span className="text-emerald-300">0xF3c4…d1</span>
                    </div>
                    <div className="flex justify-between border-b border-emerald-900/20 pb-2">
                      <span className="text-zinc-400">Amount</span><span className="text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded"><CipherText text="[Zama FHE Encrypted]" active={problemVis} pause={4000} /></span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-zinc-400">Visibility</span><span className="text-emerald-300">Readable only by you</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── THESIS BANNER ─────────────────────────────────────────────────── */}
      <section ref={thesisRef} className="relative py-32 border-y border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.05)_0%,transparent_60%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

        <div className={`max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 ${revealClass(thesisVis)}`}>
          <div className="flex justify-center mb-8">
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl relative">
               <div className="absolute inset-0 border border-sky-500/30 rounded-2xl animate-pulse" />
               <Cpu className="w-8 h-8 text-sky-400" strokeWidth={1.5} />
            </div>
          </div>
          <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-8 text-center">
            // FHE Cryptography
          </p>

          <p className="text-2xl sm:text-3xl lg:text-4xl text-center leading-relaxed tracking-tight text-white max-w-4xl mx-auto font-sans normal-case font-medium drop-shadow-md">
            <CipherText
              text="Zeroremit"
              active={thesisVis}
              pause={4000}
              className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 font-bold"
            />{' '}
            encrypts invoice amounts in your browser before your wallet ever
            signs. The blockchain stores <span className="inline-block relative"><span className="relative z-10 text-rose-400 font-mono font-bold px-2 bg-rose-500/10 border border-rose-500/20 rounded">ciphertext</span></span>, not the number.
          </p>

          <p className="text-base text-zinc-400 text-center font-sans normal-case leading-relaxed max-w-2xl mx-auto mt-10">
            Only the invoice creator and the designated recipient hold the keys to decrypt
            what was charged. Everyone else on the network sees an encrypted value, permanently.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 mt-14 font-mono text-xs text-zinc-400 uppercase tracking-widest">
            <span className="flex items-center gap-3 bg-zinc-950/50 px-4 py-2 rounded-full border border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" /> Encrypted locally
            </span>
            <span className="hidden sm:block text-zinc-600">→</span>
            <span className="flex items-center gap-3 bg-zinc-950/50 px-4 py-2 rounded-full border border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Verified on-chain
            </span>
            <span className="hidden sm:block text-zinc-600">→</span>
            <span className="flex items-center gap-3 bg-zinc-950/50 px-4 py-2 rounded-full border border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" /> Private decryption
            </span>
          </div>
        </div>
      </section>

      {/* ── HOW EACH PIECE WORKS ──────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 relative">
        <div className="absolute right-0 top-1/3 w-[400px] h-[400px] bg-violet-500/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div ref={featHeaderRef} className={`mb-16 ${revealClass(featHeaderVis)}`}>
          <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-4">
            // Core Features
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono tracking-tight text-white uppercase drop-shadow-lg">
            Every feature explained.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
          <FeatureCard delay={100} icon={FeatureIcons.lock} title="FHE-Encrypted Amounts" desc="Your invoice amount is encrypted in your browser using Zama FHE before the transaction is ever signed. The ciphertext goes on-chain — not the number." />
          <FeatureCard delay={200} icon={FeatureIcons.single} title="Single Invoices" desc="Send a fixed-amount invoice to one specific wallet address. The amount is private, only you and the named recipient can decrypt it." />
          <FeatureCard delay={300} icon={FeatureIcons.multi} title="Itemized Invoices" desc="Create an invoice for multiple recipients where amounts can be decrypted by anyone with a link but still stays encrypted on-chain." />
          <FeatureCard delay={400} icon={FeatureIcons.heart} title="Donation Pages" desc="Launch a public fundraising page. Each donor encrypts their contribution in their own browser before submitting. Individual donation amounts stay private." />
          <FeatureCard delay={500} icon={FeatureIcons.qr} title="Shareable Payment Links" desc="Every invoice generates a unique payment URL and QR code. Share the link anywhere, the payer opens it, connects their wallet, and pays easily." />
          <FeatureCard delay={600} icon={FeatureIcons.bell} title="Real-Time Telegram Alerts" desc="Link your wallet to the Zeroremit Telegram bot. Get an instant message when an invoice is paid, check your balance, and manage invoices from the chat." />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="relative border-t border-zinc-900/60 bg-zinc-950">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,white,transparent_80%)] opacity-30" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 relative z-10">
          <div ref={howHeaderRef} className={`mb-16 text-center ${revealClass(howHeaderVis)}`}>
            <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-4">
              // Lifecycle
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono tracking-tight text-white uppercase drop-shadow-lg">
              From invoice to payment.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Step n="01" delay={100} title="Fill in the details" desc="Connect your wallet and choose your invoice type. Enter a title, recipient, amount, and optional due date." bullets={['Choose Single, Itemized, or Donation', 'No account setup required', 'Fully decentralized interaction']} />
            <Step n="02" delay={300} title="Encrypt & sign" desc="Zeroremit encrypts the invoice amount in your browser using Zama FHE, then prompts your wallet to sign the ciphertext." bullets={['Local WASM encryption', 'Zero-knowledge proofs generated', 'Confirms on Sepolia Testnet']} />
            <Step n="03" delay={500} title="Share link, get paid" desc="A unique URL is generated. Share it with your payer — they connect and pay in cUSDC. You get notified instantly." bullets={['Link works in any browser', 'Payers settle in cUSDC', 'Status updates automatically']} />
          </div>
        </div>
      </section>

      {/* ── TELEGRAM + AUTOMATION ────────────────────────────────────────── */}
      <section ref={tgRef} className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 border-t border-zinc-900/60 overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 blur-[150px] rounded-full pointer-events-none" />
        
        <div className={`relative z-10 ${revealClass(tgVis)}`}>
          <div className="mb-16">
            <p className="text-xs font-bold font-mono tracking-widest text-emerald-400 uppercase mb-4">
              // Automation & integrations
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono tracking-tight text-white uppercase max-w-3xl drop-shadow-lg">
              Your invoicing stack — automated end to end.
            </h2>
            <p className="text-base text-zinc-300 font-sans normal-case leading-relaxed mt-6 max-w-2xl">
              Built for freelancers, agencies, DAOs, and teams who need payments to
              move without manual work. Connect your tools, set your limits, and let
              Zeroremit handle the rest.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-8 bg-zinc-900/20 backdrop-blur-sm border border-zinc-800/50 hover:border-sky-500/40 transition-all duration-500 space-y-5 rounded-xl group hover:bg-zinc-900/40 shadow-lg">
              <div className="w-14 h-14 bg-zinc-900 border border-zinc-700/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md">
                {TelegramIcon}
              </div>
              <h3 className="text-base font-bold font-mono text-zinc-100 uppercase tracking-widest group-hover:text-sky-400 transition-colors">Telegram Bot</h3>
              <p className="text-sm text-zinc-400 font-sans normal-case leading-relaxed">
                Get paid, get notified, check balances, and create invoices — all from Telegram chat.
              </p>
              <div className="pt-4 space-y-2.5">
                {['Real-time payment alerts', 'Invoice creation from chat', 'Balance checks', 'Mute & alert controls'].map((f, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <span className="text-sky-400 font-mono text-sm font-bold mt-0.5">→</span>
                    <span className="text-[13px] text-zinc-300 font-mono">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-zinc-900/20 backdrop-blur-sm border border-zinc-800/50 hover:border-amber-500/40 transition-all duration-500 space-y-5 rounded-xl group hover:bg-zinc-900/40 shadow-lg">
              <div className="w-14 h-14 bg-zinc-900 border border-zinc-700/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md">
                <Zap className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold font-mono text-zinc-100 uppercase tracking-widest group-hover:text-amber-400 transition-colors">Burner Automation</h3>
              <p className="text-sm text-zinc-400 font-sans normal-case leading-relaxed">
                A server-side signing key creates invoices on your behalf with configurable spending caps.
              </p>
              <div className="pt-4 space-y-2.5">
                {['Automated invoice signing', 'Per-invoice USDC cap', 'Daily spending limit', 'One-click disable'].map((f, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <span className="text-amber-400 font-mono text-sm font-bold mt-0.5">→</span>
                    <span className="text-[13px] text-zinc-300 font-mono">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-zinc-900/20 backdrop-blur-sm border border-zinc-800/50 hover:border-violet-500/40 transition-all duration-500 space-y-5 rounded-xl group hover:bg-zinc-900/40 shadow-lg">
              <div className="w-14 h-14 bg-zinc-900 border border-zinc-700/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md">
                {WebhookIcon}
              </div>
              <h3 className="text-base font-bold font-mono text-zinc-100 uppercase tracking-widest group-hover:text-violet-400 transition-colors">Zapier & Webhooks</h3>
              <p className="text-sm text-zinc-400 font-sans normal-case leading-relaxed">
                Connect to 6,000+ apps via Zapier or HMAC-signed webhooks to route events seamlessly.
              </p>
              <div className="pt-4 space-y-2.5">
                {['Slack & Discord alerts', 'Facebook Leads auto-invoice', 'Google Sheets logging', 'HMAC-signed payloads'].map((f, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <span className="text-violet-400 font-mono text-sm font-bold mt-0.5">→</span>
                    <span className="text-[13px] text-zinc-300 font-mono">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-8 bg-zinc-900/40 border border-zinc-800/50 rounded-xl">
            <p className="text-[11px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-6">
              Built for
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { who: 'Freelancers',  desc: 'Invoice privately without exposing rates', color: 'text-sky-400', border: 'border-sky-500/20' },
                { who: 'Agencies',     desc: 'Automate across multiple clients', color: 'text-emerald-400', border: 'border-emerald-500/20' },
                { who: 'DAOs & Teams', desc: 'Collect payments with webhook alerts', color: 'text-violet-400', border: 'border-violet-500/20' },
                { who: 'Businesses',   desc: 'Connect to CRM & accounting tools', color: 'text-amber-400', border: 'border-amber-500/20' },
              ].map((item, i) => (
                <div key={i} className={`pl-4 border-l-2 ${item.border} space-y-2`}>
                  <p className={`text-[13px] font-bold font-mono uppercase tracking-widest ${item.color}`}>
                    {item.who}
                  </p>
                  <p className="text-sm text-zinc-300 font-sans normal-case leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST SIGNALS ────────────────────────────────────────────────── */}
      <section ref={trustRef} className="border-y border-zinc-800/60 bg-zinc-950 py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />
        <div className={`relative z-10 ${revealClass(trustVis)}`}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-12 text-center">
            <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-4">
              // Built on trust
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-white uppercase drop-shadow-md">
              The stack behind every invoice.
            </h2>
          </div>
          <TrustMarquee />
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section ref={ctaRef} className="relative px-4 py-40 overflow-hidden border-t border-zinc-900/60 bg-zinc-950">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-sky-500/10 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.05)_0%,transparent_70%)] pointer-events-none" />

        <div className={`max-w-3xl mx-auto text-center relative z-10 ${revealClass(ctaVis)}`}>
          <div className="inline-flex items-center justify-center p-4 bg-zinc-900/50 border border-zinc-800 rounded-full mb-8 shadow-xl">
             <Lock className="w-8 h-8 text-sky-400" />
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight text-white uppercase mb-8 drop-shadow-2xl">
            Send your first <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">private invoice</span>.
          </h2>
          <p className="text-lg text-zinc-300 font-sans normal-case leading-relaxed mb-12 max-w-2xl mx-auto">
            Connect your wallet, fill in the details, and let the protocol handle the
            encryption. Share the link, get paid in Confidential USDC, and keep your business private.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link
              to="/explorer"
              className="group relative w-full sm:w-auto px-12 py-5 bg-zinc-100 text-zinc-950 font-bold text-sm tracking-widest uppercase transition-all overflow-hidden rounded shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] active:scale-95 flex items-center justify-center gap-3"
            >
              <div className="absolute inset-0 bg-white translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative z-10 flex items-center gap-2">
                Launch Zeroremit
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
