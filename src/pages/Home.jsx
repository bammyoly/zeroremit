// src/pages/Home.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Reveal hook ───────────────────────────────────────────────────────────────
function useReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

const reveal = (visible, delay = '') =>
  `transition-all duration-700 ease-out ${delay} ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
  }`;

// ── Matrix background ─────────────────────────────────────────────────────────
function CryptographicMatrix() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);
    const onResize = () => {
      if (!canvas) return;
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    const fs = 12;
    const cols = Math.floor(w / fs) + 1;
    const drops = Array(cols).fill(1);
    const chars = '0123456789ABCDEFØXαβγ'.split('');
    const draw = () => {
      ctx.fillStyle = 'rgba(9,9,11,0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `600 ${fs}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const t = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = Math.random() > 0.98
          ? 'rgba(56,189,248,0.8)'
          : 'rgba(56,189,248,0.15)';
        ctx.fillText(t, i * fs, drops[i] * fs);
        if (drops[i] * fs > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.45]"
    />
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function StatChip({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 min-w-[140px] border border-zinc-800/60 bg-zinc-950/50 font-mono">
      <span className="text-xl sm:text-2xl font-bold text-zinc-50 tracking-tight">{value}</span>
      <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">{label}</span>
    </div>
  );
}

// ── Encrypt/decrypt reveal text (continuous loop) ──────────────────────────
function CipherText({ text, className = '', active = true, pause = 2600 }) {
  const [display, setDisplay] = useState(text);
  const chars = '01ABCDEF#%&$Ø*+=';

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const scrambleOnce = () => {
      let frame = 0;
      const totalFrames = 24;
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
          setTimeout(runFrame, 40);
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

function CheckItem({ children }) {
  return (
    <li className="flex gap-3 items-start">
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none"
        stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
      </svg>
      <span className="text-[13px] text-zinc-300 font-sans normal-case leading-relaxed">{children}</span>
    </li>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, iconColor, title, desc }) {
  return (
    <div className="group p-7 bg-zinc-900/10 border border-zinc-800/40
      hover:border-sky-500/30 hover:bg-zinc-900/40 transition-all duration-300">
      <div className={`w-11 h-11 bg-zinc-900/60 border border-zinc-800/60
        flex items-center justify-center mb-5
        group-hover:border-sky-500/20 transition-all duration-200`}>
        {icon}
      </div>
      <h3 className="text-[13px] font-bold font-mono tracking-wider text-zinc-100 mb-3 uppercase">
        {title}
      </h3>
      <p className="text-[13px] text-zinc-400 leading-relaxed font-sans normal-case">{desc}</p>
    </div>
  );
}

// ── How-it-works step ─────────────────────────────────────────────────────────
function Step({ n, title, desc, bullets }) {
  return (
    <div className="p-7 bg-zinc-900/10 border border-zinc-800/40 space-y-5">
      <div className="w-9 h-9 bg-zinc-900 border border-zinc-800
        flex items-center justify-center text-sm font-bold text-sky-400 font-mono">
        {n}
      </div>
      <div>
        <h3 className="text-[13px] font-bold text-zinc-100 mb-2 uppercase tracking-wide font-mono">
          {title}
        </h3>
        <p className="text-[13px] text-zinc-400 normal-case font-sans leading-relaxed mb-4">{desc}</p>
      </div>
      <ul className="space-y-2.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3 items-start p-3.5 bg-zinc-950/40 border border-zinc-900/60">
            <span className="text-sky-400 font-mono text-sm font-bold flex-shrink-0">·</span>
            <p className="text-[13px] text-zinc-400 normal-case font-sans leading-relaxed">{b}</p>
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
    desc: 'Fully auditable contracts and client code — nothing hidden.',
    icon: (
      <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 20.5L4 12l6-8.5M14 3.5L20 12l-6 8.5" />
      </svg>
    ),
  },
  {
    title: 'Verified On Etherscan',
    desc: 'Every contract is source-verified and publicly readable.',
    icon: (
      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'Zama FHE',
    desc: 'Fully Homomorphic Encryption keeps amounts computable while sealed.',
    icon: (
      <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: 'Dual Encryption',
    desc: 'Amounts are sealed both client-side and on-chain — two independent layers.',
    icon: (
      <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="9" cy="12" r="5" strokeWidth="1.5" />
        <circle cx="15" cy="12" r="5" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: 'ZK Proofs',
    desc: 'Zero-knowledge validity proofs confirm payments without revealing values.',
    icon: (
      <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Automation',
    desc: 'Burner-key signing and webhooks keep invoices moving with zero clicks.',
    icon: (
      <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: 'Sepolia Testnet',
    desc: 'Live on Ethereum Sepolia — inspect every transaction yourself.',
    icon: (
      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z" />
      </svg>
    ),
  },
  {
    title: 'AES-256-GCM',
    desc: 'Transport-layer encryption backs every request end to end.',
    icon: (
      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="5" y="11" width="14" height="9" rx="1" strokeWidth="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 11V7a4 4 0 118 0v4" />
      </svg>
    ),
  },
];

function TrustCard({ icon, title, desc }) {
  return (
    <div className="group relative flex-shrink-0 w-[280px] p-6 bg-zinc-950/70
      border border-zinc-800/60 hover:border-sky-500/40 transition-colors duration-300
      overflow-hidden">
      <div className="absolute -bottom-6 -right-2 text-[80px] font-black text-zinc-900/60
        select-none pointer-events-none font-['Chakra_Petch'] leading-none">
        {title.slice(0, 2).toUpperCase()}
      </div>
      <div className="relative z-10">
        <div className="w-10 h-10 border border-zinc-800/70 bg-zinc-900/60
          flex items-center justify-center mb-6 group-hover:border-sky-500/40 transition-colors">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-zinc-50 mb-2 tracking-tight
          font-['Chakra_Petch'] uppercase">
          {title}
        </h3>
        <p className="text-[12.5px] text-zinc-400 font-sans normal-case leading-relaxed pr-2">
          {desc}
        </p>
        <svg className="w-4 h-4 text-sky-400 mt-5 transition-transform duration-300
          group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </div>
    </div>
  );
}

function TrustMarquee() {
  const track = [...trustItems, ...trustItems]; // duplicate for seamless loop
  return (
    <div className="relative overflow-hidden py-2
      [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="flex gap-5 w-max animate-[trust-scroll_32s_linear_infinite]
        hover:[animation-play-state:paused]">
        {track.map((item, i) => (
          <TrustCard key={i} {...item} />
        ))}
      </div>
      <style>{`
        @keyframes trust-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const Icons = {
  lock: (color = 'text-sky-400') => (
    <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
    </svg>
  ),
  single: (color = 'text-zinc-400') => (
    <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/>
    </svg>
  ),
  multi: (color = 'text-violet-400') => (
    <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
    </svg>
  ),
  heart: (color = 'text-emerald-400') => (
    <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
    </svg>
  ),
  qr: (color = 'text-sky-400') => (
    <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4z"/>
    </svg>
  ),
  bell: (color = 'text-amber-400') => (
    <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
    </svg>
  ),
  eye: (
    <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  ),
  telegram: (
    <svg className="w-5 h-5 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
    </svg>
  ),
};

// ── Trust badge ───────────────────────────────────────────────────────────────
function TrustBadge({ label }) {
  return (
    <span className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
      <span className="w-1.5 h-1.5 bg-emerald-400 flex-shrink-0" />
      {label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const navigate = useNavigate();

  const [problemRef, problemVis] = useReveal();
  const [thesisRef,  thesisVis]  = useReveal();
  const [featRef,    featVis]    = useReveal();
  const [howRef,     howVis]     = useReveal();
  const [tgRef,      tgVis]     = useReveal();
  const [trustRef,   trustVis]  = useReveal();
  const [statsRef,   statsVis]  = useReveal(0.2);
  const [ctaRef,     ctaVis]    = useReveal();

  const goto = (path) => () => navigate(path);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono
      selection:bg-sky-400 selection:text-zinc-950">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center
        overflow-hidden px-4 border-b border-zinc-900/60">
        <CryptographicMatrix />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[650px] h-[350px]
          bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-40
          bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10 pt-20">

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tighter
            text-white leading-[1.05] mb-7 uppercase">
            The Future Of<br />
            <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400
              bg-clip-text text-transparent">
              Private Payments
            </span>
          </h1>

          <p className="text-[15px] text-zinc-300 max-w-xl mx-auto leading-relaxed
            font-sans normal-case mb-12">
            Private invoicing on Ethereum. Send payment requests, share payment link,
            and receive confidential payments using Zama FHE so the
            blockchain never reveals what you charged.
          </p>

          <div className="flex items-center justify-center mb-16">
            <button onClick={goto('/explorer')}
              className="group w-full sm:w-auto px-10 py-4 bg-zinc-100 hover:bg-white
                text-zinc-950 font-bold text-xs tracking-widest uppercase
                transition-all shadow-lg shadow-white/10 active:scale-[0.98]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400
                flex items-center justify-center gap-3">
              Launch Zeroremit
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap justify-center gap-4 border-t border-zinc-800/50 pt-10">
            <StatChip value="256-BIT"   label="ZAMA FHE Encryption" />
            <StatChip value="cUSDC"     label="Payment token" />
            <StatChip value="3 FORMATS" label="Invoice types" />
            <StatChip value="<1 MIN"    label="Alert latency" />
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM ───────────────────────────────────────────────────── */}
      <section ref={problemRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        <div className={reveal(problemVis)}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            <div className="space-y-7">
              <p className="text-xs font-bold tracking-widest text-rose-400 uppercase">
                // The problem
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight
                text-white leading-snug uppercase">
                Public blockchains expose every payment.
              </h2>
              <p className="text-[15px] text-zinc-300 font-sans normal-case leading-relaxed">
                Every on-chain transfer broadcasts the amount, both wallet addresses,
                and the full transaction history to anyone watching the chain — forever.
                For freelancers, agencies, and businesses sending invoices on-chain,
                that means your rates, your clients, and your revenue are all public.
              </p>
              <ul className="space-y-4 pt-2">
                <li className="flex gap-3 items-start">
                  {Icons.eye}
                  <span className="text-[13px] text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-zinc-100">Anyone can see your rates.</strong>{' '}
                    Competitors, clients, and block explorers all have access to
                    every amount you've ever invoiced.
                  </span>
                </li>
                <li className="flex gap-3 items-start">
                  {Icons.eye}
                  <span className="text-[13px] text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-zinc-100">Your client relationships are traceable.</strong>{' '}
                    Payment history links your wallet to every business you've
                    worked with, permanently.
                  </span>
                </li>
                <li className="flex gap-3 items-start">
                  {Icons.eye}
                  <span className="text-[13px] text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-zinc-100">Your revenue is visible.</strong>{' '}
                    Wallet balances and cumulative inflows are public on every
                    standard EVM chain.
                  </span>
                </li>
              </ul>
            </div>

            {/* Contrast panel */}
            <div className="space-y-4">
              {/* Standard chain */}
              <div className="p-6 bg-rose-950/10 border border-rose-900/25">
                <p className="text-[11px] font-bold font-mono text-rose-400 uppercase
                  tracking-widest mb-4">
                  Standard on-chain payment
                </p>
                {[
                  'Sender wallet: 0xA1b2…e9 ← public',
                  'Recipient wallet: 0xF3c4…d1 ← public',
                  'Amount: 2,400.00 USDC ← public',
                  'Timestamp: visible to everyone',
                  'Full history: indexed forever',
                ].map((line, i) => (
                  <div key={i} className="flex justify-between items-center py-2
                    border-b border-rose-900/15 last:border-0">
                    <span className="text-[12px] font-mono text-rose-300/80 normal-case">
                      {line}
                    </span>
                  </div>
                ))}
              </div>

              {/* Zeroremit */}
              <div className="p-6 bg-emerald-950/10 border border-emerald-900/25">
                <p className="text-[11px] font-bold font-mono text-emerald-400 uppercase
                  tracking-widest mb-4">
                  Zeroremit invoice payment
                </p>
                {[
                  'Sender wallet: 0xA1b2…e9 ← public',
                  'Recipient wallet: 0xF3c4…d1 ← public',
                  'Amount: [Zama FHE Protocol] ← encrypted',
                  'Timestamp: visible on-chain',
                  'Invoice value: readable only by you + payer',
                ].map((line, i) => (
                  <div key={i} className="flex justify-between items-center py-2
                    border-b border-emerald-900/15 last:border-0">
                    <span className="text-[12px] font-mono text-emerald-300/80 normal-case">
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── THESIS BANNER ─────────────────────────────────────────────────── */}
    <section ref={thesisRef}
      className="relative border-y border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
        w-[600px] h-[300px] bg-sky-500/[0.04] blur-[100px] rounded-full pointer-events-none" />

      <div className={`max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10
        ${reveal(thesisVis)}`}>

        <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-6 text-center">
          // How the encryption works
        </p>

        <p className="text-xl sm:text-2xl lg:text-3xl text-center leading-relaxed
          tracking-tight text-zinc-100 max-w-4xl mx-auto font-sans normal-case font-medium">
          <CipherText text="Zeroremit" active={thesisVis} className="text-sky-400" />{' '}
          encrypts invoice amounts in your browser using Zama FHE before your wallet
          signs. The blockchain stores <span className="text-rose-400 font-mono font-bold">ciphertext</span> — not the number.
        </p>

        <p className="text-[15px] text-zinc-400 text-center font-sans normal-case
          leading-relaxed max-w-2xl mx-auto mt-8">
          Only the invoice creator and the designated recipient hold the keys to decrypt
          what was charged. Everyone else on the network sees an encrypted value —
          permanently.
        </p>

        <div className="flex items-center justify-center gap-6 mt-10 font-mono text-[11px]
          text-zinc-500 uppercase tracking-widest">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-sky-400" /> Encrypted in-browser
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-400" /> Verified on-chain
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-violet-400" /> Decrypted by recipient only
          </span>
        </div>
      </div>
    </section>

      {/* ── HOW EACH PIECE WORKS ──────────────────────────────────────────── */}
      <section ref={featRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        <div className={reveal(featVis)}>
          <div className="mb-14">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-3">
              // How each piece works
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase">
              Every feature explained plainly.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

            <FeatureCard
              icon={Icons.lock('text-sky-400')}
              title="FHE-Encrypted Amounts"
              desc="Your invoice amount is encrypted in your browser using Zama FHE before the transaction is ever signed. The ciphertext goes on-chain — not the number. No plaintext amount is stored anywhere on the blockchain or in our database."
            />

            <FeatureCard
              icon={Icons.single('text-zinc-300')}
              title="Single Invoices"
              desc="Send a fixed-amount invoice to one specific wallet address. The amount is private — only you and the named recipient can decrypt it. Everyone else sees a ciphertext. The recipient pays in cUSDC directly from their wallet."
            />

            <FeatureCard
              icon={Icons.multi('text-violet-400')}
              title="Itemized Invoices"
              desc="Create an open invoice with line items that anyone with the link can pay. Amounts are publicly visible here so payers can verify what they owe before paying. Useful for splitting restaurant bills, event tickets, or team expenses."
            />

            <FeatureCard
              icon={Icons.heart('text-emerald-400')}
              title="Donation Pages"
              desc="Launch a public fundraising page with an optional goal amount and end date. Each donor encrypts their contribution in their own browser before submitting. You see total progress; individual donation amounts stay private."
            />

            <FeatureCard
              icon={Icons.qr('text-sky-400')}
              title="Shareable Payment Links"
              desc="Every invoice generates a unique payment URL and QR code from its on-chain ID. Share the link anywhere — the payer opens it, connects their wallet, and pays. No account or sign-up required on the payer's side."
            />

            <FeatureCard
              icon={Icons.bell('text-amber-400')}
              title="Real-Time Telegram Alerts"
              desc="Link your wallet to the Zeroremit Telegram bot. Get an instant message when an invoice is paid, a donation lands, or a due date is near. Check your balance and invoice list without opening the web app."
            />

          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section ref={howRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-t border-zinc-900/60">
        <div className={reveal(howVis)}>
          <div className="mb-14">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-3">
              // How it works
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase">
              From invoice to payment in three steps.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Step
              n="01"
              title="Fill in the details"
              desc="Connect your wallet and choose your invoice type — single, itemized, or donation. Enter a title, recipient address, amount, and optional due date or memo."
              bullets={[
                'Single invoices need a recipient wallet address',
                'Itemized invoices take line items with descriptions and amounts',
                'Donation pages get an optional goal and end date',
              ]}
            />
            <Step
              n="02"
              title="Encrypt & sign"
              desc="Click confirm — Zeroremit encrypts the invoice amount in your browser using Zama FHE, then prompts your wallet to sign. No plaintext amount is ever broadcast to the network."
              bullets={[
                'Encryption runs locally in WebAssembly before signing',
                'Your wallet signs the FHE ciphertext, not the raw amount',
                'Transaction confirms on Ethereum Sepolia',
              ]}
            />
            <Step
              n="03"
              title="Share the link, get paid"
              desc="A payment link and QR code are generated from the on-chain invoice ID. Share them with your payer — they connect their wallet and pay in cUSDC. You get a Telegram alert when it lands."
              bullets={[
                'Payment link works in any browser — no install needed',
                'Payer settles in cUSDC from their own wallet',
                'Invoice status updates on-chain: Pending → Paid',
              ]}
            />
          </div>
        </div>
      </section>

          {/* ── TELEGRAM + AUTOMATION ────────────────────────────────────────────── */}
      <section ref={tgRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-t border-zinc-900/60">
        <div className={reveal(tgVis)}>

          {/* Header */}
          <div className="mb-14">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-3">
              // Automation & integrations
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase max-w-2xl">
              Your invoicing stack — automated end to end.
            </h2>
            <p className="text-[15px] text-zinc-300 font-sans normal-case leading-relaxed mt-4 max-w-2xl">
              Built for freelancers, agencies, DAOs, and teams who need payments to
              move without manual work. Connect your tools, set your limits, and let
              Zeroremit handle the rest.
            </p>
          </div>

          {/* 3-column highlight cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">

            {/* Telegram */}
            <div className="p-7 bg-zinc-900/10 border border-zinc-800/40
              hover:border-sky-500/20 transition-all duration-300 space-y-4">
              <div className="w-11 h-11 bg-zinc-900/60 border border-zinc-800/60
                flex items-center justify-center">
                {Icons.telegram}
              </div>
              <h3 className="text-[13px] font-bold font-mono text-zinc-100 uppercase tracking-wide">
                Telegram Bot
              </h3>
              <p className="text-[13px] text-zinc-400 font-sans normal-case leading-relaxed">
                Get paid, get notified, check balances, and create invoices — all
                from Telegram chat. No browser required.
              </p>
              <div className="pt-2 space-y-1.5">
                {['Real-time payment alerts', 'Invoice creation from chat', 'Balance checks', 'Mute & alert controls'].map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-1 h-1 bg-sky-400 flex-shrink-0" />
                    <span className="text-[12px] text-zinc-400 font-mono">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Burner Automation */}
            <div className="p-7 bg-zinc-900/10 border border-zinc-800/40
              hover:border-amber-500/20 transition-all duration-300 space-y-4">
              <div className="w-11 h-11 bg-zinc-900/60 border border-zinc-800/60
                flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <h3 className="text-[13px] font-bold font-mono text-zinc-100 uppercase tracking-wide">
                Burner Wallet Automation
              </h3>
              <p className="text-[13px] text-zinc-400 font-sans normal-case leading-relaxed">
                A server-side signing key creates invoices on your behalf with
                configurable spending caps — no wallet popup needed every time.
              </p>
              <div className="pt-2 space-y-1.5">
                {['Automated invoice signing', 'Per-invoice USDC cap', 'Daily spending limit', 'One-click disable'].map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-1 h-1 bg-amber-400 flex-shrink-0" />
                    <span className="text-[12px] text-zinc-400 font-mono">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Zapier + Webhooks */}
            <div className="p-7 bg-zinc-900/10 border border-zinc-800/40
              hover:border-violet-500/20 transition-all duration-300 space-y-4">
              <div className="w-11 h-11 bg-zinc-900/60 border border-zinc-800/60
                flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <h3 className="text-[13px] font-bold font-mono text-zinc-100 uppercase tracking-wide">
                Zapier · Webhooks
              </h3>
              <p className="text-[13px] text-zinc-400 font-sans normal-case leading-relaxed">
                Connect to 6,000+ apps via Zapier or HMAC-signed webhooks. Route
                payment events to Slack, Discord, Sheets, and more.
              </p>
              <div className="pt-2 space-y-1.5">
                {['Slack & Discord alerts', 'Facebook Leads → auto-invoice', 'Google Sheets logging', 'HMAC-signed payloads'].map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-1 h-1 bg-violet-400 flex-shrink-0" />
                    <span className="text-[12px] text-zinc-400 font-mono">{f}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Who benefits strip */}
          <div className="p-6 bg-zinc-900/10 border border-zinc-800/40">
            <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest mb-4">
              Built for
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { who: 'Freelancers',  desc: 'Invoice clients privately without exposing your rates', color: 'text-sky-400' },
                { who: 'Agencies',     desc: 'Automate invoicing across multiple clients and projects', color: 'text-emerald-400' },
                { who: 'DAOs & Teams', desc: 'Collect confidential on-chain payments with webhook alerts', color: 'text-violet-400' },
                { who: 'Businesses',   desc: 'Connect to your CRM, Slack, and accounting tools via Zapier', color: 'text-amber-400' },
              ].map((item, i) => (
                <div key={i} className="space-y-1.5">
                  <p className={`text-[11px] font-bold font-mono uppercase tracking-widest ${item.color}`}>
                    {item.who}
                  </p>
                  <p className="text-[12px] text-zinc-400 font-sans normal-case leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── TRUST SIGNALS ────────────────────────────────────────────────── */}
      <section ref={trustRef}
        className="border-y border-zinc-800/60 bg-zinc-900/10 py-16">
        <div className={reveal(trustVis)}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 text-center">
            <p className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-3">
              // Built on trust
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase
              font-['Chakra_Petch']">
              The stack behind every invoice.
            </h2>
          </div>
          <TrustMarquee />
        </div>
      </section>
      
      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section ref={ctaRef}
        className="relative px-4 py-32 overflow-hidden border-t border-zinc-900/60">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[450px] h-[250px] bg-sky-500/[0.03] blur-[100px] rounded-full
          pointer-events-none" />
        <div className={`max-w-2xl mx-auto text-center relative z-10 ${reveal(ctaVis)}`}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white
            uppercase mb-6">
            Send your first private invoice.
          </h2>
          <p className="text-[15px] text-zinc-300 font-sans normal-case leading-relaxed
            mb-12 max-w-lg mx-auto">
            Connect your wallet, fill in the details, and Zeroremit handles the
            encryption. Your payer gets a link. You get paid in Confidential USDC. The amount
            stays between you two.
          </p>
          <div className="flex items-center justify-center">
            <button onClick={goto('/explorer')}
              className="group w-full sm:w-auto px-10 py-4 bg-zinc-100 hover:bg-white
                text-zinc-950 font-bold text-xs tracking-widest uppercase
                transition-all shadow-lg shadow-white/10 active:scale-[0.98]
                flex items-center justify-center gap-3">
              Launch Zeroremit
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}