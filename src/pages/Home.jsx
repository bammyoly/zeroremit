// src/pages/Home.jsx
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
} from 'lucide-react';

// ── Config: fill these in with real values ────────────────────────────────────
// Keeping these in one place so the two "verifiable" trust cards below always
// point at something real instead of drifting out of sync with the contracts.
const LINKS = {
  github: 'https://github.com/YOUR_ORG/zeroremit', // TODO: real repo URL
  etherscanPaymentRouter: 'https://sepolia.etherscan.io/address/YOUR_PAYMENT_ROUTER_ADDRESS#code', // TODO: real address
};

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
// Now pauses when the tab is hidden and skips entirely for prefers-reduced-motion,
// instead of running an uncapped rAF loop forever regardless of visibility.
function CryptographicMatrix() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReducedMotion) return; // static background, no animation cost

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

    const fs = 12;
    const cols = Math.floor(w / fs) + 1;
    const drops = Array(cols).fill(1);
    const chars = '0123456789ABCDEFØXαβγ'.split('');

    function draw() {
      if (!running) return;
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

// ── Live status badge (was dead code — now used under the hero CTA) ─────────
function TrustBadge({ label }) {
  return (
    <span className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
      <span className="w-1.5 h-1.5 bg-emerald-400 flex-shrink-0 rounded-full" />
      {label}
    </span>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }) {
  return (
    <div className="group p-7 bg-zinc-900/10 border border-zinc-800/40
      hover:border-sky-500/30 hover:bg-zinc-900/40 transition-all duration-300">
      <div className="w-11 h-11 bg-zinc-900/60 border border-zinc-800/60
        flex items-center justify-center mb-5
        group-hover:border-sky-500/20 transition-all duration-200">
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
// Two of these (Open Source, Verified On Etherscan) are checkable claims, so
// they now link straight to the proof instead of just asserting it in text.
const trustItems = [
  {
    title: 'Open Source',
    desc: 'Fully auditable contracts and client code — nothing hidden.',
    href: LINKS.github,
    icon: <GitBranch className="w-5 h-5 text-sky-400" strokeWidth={1.5} />,
  },
  {
    title: 'Verified On Etherscan',
    desc: 'Every contract is source-verified and publicly readable.',
    href: LINKS.etherscanPaymentRouter,
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
      className="group relative flex-shrink-0 w-[280px] p-6 bg-zinc-950/70
        border border-zinc-800/60 hover:border-sky-500/40 transition-colors duration-300
        overflow-hidden block"
    >
      <div className="absolute -bottom-6 -right-2 text-[80px] font-black text-zinc-900/60
        select-none pointer-events-none font-mono leading-none">
        {title.slice(0, 2).toUpperCase()}
      </div>
      <div className="relative z-10">
        <div className="w-10 h-10 border border-zinc-800/70 bg-zinc-900/60
          flex items-center justify-center mb-6 group-hover:border-sky-500/40 transition-colors">
          {icon}
        </div>
        <h3 className="text-lg font-bold font-mono text-zinc-50 mb-2 tracking-tight uppercase">
          {title}
        </h3>
        <p className="text-[12.5px] text-zinc-400 font-sans normal-case leading-relaxed pr-2">
          {desc}
        </p>
        <div className="flex items-center gap-1.5 mt-5 text-sky-400">
          {href ? (
            <>
              <ExternalLink className="w-4 h-4" />
              <span className="text-[10px] font-mono uppercase tracking-widest">Verify</span>
            </>
          ) : (
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          )}
        </div>
      </div>
    </Wrapper>
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

// ── Feature icon set (was hand-rolled inline SVG — now lucide for consistency) ─
const FeatureIcons = {
  lock: <Lock className="w-5 h-5 text-sky-400" strokeWidth={2} />,
  single: <FileText className="w-5 h-5 text-zinc-300" strokeWidth={1.5} />,
  multi: <Layers className="w-5 h-5 text-violet-400" strokeWidth={1.5} />,
  heart: <Heart className="w-5 h-5 text-emerald-400" strokeWidth={1.5} />,
  qr: <QrCode className="w-5 h-5 text-sky-400" strokeWidth={1.5} />,
  bell: <Bell className="w-5 h-5 text-amber-400" strokeWidth={1.5} />,
  eye: <Eye className="w-5 h-5 text-rose-400" strokeWidth={1.5} />,
};

// Telegram doesn't have a lucide brand icon, so this one stays as a real SVG mark.
const TelegramIcon = (
  <svg className="w-5 h-5 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

// Zapier's own webhook shape isn't a standard lucide icon, so this stays custom too.
const WebhookIcon = (
  <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
  </svg>
);

// ═════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const navigate = useNavigate();

  const [problemRef, problemVis] = useReveal();
  const [thesisRef,  thesisVis]  = useReveal();
  const [featRef,    featVis]    = useReveal();
  const [howRef,     howVis]     = useReveal();
  const [tgRef,      tgVis]     = useReveal();
  const [trustRef,   trustVis]  = useReveal();
  const [ctaRef,     ctaVis]    = useReveal();

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
            font-sans normal-case mb-10">
            Private invoicing on Ethereum. Send payment requests, share payment link,
            and receive confidential payments using Zama FHE so the
            blockchain never reveals what you charged.
          </p>

          <div className="flex flex-col items-center gap-4 mb-16">
            {/* Real <Link> now — supports cmd/ctrl-click, middle-click, and
                gives crawlers/screen readers a real href instead of an onClick-only button. */}
            <Link
              to="/explorer"
              className="group w-full sm:w-auto px-10 py-4 bg-zinc-100 hover:bg-white
                text-zinc-950 font-bold text-xs tracking-widest uppercase
                transition-all shadow-lg shadow-white/10 active:scale-[0.98]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400
                flex items-center justify-center gap-3">
              Launch Zeroremit
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
            </Link>
            <TrustBadge label="Live on Sepolia · Contracts verified" />
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
              <p className="text-xs font-bold font-mono tracking-widest text-rose-400 uppercase">
                // The problem
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight
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
                  {FeatureIcons.eye}
                  <span className="text-[13px] text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-zinc-100">Anyone can see your rates.</strong>{' '}
                    Competitors, clients, and block explorers all have access to
                    every amount you've ever invoiced.
                  </span>
                </li>
                <li className="flex gap-3 items-start">
                  {FeatureIcons.eye}
                  <span className="text-[13px] text-zinc-300 font-sans normal-case leading-relaxed">
                    <strong className="text-zinc-100">Your client relationships are traceable.</strong>{' '}
                    Payment history links your wallet to every business you've
                    worked with, permanently.
                  </span>
                </li>
                <li className="flex gap-3 items-start">
                  {FeatureIcons.eye}
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

          <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-6 text-center">
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
            <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-3">
              // How each piece works
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white uppercase">
              Every feature explained plainly.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

            <FeatureCard
              icon={FeatureIcons.lock}
              title="FHE-Encrypted Amounts"
              desc="Your invoice amount is encrypted in your browser using Zama FHE before the transaction is ever signed. The ciphertext goes on-chain — not the number. No plaintext amount is stored anywhere on the blockchain or in our database."
            />

            <FeatureCard
              icon={FeatureIcons.single}
              title="Single Invoices"
              desc="Send a fixed-amount invoice to one specific wallet address. The amount is private — only you and the named recipient can decrypt it. Everyone else sees a ciphertext. The recipient pays in cUSDC directly from their wallet."
            />

            <FeatureCard
              icon={FeatureIcons.multi}
              title="Itemized Invoices"
              desc="Create an open invoice with line items that anyone with the link can pay. Amounts are publicly visible here so payers can verify what they owe before paying. Useful for splitting restaurant bills, event tickets, or team expenses."
            />

            <FeatureCard
              icon={FeatureIcons.heart}
              title="Donation Pages"
              desc="Launch a public fundraising page with an optional goal amount and end date. Each donor encrypts their contribution in their own browser before submitting. You see total progress; individual donation amounts stay private."
            />

            <FeatureCard
              icon={FeatureIcons.qr}
              title="Shareable Payment Links"
              desc="Every invoice generates a unique payment URL and QR code from its on-chain ID. Share the link anywhere — the payer opens it, connects their wallet, and pays. No account or sign-up required on the payer's side."
            />

            <FeatureCard
              icon={FeatureIcons.bell}
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
            <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-3">
              // How it works
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white uppercase">
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

      {/* ── TELEGRAM + AUTOMATION ────────────────────────────────────────── */}
      <section ref={tgRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 border-t border-zinc-900/60">
        <div className={reveal(tgVis)}>

          {/* Header */}
          <div className="mb-14">
            <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-3">
              // Automation & integrations
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white uppercase max-w-2xl">
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
                {TelegramIcon}
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
                <Zap className="w-5 h-5 text-amber-400" strokeWidth={2} />
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
                {WebhookIcon}
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
            <p className="text-xs font-bold font-mono tracking-widest text-sky-400 uppercase mb-3">
              // Built on trust
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white uppercase">
              The stack behind every invoice.
            </h2>
            <p className="text-[13px] text-zinc-500 font-sans normal-case mt-3">
              Cards marked <ExternalLink className="w-3 h-3 inline -mt-0.5" /> link straight to the source — verify it yourself.
            </p>
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
          <h2 className="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-white
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
            {/* Routes to /create now — this CTA is specifically about sending an
                invoice, not general browsing, so it should land on invoice creation. */}
            <Link
              to="/create"
              className="group w-full sm:w-auto px-10 py-4 bg-zinc-100 hover:bg-white
                text-zinc-950 font-bold text-xs tracking-widest uppercase
                transition-all shadow-lg shadow-white/10 active:scale-[0.98]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400
                flex items-center justify-center gap-3">
              Create an invoice
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}