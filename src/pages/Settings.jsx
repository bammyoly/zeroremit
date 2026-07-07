// src/pages/Settings.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import {
  apiGetTelegramStatus,
  apiUnlinkTelegram,
  apiUpdateTelegramPrefs,
  apiGenerateLinkCode,
} from '../lib/api.js';

// ── Config ─────────────────────────────────────────────────────────────────
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ZeroremitBot';

// ── Alert types ────────────────────────────────────────────────────────────
const ALERT_TYPES = [
  { id: 'invoicePaid',      label: 'Invoice paid',         desc: 'Notified the moment an invoice you created is paid.',  icon: '💰', defaultOn: true  },
  { id: 'invoiceReceived',  label: 'New invoice received', desc: 'Alert when someone sends you an invoice to pay.',      icon: '📥', defaultOn: true  },
  { id: 'invoiceCancelled', label: 'Invoice cancelled',    desc: 'Notify when an invoice involving you is cancelled.',   icon: '🚫', defaultOn: false },
  { id: 'invoiceExpired',   label: 'Invoice expired',      desc: 'Heads-up when your invoices pass their due date.',     icon: '⏰', defaultOn: true  },
  { id: 'donationReceived', label: 'Donation received',    desc: 'Get pinged for new donations to your pages.',          icon: '❤️', defaultOn: true  },
  { id: 'balanceChanges',   label: 'Balance changes',      desc: 'Alert when your USDC or cUSDC balance shifts.',        icon: '📊', defaultOn: false },
];

// ── Design tokens ──────────────────────────────────────────────────────────
const CARD = 'bg-zinc-900/10 border border-zinc-800/40';
const SLBL = 'text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1';
const LBL  = 'text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono';
const IFLD = 'w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-sans focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all duration-200';

// ── Reveal hook ────────────────────────────────────────────────────────────
function useReveal(threshold = 0.1) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold, rootMargin: '0px 0px -24px 0px' }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

const reveal = (visible, delay = '') =>
  `transition-all duration-700 ease-out ${delay} ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
  }`;

// ── Encryption helpers (AES-GCM) ──────────────────────────────────────────
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPrivateKey(privateKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(privateKey)
  );
  // Pack salt + iv + ciphertext → base64
  const packed = new Uint8Array(salt.length + iv.length + ct.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(ct), salt.length + iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function decryptPrivateKey(blob, password) {
  const raw  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
  const salt = raw.slice(0, 16);
  const iv   = raw.slice(16, 28);
  const ct   = raw.slice(28);
  const key  = await deriveKey(password, salt);
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// ── Atoms ──────────────────────────────────────────────────────────────────
function TelegramIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)}
      disabled={disabled} aria-pressed={checked}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center
        transition-colors duration-200 focus:outline-none
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${checked ? 'bg-sky-500' : 'bg-zinc-700'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform bg-white
        transition-transform duration-200
        ${checked ? 'translate-x-5' : 'translate-x-1'}`}/>
    </button>
  );
}

function Spinner({ label }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      {label && <span className="font-sans normal-case">{label}</span>}
    </span>
  );
}

function StatusPill({ active, label }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono
      px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest
      bg-emerald-950/60 text-emerald-400 border-emerald-900/40">
      <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse"/>
      {label || 'Connected'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono
      px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest
      bg-zinc-800/60 text-zinc-500 border-zinc-700/40">
      <span className="w-1.5 h-1.5 bg-zinc-600"/>
      {label || 'Not linked'}
    </span>
  );
}

function ErrorBox({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/30
      border border-red-900/30 text-sm text-red-400">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none"
        stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span className="font-sans normal-case flex-1 text-xs">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss}
          className="text-red-400/60 hover:text-red-300 text-sm ml-auto">×</button>
      )}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ eyebrow, title, subtitle, right, children, revealRef, revealCls }) {
  return (
    <div ref={revealRef} className={revealCls}>
      <div className={`${CARD} hover:border-zinc-700/60 transition-all duration-300`}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4
          border-b border-zinc-800/40">
          <div>
            <p className={SLBL}>// {eyebrow}</p>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-zinc-500 mt-0.5 font-sans normal-case">{subtitle}</p>
            )}
          </div>
          {right && <div className="ml-4 flex-shrink-0">{right}</div>}
        </div>
        <div className="px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ── Burner Key Backup Modal ────────────────────────────────────────────────
function BurnerBackupModal({ privateKey, burnerAddress, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
      bg-zinc-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800/80
        shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <p className={SLBL}>// Backup</p>
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
            Save your burner private key
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Warning */}
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-950/30
            border border-amber-900/40">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none"
              stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0
                  2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0
                  L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <p className="text-[10px] font-bold text-amber-400 font-mono
                uppercase tracking-widest mb-1">
                This key is shown only once
              </p>
              <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                Save it in a password manager or write it down. If you lose both
                this key and your password, your burner wallet is unrecoverable.
              </p>
            </div>
          </div>

          {/* Burner address */}
          <div>
            <label className={`${LBL} block mb-2`}>Burner address</label>
            <div className="h-11 px-4 flex items-center bg-zinc-950 border
              border-zinc-800 text-xs font-mono text-zinc-300 break-all">
              {burnerAddress}
            </div>
          </div>

          {/* Private key */}
          <div>
            <label className={`${LBL} block mb-2`}>Private key</label>
            <div className="relative">
              <div className="px-4 py-3 bg-zinc-950 border border-zinc-800
                font-mono text-xs text-rose-300 break-all select-all
                leading-relaxed">
                {privateKey}
              </div>
              <button onClick={copyKey}
                className={`absolute top-2 right-2 px-3 py-1.5 text-[9px]
                  font-bold font-mono uppercase tracking-widest border
                  transition-all ${
                  copied
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
                }`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className={`w-5 h-5 flex-shrink-0 mt-0.5 border flex items-center
              justify-center transition-all ${
              confirmed
                ? 'bg-sky-500 border-sky-400'
                : 'bg-zinc-950 border-zinc-700 group-hover:border-zinc-500'
            }`}>
              {confirmed && (
                <svg className="w-3 h-3 text-white" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </div>
            <input type="checkbox" className="sr-only"
              checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
            <span className="text-[10px] font-mono text-zinc-400 leading-relaxed">
              I have saved my private key in a safe place and understand it
              will not be shown again.
            </span>
          </label>

          {/* Continue */}
          <button onClick={onConfirm} disabled={!confirmed}
            className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-zinc-950
              font-bold font-mono uppercase tracking-widest text-xs
              transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20
              disabled:opacity-40 disabled:cursor-not-allowed">
            I've saved it — continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Burner Password Modal (Create / Import) ────────────────────────────────
function BurnerPasswordModal({ mode, onSubmit, onClose, loading, error }) {
  // mode: 'create' | 'import'
  const [password, setPassword]       = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [privateKey, setPrivateKey]   = useState('');
  const [localError, setLocalError]   = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'create' && password !== confirmPw) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (mode === 'import' && !privateKey.trim()) {
      setLocalError('Paste your burner private key.');
      return;
    }
    if (mode === 'import' && !/^0x[0-9a-fA-F]{64}$/.test(privateKey.trim())) {
      setLocalError('Invalid private key format (expected 0x + 64 hex chars).');
      return;
    }
    onSubmit({ password, privateKey: privateKey.trim() });
  };

  const overlayRef = useRef(null);
  const handleOverlay = (e) => { if (e.target === overlayRef.current) onClose(); };

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div ref={overlayRef} onClick={handleOverlay}
      className="fixed inset-0 z-50 flex items-center justify-center
        bg-zinc-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80
        shadow-2xl shadow-black/60">

        <div className="flex items-center justify-between px-6 pt-5 pb-4
          border-b border-zinc-800/60">
          <div>
            <p className={SLBL}>// Burner wallet</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
              {mode === 'create' ? 'Set wallet password' : 'Import burner wallet'}
            </h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-zinc-600
              hover:text-zinc-300 hover:bg-zinc-800 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {mode === 'create' && (
            <div className="flex items-start gap-2.5 px-4 py-3
              bg-sky-500/5 border border-sky-500/10">
              <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0
                    00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
                This password encrypts your burner wallet's private key. It is
                <strong> never sent to our servers</strong>. Choose something strong.
              </p>
            </div>
          )}

          {mode === 'import' && (
            <div>
              <label className={`${LBL} block mb-2`}>
                Private key <span className="text-sky-400">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="0x…"
                value={privateKey}
                onChange={e => { setPrivateKey(e.target.value); setLocalError(''); }}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800
                  text-sm text-zinc-100 placeholder-zinc-600 font-mono
                  focus:outline-none focus:border-sky-500/60
                  focus:ring-1 focus:ring-sky-500/20 transition-all resize-none"
              />
            </div>
          )}

          <div>
            <label className={`${LBL} block mb-2`}>
              {mode === 'create' ? 'Password' : 'Encryption password'}
              <span className="text-sky-400 ml-0.5">*</span>
            </label>
            <input
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setLocalError(''); }}
              className={IFLD}
            />
          </div>

          {mode === 'create' && (
            <div>
              <label className={`${LBL} block mb-2`}>
                Confirm password <span className="text-sky-400 ml-0.5">*</span>
              </label>
              <input
                type="password"
                placeholder="Re-enter password"
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setLocalError(''); }}
                className={IFLD}
              />
            </div>
          )}

          <ErrorBox message={localError || error} />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-400
                font-bold font-mono uppercase tracking-widest text-xs
                border border-zinc-800 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-zinc-950
                font-bold font-mono uppercase tracking-widest text-xs
                transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20
                disabled:opacity-50 disabled:cursor-not-allowed">
              {loading
                ? <Spinner label={mode === 'create' ? 'Creating…' : 'Importing…'}/>
                : mode === 'create' ? 'Create burner' : 'Import & encrypt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Support / Feedback Modal ───────────────────────────────────────────────
function SupportModal({ onClose }) {
  const [type,    setType]    = useState('feedback');
  const [email,   setEmail]   = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const overlayRef = useRef(null);

  const handleOverlay = (e) => { if (e.target === overlayRef.current) onClose(); };

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      setError('Please enter a message (at least 10 characters).');
      return;
    }
    setSending(true);
    try {
      // TODO: Replace with actual API call
      // await apiSubmitSupport({ type, email, message });
      await new Promise(r => setTimeout(r, 1200));
      setSent(true);
    } catch {
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={overlayRef} onClick={handleOverlay}
      className="fixed inset-0 z-50 flex items-center justify-center
        bg-zinc-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80
        shadow-2xl shadow-black/60">

        <div className="flex items-center justify-between px-6 pt-5 pb-4
          border-b border-zinc-800/60">
          <div>
            <p className={SLBL}>// Support</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
              Contact us
            </h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-zinc-600
              hover:text-zinc-300 hover:bg-zinc-800 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20
              flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide
              font-mono mb-2">
              {type === 'feedback' ? 'Thanks for your feedback!' : 'Complaint received'}
            </h3>
            <p className="text-xs text-zinc-500 font-sans normal-case leading-relaxed mb-6">
              We'll get back to you at <span className="text-zinc-300">{email}</span> soon.
            </p>
            <button onClick={onClose}
              className="px-6 h-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-200
                font-bold font-mono uppercase tracking-widest text-xs
                border border-zinc-700 transition-all">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Type */}
            <div>
              <label className={`${LBL} block mb-2`}>Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: 'feedback', label: 'Feedback',
                    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>,
                  },
                  {
                    id: 'complaint', label: 'Complaint',
                    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>,
                  },
                ].map(t => (
                  <button key={t.id} type="button" onClick={() => setType(t.id)}
                    className={`flex items-center gap-2.5 px-4 py-3 border
                      text-[10px] font-bold font-mono uppercase tracking-widest
                      transition-all ${
                      type === t.id
                        ? 'border-sky-500/60 bg-sky-500/10 text-sky-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700'
                    }`}>
                    <span className={type === t.id ? 'text-sky-400' : 'text-zinc-600'}>{t.icon}</span>
                    {t.label}
                    {type === t.id && <span className="ml-auto w-1.5 h-1.5 bg-sky-400"/>}
                  </button>
                ))}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className={`${LBL} block mb-2`}>
                Email <span className="text-sky-400">*</span>
              </label>
              <input type="email" placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                className={IFLD}/>
            </div>

            {/* Message */}
            <div>
              <label className={`${LBL} block mb-2`}>
                {type === 'feedback' ? 'Your feedback' : 'Describe the issue'}
                <span className="text-sky-400 ml-0.5">*</span>
              </label>
              <textarea rows={4}
                placeholder={type === 'feedback'
                  ? 'Tell us what you love, what could be better…'
                  : 'Please describe the issue in detail…'}
                value={message}
                onChange={e => { setMessage(e.target.value); setError(''); }}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800
                  text-sm text-zinc-100 placeholder-zinc-600 font-sans normal-case
                  focus:outline-none focus:border-sky-500/60 focus:ring-1
                  focus:ring-sky-500/20 transition-all resize-none"/>
              <p className="text-[10px] text-zinc-700 mt-1 font-mono text-right">
                {message.length} chars
              </p>
            </div>

            <ErrorBox message={error}/>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-400
                  font-bold font-mono uppercase tracking-widest text-xs
                  border border-zinc-800 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={sending}
                className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-zinc-950
                  font-bold font-mono uppercase tracking-widest text-xs
                  transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20
                  disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? <Spinner label="Sending…"/> : `Send ${type}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  // ── Telegram ─────────────────────────────────────────────────────────────
  const [telegramStatus,  setTelegramStatus]  = useState(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [prefs,           setPrefs]           = useState({});
  const [savingPrefs,     setSavingPrefs]     = useState(false);
  const [telegramError,   setTelegramError]   = useState('');
  const [linkCode,        setLinkCode]        = useState('');
  const [codeExpires,     setCodeExpires]     = useState(0);
  const [generating,      setGenerating]      = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [now,             setNow]             = useState(Date.now());

  // ── Alerts ───────────────────────────────────────────────────────────────
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [savingAlerts,  setSavingAlerts]  = useState(false);

  // ── Burner wallet ────────────────────────────────────────────────────────
  const [burner,           setBurner]           = useState(null);   // { burnerAddress, automationEnabled, createdAt }
  const [burnerLoading,    setBurnerLoading]    = useState(true);
  const [burnerError,      setBurnerError]      = useState('');
  const [showBurnerCreate, setShowBurnerCreate] = useState(false);  // 'create' | 'import' | false
  const [showBackup,       setShowBackup]       = useState(null);   // { privateKey, burnerAddress }
  const [burnerCreating,   setBurnerCreating]   = useState(false);

  // ── Support ──────────────────────────────────────────────────────────────
  const [showSupport, setShowSupport] = useState(false);

  // ── Reveal refs ──────────────────────────────────────────────────────────
  const [walletRef,   walletVis]   = useReveal();
  const [burnerRef,   burnerVis]   = useReveal();
  const [telegramRef, telegramVis] = useReveal();
  const [alertsRef,   alertsVis]   = useReveal();
  const [supportRef,  supportVis]  = useReveal();

  const isLinked     = !!telegramStatus?.linked;
  const hasBurner    = !!burner?.burnerAddress;
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  // ── Fetch Telegram status ────────────────────────────────────────────────
  const refreshTelegram = useCallback(async () => {
    if (!address) { setTelegramStatus({ linked: false }); setTelegramLoading(false); return; }
    try {
      const s = await apiGetTelegramStatus(address);
      setTelegramStatus(s);
      const initial = {};
      ALERT_TYPES.forEach(a => { initial[a.id] = s?.prefs?.[a.id] ?? a.defaultOn; });
      setPrefs(initial);
      if (s?.alertsEnabled !== undefined) setAlertsEnabled(s.alertsEnabled);
    } catch (e) {
      setTelegramError(e.message);
    } finally {
      setTelegramLoading(false);
    }
  }, [address]);

  useEffect(() => { setTelegramLoading(true); refreshTelegram(); }, [refreshTelegram]);

  // ── Fetch burner status ──────────────────────────────────────────────────
  const refreshBurner = useCallback(async () => {
    if (!address) { setBurner(null); setBurnerLoading(false); return; }
    try {
      // TODO: Replace with actual API
      // const b = await apiGetBurner(address);
      // setBurner(b);
      const stored = localStorage.getItem(`zr_burner_${address.toLowerCase()}`);
      if (stored) setBurner(JSON.parse(stored));
      else setBurner(null);
    } catch (e) {
      setBurnerError(e.message);
    } finally {
      setBurnerLoading(false);
    }
  }, [address]);

  useEffect(() => { setBurnerLoading(true); refreshBurner(); }, [refreshBurner]);

  // ── Code countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!linkCode) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [linkCode]);

  const secondsLeft = Math.max(0, Math.floor((codeExpires - now) / 1000));
  const codeExpired = linkCode && secondsLeft === 0;
  const deepLink    = linkCode && !codeExpired
    ? `https://t.me/${BOT_USERNAME}?start=${linkCode}` : '';

  // ── Generate link code ───────────────────────────────────────────────────
  const handleGenerateCode = async () => {
    if (!address) { open(); return; }
    setTelegramError(''); setGenerating(true);
    try {
      const { code: c, expiresAt } = await apiGenerateLinkCode(address);
      setLinkCode(c); setCodeExpires(Number(expiresAt));
    } catch (e) { setTelegramError(e.message); }
    finally { setGenerating(false); }
  };

  // ── Unlink Telegram ──────────────────────────────────────────────────────
  const handleUnlink = async () => {
    if (!address || !confirm('Disconnect Telegram from this wallet?')) return;
    setTelegramError('');
    try {
      await apiUnlinkTelegram(address);
      setTelegramStatus({ linked: false }); setLinkCode(''); setPrefs({});
    } catch (e) { setTelegramError(e.message); }
  };

  // ── Alerts master toggle ─────────────────────────────────────────────────
  const handleAlertsToggle = async (value) => {
    setAlertsEnabled(value); setSavingAlerts(true);
    try { await apiUpdateTelegramPrefs(address, { ...prefs, alertsEnabled: value }); }
    catch (e) { setTelegramError(e.message); setAlertsEnabled(!value); }
    finally { setTimeout(() => setSavingAlerts(false), 600); }
  };

  // ── Individual pref toggle ───────────────────────────────────────────────
  const handleTogglePref = async (id, value) => {
    setPrefs(p => ({ ...p, [id]: value })); setSavingPrefs(true);
    try { await apiUpdateTelegramPrefs(address, { ...prefs, [id]: value }); }
    catch (e) { setTelegramError(e.message); setPrefs(p => ({ ...p, [id]: !value })); }
    finally { setTimeout(() => setSavingPrefs(false), 600); }
  };

  const copyCode = () => {
    if (!linkCode || codeExpired) return;
    navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Create burner wallet ─────────────────────────────────────────────────
  const handleCreateBurner = async ({ password }) => {
    setBurnerCreating(true); setBurnerError('');
    try {
      // 1. Generate key pair client-side
      // In production: import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const rawKey = '0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      // Derive address (simplified — in prod use viem's privateKeyToAccount)
      // For now we'll use a placeholder derivation
      const { privateKeyToAccount } = await import('viem/accounts');
      const account = privateKeyToAccount(rawKey);
      const burnerAddress = account.address;

      // 2. Encrypt with user password (client-side)
      const encryptedKey_user = await encryptPrivateKey(rawKey, password);

      // 3. Send both encrypted blob AND raw key to server
      //    Server encrypts with wrapping key → encryptedKey_server
      // TODO: Replace with actual API
      // await apiCreateBurner({ wallet: address, burnerAddress, encryptedKey_user, rawKey });

      // For now, store locally
      const burnerData = {
        burnerAddress,
        encryptedKey_user,
        automationEnabled: true,
        createdAt: Date.now(),
      };
      localStorage.setItem(`zr_burner_${address.toLowerCase()}`, JSON.stringify(burnerData));
      setBurner(burnerData);

      // 4. Show backup modal with raw key
      setShowBurnerCreate(false);
      setShowBackup({ privateKey: rawKey, burnerAddress });

    } catch (e) {
      setBurnerError(e.message || 'Failed to create burner wallet');
    } finally {
      setBurnerCreating(false);
    }
  };

  // ── Import burner wallet ─────────────────────────────────────────────────
  const handleImportBurner = async ({ password, privateKey }) => {
    setBurnerCreating(true); setBurnerError('');
    try {
      const { privateKeyToAccount } = await import('viem/accounts');
      const account = privateKeyToAccount(privateKey);
      const burnerAddress = account.address;

      const encryptedKey_user = await encryptPrivateKey(privateKey, password);

      // TODO: Send to server
      const burnerData = {
        burnerAddress,
        encryptedKey_user,
        automationEnabled: true,
        createdAt: Date.now(),
      };
      localStorage.setItem(`zr_burner_${address.toLowerCase()}`, JSON.stringify(burnerData));
      setBurner(burnerData);
      setShowBurnerCreate(false);

    } catch (e) {
      const msg = e.message || 'Import failed';
      setBurnerError(msg.includes('invalid') ? 'Invalid private key.' : msg);
    } finally {
      setBurnerCreating(false);
    }
  };

  // ── Remove burner ────────────────────────────────────────────────────────
  const handleRemoveBurner = async () => {
    if (!confirm('Remove your burner wallet? Make sure you have your private key backed up.'))
      return;
    try {
      // TODO: await apiDeleteBurner(address);
      localStorage.removeItem(`zr_burner_${address.toLowerCase()}`);
      setBurner(null);
    } catch (e) {
      setBurnerError(e.message);
    }
  };

  // ── Toggle automation ───────────────────────────────────────────────────
  const handleToggleAutomation = async (value) => {
    setBurnerError('');
    try {
      // TODO: if disabling → apiDisableAutomation (deletes encryptedKey_server)
      //       if enabling → requires password to re-encrypt for server
      const updated = { ...burner, automationEnabled: value };
      localStorage.setItem(`zr_burner_${address.toLowerCase()}`, JSON.stringify(updated));
      setBurner(updated);
    } catch (e) {
      setBurnerError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider
      selection:bg-sky-400 selection:text-zinc-950">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-16 px-4 overflow-hidden
        border-b border-zinc-900/60 text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]
          bg-sky-500/5 blur-[120px] rounded-full pointer-events-none"/>
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none
          bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]"/>
        <div className="absolute top-0 inset-x-0 h-px
          bg-gradient-to-r from-transparent via-sky-500/30 to-transparent"/>
        <div className="absolute bottom-0 inset-x-0 h-24
          bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"/>

        <div className="max-w-4xl mx-auto relative z-10">
          <div className="w-14 h-14 bg-sky-500/10 border border-sky-500/20
            flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-sky-400" fill="none"
              stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter text-white
            leading-[1.05] mb-4 uppercase">
            Settings
          </h1>
          <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed
            font-sans normal-case">
            Manage your wallet, burner automation, Telegram integration,
            payment alerts, and support.
          </p>
        </div>
      </section>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-24 pt-8 space-y-4">

        {/* ════════ 1. CONNECTED WALLET ════════ */}
        <Section
          eyebrow="Account"
          title="Connected Wallet"
          subtitle="Your primary on-chain identity"
          revealRef={walletRef}
          revealCls={reveal(walletVis)}
          right={
            isConnected
              ? <StatusPill active label="Connected"/>
              : <StatusPill active={false} label="Disconnected"/>
          }>
          {isConnected ? (
            <>
              <div className="flex items-center gap-4 px-4 py-3 bg-zinc-950/60
                border border-zinc-800">
                <div className="w-10 h-10 bg-gradient-to-br from-sky-500/30
                  to-violet-500/30 border border-zinc-700 flex-shrink-0
                  flex items-center justify-center">
                  <svg className="w-5 h-5 text-zinc-500" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2
                        4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0
                        002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`${LBL} mb-0.5`}>Wallet address</p>
                  <p className="text-sm font-mono text-zinc-100 truncate hidden sm:block">{address}</p>
                  <p className="text-sm font-mono text-zinc-100 sm:hidden">{shortAddress}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`https://sepolia.etherscan.io/address/${address}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 h-9 px-4 bg-zinc-900
                    hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold
                    font-mono uppercase tracking-widest text-zinc-400
                    hover:text-zinc-200 transition-all">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  Etherscan
                </a>
                <button onClick={() => open()}
                  className="flex items-center gap-1.5 h-9 px-4 bg-zinc-900
                    hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold
                    font-mono uppercase tracking-widest text-zinc-400
                    hover:text-zinc-200 transition-all">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                  </svg>
                  Switch
                </button>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3 bg-sky-500/5
                border border-sky-500/10">
                <div className="w-2 h-2 bg-sky-400 animate-pulse flex-shrink-0"/>
                <p className="text-[10px] font-mono text-sky-400/80 uppercase tracking-widest">
                  Sepolia Testnet · Zama FHE
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 bg-zinc-900 border border-zinc-800
                flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-zinc-600" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2
                      4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0
                      002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <p className="text-sm font-bold text-zinc-300 uppercase tracking-wide font-mono mb-1">
                No wallet connected
              </p>
              <button onClick={() => open()}
                className="px-6 h-11 bg-sky-500 hover:bg-sky-400 text-zinc-950
                  font-bold font-mono uppercase tracking-widest text-xs
                  transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                Connect Wallet
              </button>
            </div>
          )}
        </Section>

        {/* ════════ 2. BURNER WALLET ════════ */}
        <Section
          eyebrow="Automation"
          title="Burner Wallet"
          subtitle="Server-side signing for Telegram & Zapier automation"
          revealRef={burnerRef}
          revealCls={reveal(burnerVis, 'delay-[50ms]')}
          right={
            burnerLoading
              ? <Spinner/>
              : hasBurner
                ? <StatusPill active label="Active"/>
                : <StatusPill active={false} label="Not created"/>
          }>

          <ErrorBox message={burnerError} onDismiss={() => setBurnerError('')}/>

          {!isConnected ? (
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/5
              border border-amber-500/10">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667
                    1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16
                    c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <p className="text-[10px] font-mono text-amber-400/80">
                Connect your main wallet first.
              </p>
            </div>
          ) : hasBurner ? (
            <>
              {/* Burner info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                  <p className={`${LBL} mb-1`}>Burner address</p>
                  <p className="text-xs font-mono text-zinc-300 truncate">
                    {burner.burnerAddress}
                  </p>
                </div>
                <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                  <p className={`${LBL} mb-1`}>Created</p>
                  <p className="text-xs font-mono text-zinc-300">
                    {new Date(burner.createdAt).toLocaleDateString('en', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Automation toggle */}
              <div className={`flex items-center justify-between px-4 py-3
                border transition-all ${
                burner.automationEnabled
                  ? 'bg-emerald-950/10 border-emerald-900/30'
                  : 'bg-zinc-950/40 border-zinc-800'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 flex-shrink-0 ${
                    burner.automationEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                  }`}/>
                  <div>
                    <p className="text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-200">
                      Server-side signing
                    </p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                      {burner.automationEnabled
                        ? 'Server can sign invoices with your burner key'
                        : 'Automation disabled — server key deleted'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
                    burner.automationEnabled ? 'text-emerald-400' : 'text-zinc-600'
                  }`}>
                    {burner.automationEnabled ? 'On' : 'Off'}
                  </span>
                  <Toggle checked={burner.automationEnabled}
                    onChange={handleToggleAutomation}/>
                </div>
              </div>

              {/* Funding note */}
              <div className="flex items-start gap-2.5 px-4 py-3 bg-sky-500/5
                border border-sky-500/10">
                <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
                  Your burner needs <strong>Sepolia ETH for gas</strong>. Incoming
                  payments (cUSDC) arrive in the burner — sweep them to your main
                  wallet periodically.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <a href={`https://sepolia.etherscan.io/address/${burner.burnerAddress}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 h-9 flex items-center justify-center gap-1.5
                    bg-zinc-900 hover:bg-zinc-800 border border-zinc-800
                    text-[10px] font-bold font-mono uppercase tracking-widest
                    text-zinc-400 hover:text-zinc-200 transition-all">
                  View on Etherscan
                </a>
                <button onClick={handleRemoveBurner}
                  className="px-4 h-9 bg-zinc-900 hover:bg-rose-950/40
                    hover:text-rose-400 text-zinc-500 text-[10px] font-bold
                    font-mono uppercase tracking-widest border border-zinc-800
                    transition-all">
                  Remove
                </button>
              </div>

              {/* Security note */}
              <div className="flex items-start gap-3 px-4 py-3 bg-zinc-900/60
                border border-zinc-800/40">
                <svg className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955
                      11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824
                      10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
                <div>
                  <p className="text-[10px] font-bold text-zinc-500 font-mono uppercase
                    tracking-widest mb-1">
                    Dual-key encryption
                  </p>
                  <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
                    Your key is encrypted with your password (client-side) AND with a
                    server wrapping key (for automation). Disable automation to delete
                    the server copy.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* ── No burner yet ── */
            <>
              <p className="text-xs text-zinc-500 font-sans normal-case leading-relaxed">
                A burner wallet lets you automate invoice creation from Telegram and Zapier
                without connecting your main wallet each time. The private key is encrypted
                with a password you choose — we never see the plaintext.
              </p>

              {/* How it works */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { n: '01', title: 'Set password', desc: 'Encrypts the key in your browser' },
                  { n: '02', title: 'Key generated', desc: 'Shown once for backup — save it!' },
                  { n: '03', title: 'Automation live', desc: 'Server signs with capped limits' },
                ].map(s => (
                  <div key={s.n} className="text-center px-2">
                    <div className="text-xl font-bold text-zinc-800 tabular-nums font-mono mb-1">{s.n}</div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 font-mono mb-1">{s.title}</p>
                    <p className="text-[9px] text-zinc-600 font-mono">{s.desc}</p>
                  </div>
                ))}
              </div>

              {/* Create or Import */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowBurnerCreate('create')}
                  className="h-11 flex items-center justify-center gap-2
                    bg-sky-500 hover:bg-sky-400 text-zinc-950 text-[10px]
                    font-bold font-mono uppercase tracking-widest
                    transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 4v16m8-8H4"/>
                  </svg>
                  Create new
                </button>
                <button onClick={() => setShowBurnerCreate('import')}
                  className="h-11 flex items-center justify-center gap-2
                    bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px]
                    font-bold font-mono uppercase tracking-widest
                    border border-zinc-800 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  Import key
                </button>
              </div>

              {/* Scope caps note */}
              <div className="flex items-start gap-2.5 px-4 py-3 bg-zinc-900/60
                border border-zinc-800/40">
                <svg className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955
                      11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824
                      10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
                <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">
                  Default caps: <strong className="text-zinc-400">$500/invoice</strong>,{' '}
                  <strong className="text-zinc-400">$2,000/day</strong>. Configure in API Keys settings.
                </p>
              </div>
            </>
          )}
        </Section>

        {/* ════════ 3. TELEGRAM ════════ */}
        <Section
          eyebrow="Integration"
          title="Telegram Account"
          subtitle={`Linked to @${BOT_USERNAME}`}
          revealRef={telegramRef}
          revealCls={reveal(telegramVis, 'delay-75')}
          right={
            telegramLoading ? <Spinner/> : <StatusPill active={isLinked}/>
          }>

          <ErrorBox message={telegramError} onDismiss={() => setTelegramError('')}/>

          {!isConnected ? (
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/5
              border border-amber-500/10">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667
                    1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16
                    c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <p className="text-[10px] font-mono text-amber-400/80">
                Connect a wallet first to link Telegram.
              </p>
            </div>
          ) : isLinked ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                  <p className={`${LBL} mb-1`}>Telegram user</p>
                  <p className="text-sm font-mono text-zinc-200">
                    {telegramStatus.firstName ? `${telegramStatus.firstName} ` : ''}
                    <span className="text-zinc-400">@{telegramStatus.username || 'user'}</span>
                  </p>
                </div>
                <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
                  <p className={`${LBL} mb-1`}>Linked on</p>
                  <p className="text-sm font-mono text-zinc-200">
                    {telegramStatus.linkedAt
                      ? new Date(Number(telegramStatus.linkedAt)).toLocaleDateString('en', {
                          month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noreferrer"
                  className="flex-1 h-10 flex items-center justify-center gap-2
                    bg-sky-500 hover:bg-sky-400 text-zinc-950 text-[10px] font-bold
                    font-mono uppercase tracking-widest transition-all shadow-md shadow-sky-500/20">
                  <TelegramIcon className="w-4 h-4"/>
                  Open bot
                </a>
                <button onClick={handleUnlink}
                  className="px-4 h-10 bg-zinc-900 hover:bg-rose-950/40
                    hover:text-rose-400 text-zinc-500 text-[10px] font-bold
                    font-mono uppercase tracking-widest border border-zinc-800 transition-all">
                  Unlink
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-500 font-sans normal-case leading-relaxed">
                Link your wallet to @{BOT_USERNAME} to receive alerts and manage invoices from Telegram.
              </p>
              {!linkCode ? (
                <button onClick={handleGenerateCode} disabled={generating}
                  className="w-full h-11 flex items-center justify-center gap-2
                    bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed
                    text-zinc-950 text-[10px] font-bold font-mono uppercase tracking-widest
                    transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20">
                  {generating ? <Spinner label="Generating…"/> : (
                    <><TelegramIcon className="w-4 h-4"/> Generate link code</>
                  )}
                </button>
              ) : (
                <div className="space-y-3">
                  {codeExpired ? (
                    <div className="px-4 py-3 bg-amber-950/30 border border-amber-900/40
                      text-[10px] text-amber-400 text-center font-mono uppercase tracking-wide">
                      Code expired — generate a new one
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className={LBL}>One-time code</p>
                          <p className="text-[10px] tabular-nums font-mono text-zinc-600">
                            Expires in{' '}
                            <span className={secondsLeft < 60 ? 'text-amber-400 font-bold' : ''}>
                              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                            </span>
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 h-11 px-4 flex items-center bg-zinc-950
                            border border-zinc-800 font-mono text-base text-sky-300
                            tracking-wider select-all">
                            {linkCode}
                          </div>
                          <button onClick={copyCode}
                            className={`h-11 px-4 text-[10px] font-bold font-mono
                              uppercase tracking-widest transition-all border ${
                              copied
                                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border-zinc-700'
                            }`}>
                            {copied ? '✓' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <a href={deepLink} target="_blank" rel="noreferrer"
                        className="w-full h-11 flex items-center justify-center gap-2
                          bg-sky-500 hover:bg-sky-400 text-zinc-950 text-[10px] font-bold
                          font-mono uppercase tracking-widest transition-all
                          active:scale-[0.98] shadow-lg shadow-sky-500/20">
                        <TelegramIcon className="w-4 h-4"/>
                        Open @{BOT_USERNAME} & link
                      </a>
                    </>
                  )}
                  <button onClick={handleGenerateCode} disabled={generating}
                    className="w-full h-9 text-[10px] font-bold font-mono uppercase
                      tracking-widest text-zinc-600 hover:text-zinc-300
                      bg-zinc-900 hover:bg-zinc-800 border border-zinc-800
                      transition-all disabled:opacity-40">
                    {generating ? 'Generating…' : 'New code'}
                  </button>
                </div>
              )}
              <div className="flex items-start gap-2.5 px-4 py-3 bg-zinc-900/60
                border border-zinc-800/40">
                <svg className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">
                  Generate code → open bot → send <code className="text-zinc-400">/link &lt;code&gt;</code>.
                  Expires in 5 min.
                </p>
              </div>
            </>
          )}
        </Section>

        {/* ════════ 4. PAYMENT ALERTS ════════ */}
        <Section
          eyebrow="Notifications"
          title="Payment Alerts"
          subtitle="Real-time on-chain event notifications via Telegram"
          revealRef={alertsRef}
          revealCls={reveal(alertsVis, 'delay-100')}
          right={
            <div className="flex items-center gap-2">
              {savingAlerts && <Spinner/>}
              <Toggle checked={alertsEnabled} onChange={handleAlertsToggle}
                disabled={!isLinked || savingAlerts}/>
            </div>
          }>

          {/* Master toggle status */}
          <div className={`flex items-center justify-between px-4 py-3
            border transition-all ${
            alertsEnabled
              ? 'bg-emerald-950/10 border-emerald-900/30'
              : 'bg-zinc-950/40 border-zinc-800'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 flex-shrink-0 ${
                alertsEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
              }`}/>
              <div>
                <p className="text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-200">
                  All payment alerts
                </p>
                <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                  {alertsEnabled ? 'Notifications are active' : 'All notifications silenced'}
                </p>
              </div>
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
              alertsEnabled ? 'text-emerald-400' : 'text-zinc-600'
            }`}>
              {alertsEnabled ? 'On' : 'Off'}
            </span>
          </div>

          {!isLinked && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-500/5
              border border-amber-500/10">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667
                    1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16
                    c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <p className="text-[10px] font-mono text-amber-400/80">
                Link Telegram above to enable alerts.
              </p>
            </div>
          )}

          {/* Individual toggles */}
          <div className={`space-y-2 transition-all duration-300 ${
            !alertsEnabled || !isLinked ? 'opacity-40 pointer-events-none' : ''
          }`}>
            {ALERT_TYPES.map(a => (
              <div key={a.id}
                className="flex items-center gap-4 px-4 py-3 bg-zinc-950/40
                  border border-zinc-800/40 hover:border-zinc-700/50 transition-all">
                <span className="text-xl flex-shrink-0 leading-none">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-zinc-200 font-mono uppercase
                    tracking-widest mb-0.5">{a.label}</p>
                  <p className="text-[10px] text-zinc-600 leading-relaxed font-mono">{a.desc}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
                    prefs[a.id] ? 'text-emerald-400' : 'text-zinc-600'
                  }`}>
                    {prefs[a.id] ? 'On' : 'Off'}
                  </span>
                  <Toggle checked={!!prefs[a.id]}
                    onChange={v => handleTogglePref(a.id, v)}
                    disabled={savingPrefs || !isLinked || !alertsEnabled}/>
                </div>
              </div>
            ))}
          </div>

          {savingPrefs && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500
              font-mono uppercase tracking-widest">
              <Spinner/> Saving…
            </div>
          )}

          {isLinked && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-500/5
              border border-amber-500/10">
              <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">
                Need quiet hours? Send <code className="text-zinc-400">/mute 8h</code> in the bot.
              </p>
            </div>
          )}
        </Section>

        {/* ════════ 5. SUPPORT ════════ */}
        <Section
          eyebrow="Help"
          title="Support"
          subtitle="Report a problem or share feedback with the team"
          revealRef={supportRef}
          revealCls={reveal(supportVis, 'delay-150')}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-zinc-900 border border-zinc-800
              flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-zinc-500" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172
                    9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0
                    11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-zinc-300 font-mono
                uppercase tracking-widest mb-1">
                Provide feedback or file a complaint
              </p>
              <p className="text-[10px] text-zinc-600 font-mono leading-relaxed mb-4">
                Found a bug? Have a feature request? We read every message and respond within 24 hours.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="px-3 py-2.5 bg-zinc-950/60 border border-zinc-800">
                  <p className={`${LBL} mb-1`}>Response time</p>
                  <p className="text-xs font-mono text-zinc-300">≤ 24 hours</p>
                </div>
                <div className="px-3 py-2.5 bg-zinc-950/60 border border-zinc-800">
                  <p className={`${LBL} mb-1`}>Channel</p>
                  <p className="text-xs font-mono text-zinc-300">Email</p>
                </div>
              </div>
              <button onClick={() => setShowSupport(true)}
                className="flex items-center gap-2 h-11 px-6
                  bg-sky-500 hover:bg-sky-400 text-zinc-950
                  font-bold font-mono uppercase tracking-widest text-xs
                  transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9
                      8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512
                      15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                Open
              </button>
            </div>
          </div>

          <div className="border-t border-zinc-800/40 pt-4 flex flex-wrap gap-4">
            {[
              { label: 'Documentation', href: '/docs' },
              { label: 'Telegram community', href: `https://t.me/${BOT_USERNAME}` },
              { label: 'GitHub', href: 'https://github.com' },
            ].map(l => (
              <a key={l.label} href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[10px] font-mono
                  text-zinc-600 hover:text-sky-400 uppercase tracking-widest transition-colors">
                {l.label}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </a>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <p className="text-center text-[10px] text-zinc-700 font-mono uppercase tracking-widest pt-4">
          Zeroremit · Sepolia · Zama FHE
        </p>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showBurnerCreate && (
        <BurnerPasswordModal
          mode={showBurnerCreate}
          onSubmit={showBurnerCreate === 'create' ? handleCreateBurner : handleImportBurner}
          onClose={() => { setShowBurnerCreate(false); setBurnerError(''); }}
          loading={burnerCreating}
          error={burnerError}
        />
      )}

      {showBackup && (
        <BurnerBackupModal
          privateKey={showBackup.privateKey}
          burnerAddress={showBackup.burnerAddress}
          onConfirm={() => setShowBackup(null)}
        />
      )}

      {showSupport && (
        <SupportModal onClose={() => setShowSupport(false)}/>
      )}
    </div>
  );
}