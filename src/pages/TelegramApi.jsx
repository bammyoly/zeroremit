// src/pages/TelegramApi.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { Link } from 'react-router-dom';
import {
  apiGenerateLinkCode,
  apiGetTelegramStatus,
  apiUnlinkTelegram,
  apiUpdateTelegramPrefs,
} from '../lib/api.js';

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ZeroremitBot';

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'link',     label: 'Wallet Linking' },
  { id: 'commands', label: 'Commands' },
  { id: 'alerts',   label: 'Payment Alerts' },
];

// ── Commands registry ─────────────────────────────────────────────────────────
const COMMANDS = [
  { cmd: '/start',    args: '',                        desc: 'Show the welcome message and main menu.',                         category: 'Basics',        example: '/start' },
  { cmd: '/help',     args: '',                        desc: 'List all available commands.',                                    category: 'Basics',        example: '/help' },
  { cmd: '/link',     args: '<code>',                  desc: 'Link your wallet using a one-time code generated on the website.',category: 'Basics',        example: '/link zr_a8f3k2x9' },
  { cmd: '/unlink',   args: '',                        desc: 'Disconnect your wallet from this Telegram account.',              category: 'Basics',        example: '/unlink' },
  { cmd: '/balance',  args: '',                        desc: 'Check your USDC and shielded cUSDC balance.',                     category: 'Wallet',        example: '/balance' },
  { cmd: '/address',  args: '',                        desc: 'Show your linked wallet address.',                                category: 'Wallet',        example: '/address' },
  { cmd: '/create',   args: '<amount> <to> [memo]',   desc: 'Open the Mini App to create a confidential invoice.',             category: 'Invoices',      example: '/create 50 0xA1c…E4 Design work' },
  { cmd: '/invoices', args: '[pending|paid|all]',      desc: 'List your recent invoices, optionally filtered by status.',       category: 'Invoices',      example: '/invoices pending' },
  { cmd: '/status',   args: '<invoice_id>',            desc: 'Show the status of a specific invoice.',                          category: 'Invoices',      example: '/status 0x7a3b…f0' },
  { cmd: '/pay',      args: '<invoice_id>',            desc: 'Open the Mini App to pay an invoice.',                            category: 'Invoices',      example: '/pay 0x7a3b…f0' },
  { cmd: '/cancel',   args: '<invoice_id>',            desc: 'Cancel a pending invoice you created.',                           category: 'Invoices',      example: '/cancel 0x7a3b…f0' },
  { cmd: '/donate',   args: '<page_id>',               desc: 'Open a donation page in the Mini App.',                           category: 'Donations',     example: '/donate 0xpage…' },
  { cmd: '/alerts',   args: 'on|off',                  desc: 'Toggle all real-time payment notifications.',                     category: 'Notifications', example: '/alerts on' },
  { cmd: '/mute',     args: '<duration>',              desc: 'Temporarily silence notifications (e.g. 1h, 8h, 1d).',           category: 'Notifications', example: '/mute 8h' },
];

// ── Alert types ───────────────────────────────────────────────────────────────
const ALERT_TYPES = [
  { id: 'invoicePaid',      label: 'Invoice paid',           desc: 'Get notified the moment an invoice you created is paid.',   icon: '💰', accent: 'emerald', defaultOn: true  },
  { id: 'invoiceReceived',  label: 'New invoice received',   desc: 'Alert when someone sends you an invoice to pay.',           icon: '📥', accent: 'violet',  defaultOn: true  },
  { id: 'invoiceCancelled', label: 'Invoice cancelled',      desc: 'Notify when an invoice involving you is cancelled.',        icon: '🚫', accent: 'rose',    defaultOn: false },
  { id: 'invoiceExpired',   label: 'Invoice expired',        desc: 'Heads-up when your invoices pass their due date.',          icon: '⏰', accent: 'amber',   defaultOn: true  },
  { id: 'donationReceived', label: 'Donation received',      desc: 'Get pinged for new donations to your pages.',               icon: '❤️', accent: 'indigo',  defaultOn: true  },
  { id: 'balanceChanges',   label: 'Balance changes',        desc: 'Alert when your USDC or cUSDC balance shifts.',             icon: '📊', accent: 'cyan',    defaultOn: false },
];

// ─── Shimmer & Loading ────────────────────────────────────────────────────────
function ShimmerStyle() {
  return (
    <style>{`
      @keyframes shimmer {
        0%   { background-position: -1000px 0; }
        100% { background-position:  1000px 0; }
      }
      @keyframes heroGlow {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50%       { opacity: 0.7; transform: scale(1.05); }
      }
      .skel-shimmer {
        background: linear-gradient(90deg,rgba(63,63,70,0) 0%,rgba(82,82,91,0.25) 50%,rgba(63,63,70,0) 100%);
        background-size: 1000px 100%;
        animation: shimmer 1.8s infinite linear;
      }
      .skel-blur {
        filter: blur(8px); opacity: 0.55;
        pointer-events: none; user-select: none;
      }
      .glow-pulse { animation: heroGlow 4s ease-in-out infinite; }
    `}</style>
  );
}

function LoadingShell({ loading, children }) {
  return (
    <div className="relative">
      <div className={loading ? 'skel-blur transition-all duration-500' : 'transition-all duration-500'}>
        {children}
      </div>
      {loading && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 skel-shimmer" />
        </div>
      )}
    </div>
  );
}

function Spinner({ label, className = '' }) {
  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
function StatusPill({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest bg-emerald-950/60 text-emerald-400 border-emerald-900/40">
      <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest bg-zinc-800/60 text-zinc-500 border-zinc-700/40">
      <span className="w-1.5 h-1.5 bg-zinc-600" />
      Not connected
    </span>
  );
}

function TelegramIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center transition-colors
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${checked ? 'bg-sky-500' : 'bg-zinc-700'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform bg-white
        transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function TelegramApi() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  const [tab,         setTab]         = useState('overview');
  const [linkStatus,  setLinkStatus]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [code,        setCode]        = useState('');
  const [codeExpires, setCodeExpires] = useState(0);
  const [generating,  setGenerating]  = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [pollTick,    setPollTick]    = useState(0);
  const [error,       setError]       = useState('');
  const [prefs,       setPrefs]       = useState({});
  const [savingPrefs, setSavingPrefs] = useState(false);
  const pollRef = useRef(null);

  const isLinked = !!linkStatus?.linked;

  // ── Fetch link status ──────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!address) { setLinkStatus({ linked: false }); setLoading(false); return; }
    try {
      const s = await apiGetTelegramStatus(address);
      setLinkStatus(s);
      const initial = {};
      ALERT_TYPES.forEach(a => { initial[a.id] = s?.prefs?.[a.id] ?? a.defaultOn; });
      setPrefs(initial);
    } catch (e) {
      console.error('[TelegramApi] refreshStatus:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { setLoading(true); refreshStatus(); }, [refreshStatus]);

  // ── Poll for confirmation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!code || isLinked) return;
    pollRef.current = setInterval(async () => {
      setPollTick(t => t + 1);
      try {
        const s = await apiGetTelegramStatus(address);
        if (s?.linked) { setLinkStatus(s); setCode(''); clearInterval(pollRef.current); }
      } catch {}
    }, 4_000);
    return () => clearInterval(pollRef.current);
  }, [code, isLinked, address]);

  // ── Generate new linking code ──────────────────────────────────────────────
  const handleGenerateCode = async () => {
    if (!address) { open(); return; }
    setError(''); setGenerating(true);
    try {
      const { code: c, expiresAt } = await apiGenerateLinkCode(address);
      setCode(c);
      setCodeExpires(Number(expiresAt));
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  // ── Unlink ─────────────────────────────────────────────────────────────────
  const handleUnlink = async () => {
    if (!address) return;
    if (!confirm('Disconnect Telegram from this wallet?')) return;
    setError('');
    try { await apiUnlinkTelegram(address); setLinkStatus({ linked: false }); setCode(''); setPrefs({}); }
    catch (e) { setError(e.message); }
  };

  // ── Update alert prefs ─────────────────────────────────────────────────────
  const handleTogglePref = async (id, value) => {
    setPrefs(p => ({ ...p, [id]: value }));
    setSavingPrefs(true);
    try { await apiUpdateTelegramPrefs(address, { ...prefs, [id]: value }); }
    catch (e) { setError(e.message); setPrefs(p => ({ ...p, [id]: !value })); }
    finally { setTimeout(() => setSavingPrefs(false), 600); }
  };

  // ── Countdown timer ────────────────────────────────────────────────────────
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);

  const secondsLeft = Math.max(0, Math.floor((codeExpires - now) / 1000));
  const codeExpired = code && secondsLeft === 0;
  const deepLink    = code && !codeExpired ? `https://t.me/${BOT_USERNAME}?start=${code}` : '';

  const copyCode = () => {
    if (!code || codeExpired) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Group commands ─────────────────────────────────────────────────────────
  const grouped = COMMANDS.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider selection:bg-sky-400 selection:text-zinc-950">
      <ShimmerStyle />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden border-b border-zinc-900/60 text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none glow-pulse" />
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-blue-600/4 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />

        <div className="max-w-4xl mx-auto relative z-10">
          {/* Breadcrumb */}
          <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-6">
            <Link to="/integrations" className="hover:text-zinc-400 transition-colors">Integrations</Link>
            <span>›</span>
            <span className="text-zinc-400">Telegram</span>
          </div>

          <div className="w-14 h-14 bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto mb-6">
            <TelegramIcon className="w-7 h-7 text-sky-400" />
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-5xl font-bold tracking-tighter text-white leading-[1.05] mb-4 uppercase">
            Telegram
            <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400 bg-clip-text text-transparent"> Integration</span>
          </h1>

          <div className="flex justify-center mb-6">
            <LoadingShell loading={loading}>
              <StatusPill active={isLinked} />
            </LoadingShell>
          </div>

          <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed font-sans normal-case mb-10">
            Link your wallet to @{BOT_USERNAME} and manage invoices, monitor your
            dashboard, and receive real-time payment alerts — all from inside Telegram.
          </p>

          {/* Tabs */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 bg-zinc-950/80 border border-zinc-800/80 p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-5 py-2.5 text-[10px] font-bold font-mono uppercase tracking-widest transition-all ${
                    tab === t.id
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-900/20'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 space-y-6 pt-8">

        {/* Global error */}
        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-950/40 border border-rose-900/30">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span className="text-[10px] font-mono text-rose-400">{error}</span>
            <button onClick={() => setError('')}
              className="ml-auto text-rose-400/60 hover:text-rose-300 text-sm">×</button>
          </div>
        )}

        {/* ════════════════ OVERVIEW TAB ════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Feature cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                    </svg>
                  ),
                  title: 'Wallet Linking',
                  desc: 'Securely connect your Ethereum wallet to your Telegram account using a one-time code. No keys ever leave your wallet.',
                  cta: 'Link your wallet',
                  action: () => setTab('link'),
                },
                {
                  icon: (
                    <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                  ),
                  title: 'Dashboard Monitoring',
                  desc: 'Check your USDC and shielded cUSDC balance, list invoices, and see protocol stats — all from chat.',
                  cta: 'See commands',
                  action: () => setTab('commands'),
                },
                {
                  icon: (
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                  ),
                  title: 'Real-time Alerts',
                  desc: 'Get notified the second an invoice is paid, cancelled, or expires. Customize what fires a notification.',
                  cta: 'Configure alerts',
                  action: () => setTab('alerts'),
                },
              ].map(f => (
                <div key={f.title} className="bg-zinc-900/10 border border-zinc-800/40 p-6 hover:border-sky-500/20 transition-all duration-300">
                  <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                    {f.icon}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono mb-2">{f.title}</div>
                  <p className="text-xs text-zinc-500 leading-relaxed font-sans normal-case mb-4">{f.desc}</p>
                  <button onClick={f.action}
                    className="text-[10px] font-bold font-mono text-sky-400 hover:text-sky-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors">
                    {f.cta}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
              <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Setup</p>
              <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-6">
                From wallet to chat in 3 steps
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { n: '01', title: 'Generate code',        desc: 'Click "Generate link code" in the Wallet Linking tab to mint a one-time, 5-minute token tied to your wallet.' },
                  { n: '02', title: `Open @${BOT_USERNAME}`, desc: 'Tap the deep link or scan the QR — Telegram opens the bot and auto-fills the /link command.' },
                  { n: '03', title: 'Confirmed',             desc: 'Bot replies with ✅ Linked. Your wallet ↔ Telegram pairing is now active. Start receiving alerts.' },
                ].map(s => (
                  <div key={s.n}>
                    <div className="text-3xl font-bold text-zinc-800 tabular-nums font-mono mb-2">{s.n}</div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-200 font-mono mb-2">{s.title}</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed font-sans normal-case">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Security note */}
            <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
              <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-sky-400 font-mono uppercase tracking-widest mb-1">
                  Your keys never leave your wallet
                </p>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                  The bot only stores the mapping between your Telegram chat ID and your
                  public wallet address. All signing happens in your wallet via the Mini App.
                  Encrypted amounts are never decrypted on our servers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ WALLET LINKING TAB ════════════════ */}
        {tab === 'link' && (
          <div className="space-y-6">
            {!isConnected ? (
              <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-16 text-center">
                <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-mono mb-2">
                  Connect your wallet first
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-6 font-sans normal-case">
                  We need your wallet address to tie it to your Telegram account.
                </p>
                <button onClick={() => open()}
                  className="px-6 h-11 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                  Connect Wallet
                </button>
              </div>

            ) : isLinked ? (
              <div className="bg-zinc-900/10 border border-zinc-800/40 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Status</p>
                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">Telegram Connected</h3>
                    <p className="text-[10px] text-zinc-600 font-mono mt-1">
                      @{linkStatus.username || 'user'}
                      {linkStatus.linkedAt && ` · ${new Date(Number(linkStatus.linkedAt)).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
                  </div>
                  <StatusPill active />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                    <p className="text-[10px] text-zinc-600 mb-1 font-mono uppercase tracking-widest font-bold">Wallet</p>
                    <p className="text-xs font-mono text-zinc-300 truncate">{address}</p>
                  </div>
                  <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                    <p className="text-[10px] text-zinc-600 mb-1 font-mono uppercase tracking-widest font-bold">Telegram</p>
                    <p className="text-xs font-mono text-zinc-300">
                      {linkStatus.firstName ? `${linkStatus.firstName} ` : ''}@{linkStatus.username || 'user'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noreferrer"
                    className="flex-1 h-11 flex items-center justify-center gap-2
                      bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono
                      uppercase tracking-widest transition-all shadow-md shadow-sky-500/20">
                    <TelegramIcon className="w-4 h-4" />
                    Open @{BOT_USERNAME}
                  </a>
                  <button onClick={handleUnlink}
                    className="px-5 h-11 bg-zinc-800 hover:bg-rose-950/40 hover:text-rose-400
                      text-zinc-400 text-[10px] font-bold font-mono uppercase tracking-widest
                      border border-zinc-700 transition-all">
                    Disconnect
                  </button>
                </div>

                <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-950/20 border border-emerald-900/30">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span className="text-[10px] font-mono text-emerald-400/80">
                    You're all set. Head to the{' '}
                    <button onClick={() => setTab('alerts')}
                      className="font-bold underline underline-offset-2">Payment Alerts</button>
                    {' '}tab to customize notifications.
                  </span>
                </div>
              </div>

            ) : (
              <>
                <div className="bg-zinc-900/10 border border-zinc-800/40 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Link</p>
                      <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">Link Your Wallet</h3>
                      <p className="text-[10px] text-zinc-600 font-mono mt-1">Generate a one-time code to pair this wallet with Telegram</p>
                    </div>
                    <StatusPill active={false} />
                  </div>

                  <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                    <p className="text-[10px] text-zinc-600 mb-1 font-mono uppercase tracking-widest font-bold">Linking wallet</p>
                    <p className="text-xs font-mono text-zinc-300 break-all">{address}</p>
                  </div>

                  {!code ? (
                    <button onClick={handleGenerateCode} disabled={generating}
                      className="w-full h-12 flex items-center justify-center gap-2
                        bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed
                        text-white text-[10px] font-bold font-mono uppercase tracking-widest
                        transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20">
                      {generating ? <Spinner label="Generating…" /> : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                          </svg>
                          Generate link code
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      {codeExpired ? (
                        <div className="px-4 py-3 bg-amber-950/30 border border-amber-900/40 text-[10px] text-amber-400 text-center font-mono uppercase tracking-wide">
                          Code expired — generate a new one below
                        </div>
                      ) : (
                        <>
                          {/* Code display */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">Your one-time code</p>
                              <p className="text-[10px] text-zinc-600 tabular-nums font-mono">
                                Expires in{' '}
                                <span className={secondsLeft < 60 ? 'text-amber-400 font-bold' : ''}>
                                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                                </span>
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <div className="flex-1 h-12 px-4 flex items-center bg-zinc-950 border border-zinc-800
                                font-mono text-base text-sky-300 tracking-wider select-all">
                                {code}
                              </div>
                              <button onClick={copyCode}
                                className={`h-12 px-4 text-[10px] font-bold font-mono uppercase tracking-widest
                                  transition-all border ${copied
                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                                    : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border-zinc-700'
                                  }`}>
                                {copied ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          {/* Deep link */}
                          <a href={deepLink} target="_blank" rel="noreferrer"
                            className="w-full h-12 flex items-center justify-center gap-2
                              bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono
                              uppercase tracking-widest transition-all active:scale-[0.98]
                              shadow-lg shadow-sky-500/20">
                            <TelegramIcon className="w-4 h-4" />
                            Open @{BOT_USERNAME} & link
                          </a>

                          {/* QR code */}
                          <div className="flex items-center gap-4 p-4 bg-zinc-950/60 border border-zinc-800">
                            <div className="w-24 h-24 bg-white p-1.5 flex-shrink-0">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(deepLink)}&size=180x180&margin=0`}
                                alt="QR code" className="w-full h-full" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-widest mb-1">
                                Or scan from your phone
                              </p>
                              <p className="text-[10px] text-zinc-600 leading-relaxed font-mono">
                                Open Telegram on your phone, scan this QR, and tap <span className="text-zinc-400">Start</span>.
                              </p>
                            </div>
                          </div>

                          {/* Polling indicator */}
                          <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900/60 border border-zinc-800">
                            <Spinner className="text-sky-400" />
                            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">
                              Waiting for confirmation from Telegram…
                            </span>
                            <span className="ml-auto text-[9px] text-zinc-700 font-mono tabular-nums">{pollTick}</span>
                          </div>
                        </>
                      )}

                      <button onClick={handleGenerateCode} disabled={generating}
                        className="w-full h-10 text-[10px] font-bold font-mono uppercase tracking-widest
                          text-zinc-500 hover:text-zinc-300 bg-zinc-900 hover:bg-zinc-800
                          border border-zinc-800 transition-all disabled:opacity-40">
                        {generating ? 'Generating…' : 'Generate new code'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Manual instructions */}
                <div className="bg-zinc-900/10 border border-zinc-800/40 p-6 space-y-4">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase font-mono mb-1">// Manual</p>
                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">If the deep link doesn't work</h3>
                  </div>
                  <div className="space-y-3">
                    {[
                      <>Open Telegram and search for <span className="text-zinc-200 font-mono bg-zinc-900 px-1.5 py-0.5">@{BOT_USERNAME}</span>.</>,
                      <>Tap <span className="text-zinc-200 font-bold">Start</span>.</>,
                      <>Send: <span className="text-zinc-200 font-mono bg-zinc-900 px-1.5 py-0.5">/link {code || '<code>'}</span></>,
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-6 h-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold font-mono text-zinc-500 flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 pt-1">{step}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════ COMMANDS TAB ════════════════ */}
        {tab === 'commands' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
              <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Reference</p>
              <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-1">Bot Commands</h3>
              <p className="text-[10px] text-zinc-600 font-mono mb-6">All commands available in @{BOT_USERNAME} once your wallet is linked</p>

              {Object.keys(grouped).map(cat => (
                <div key={cat} className="mb-6 last:mb-0">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 font-mono">{cat}</h4>
                  <div className="space-y-2">
                    {grouped[cat].map(c => (
                      <div key={c.cmd}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5
                          bg-zinc-950/40 border border-zinc-800/40 hover:border-zinc-700/50 transition-all">
                        <div className="flex items-baseline gap-2 min-w-[200px]">
                          <code className="text-xs font-mono font-bold text-sky-400">{c.cmd}</code>
                          {c.args && <code className="text-[10px] font-mono text-zinc-600">{c.args}</code>}
                        </div>
                        <div className="flex-1 text-[10px] text-zinc-500 font-mono">{c.desc}</div>
                        <code className="text-[10px] font-mono text-zinc-700 bg-zinc-900 px-2 py-1 whitespace-nowrap">
                          {c.example}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pro tip */}
            <div className="flex items-start gap-3 px-5 py-4 bg-violet-500/5 border border-violet-500/10">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-violet-400 font-mono uppercase tracking-widest mb-1">Pro tip</p>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                  Commands that require a signature (
                  <code className="text-zinc-400">/create</code>,{' '}
                  <code className="text-zinc-400">/pay</code>,{' '}
                  <code className="text-zinc-400">/cancel</code>) open the Zeroremit Mini App
                  so your wallet can sign without leaving Telegram.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ PAYMENT ALERTS TAB ════════════════ */}
        {tab === 'alerts' && (
          <div className="space-y-6">
            {!isLinked ? (
              <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-16 text-center">
                <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-mono mb-2">
                  Link Telegram to enable alerts
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-6 font-sans normal-case">
                  Connect your wallet to a Telegram account before configuring notifications.
                </p>
                <button onClick={() => setTab('link')}
                  className="px-6 h-11 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                  Go to Wallet Linking
                </button>
              </div>
            ) : (
              <>
                {/* Alert toggles */}
                <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Notifications</p>
                      <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono">Real-time Payment Alerts</h3>
                      <p className="text-[10px] text-zinc-600 font-mono mt-1">Choose which on-chain events should ping your Telegram</p>
                    </div>
                    {savingPrefs && (
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1.5 font-mono uppercase tracking-wide">
                        <Spinner />
                        Saving…
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {ALERT_TYPES.map(a => (
                      <div key={a.id}
                        className="flex items-start gap-4 p-4 bg-zinc-950/40 border border-zinc-800/40
                          hover:border-zinc-700/50 transition-all">
                        <div className="text-2xl flex-shrink-0">{a.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-zinc-200 font-mono uppercase tracking-widest mb-0.5">{a.label}</p>
                          <p className="text-[10px] text-zinc-600 leading-relaxed font-mono">{a.desc}</p>
                        </div>
                        <div className="flex items-center gap-2 pt-0.5 flex-shrink-0">
                          <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
                            prefs[a.id] ? 'text-emerald-400' : 'text-zinc-600'
                          }`}>
                            {prefs[a.id] ? 'On' : 'Off'}
                          </span>
                          <Toggle checked={!!prefs[a.id]} onChange={v => handleTogglePref(a.id, v)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notification preview */}
                <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
                  <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase font-mono mb-1">// Preview</p>
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mb-4">
                    What an alert looks like
                  </h3>
                  <div className="flex items-start gap-3 p-4 bg-zinc-950/60 border border-zinc-800">
                    <div className="w-10 h-10 bg-sky-500 flex items-center justify-center flex-shrink-0">
                      <TelegramIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-xs font-bold text-zinc-100 font-mono">@{BOT_USERNAME}</span>
                        <span className="text-[9px] text-zinc-700 font-mono">just now</span>
                      </div>
                      <div className="bg-zinc-900 p-3.5 text-xs text-zinc-200 leading-relaxed font-mono">
                        <div className="font-bold mb-1">🟢 Payment received!</div>
                        <div className="text-[10px] text-zinc-500 space-y-0.5 mt-2">
                          <div>From:&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-zinc-300">0xA1c2…E4f0</span></div>
                          <div>Amount:&nbsp;<span className="text-zinc-600 italic">🔐 tap to decrypt</span></div>
                          <div>Tx:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-sky-400">0x9f3b…7a2c ↗</span></div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <span className="px-3 py-1.5 bg-zinc-800 text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-wide">Open in app</span>
                          <span className="px-3 py-1.5 bg-zinc-800 text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-wide">Decrypt amount</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quiet hours */}
                <div className="flex items-start gap-3 px-5 py-4 bg-amber-500/5 border border-amber-500/10">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <div>
                    <p className="text-[10px] font-bold text-amber-400 font-mono uppercase tracking-widest mb-1">Need quiet hours?</p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                      Use <code className="text-zinc-400">/mute 8h</code> in the bot to silence notifications for a set duration.
                      Send <code className="text-zinc-400">/alerts off</code> to disable all alerts entirely.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-zinc-700 font-mono uppercase tracking-widest">
          Bot: @{BOT_USERNAME} · Sepolia · Zama FHE
        </p>
      </div>
    </div>
  );
}