// src/pages/ZapierApi.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { Link } from 'react-router-dom';
import {
  apiListWebhooks,
  apiCreateWebhook,
  apiPatchWebhook,
  apiDeleteWebhook,
  apiTestWebhook,
  apiGetWebhookDeliveries,
} from '../lib/api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview'    },
  { id: 'webhooks', label: 'Webhooks'    },
  { id: 'guide',    label: 'Setup Guide' },
];

const WEBHOOK_EVENTS = [
  { id: 'invoice.created',   label: 'Invoice Created',   color: 'text-sky-400',     bg: 'bg-sky-950/60 border-sky-900/40'         },
  { id: 'invoice.paid',      label: 'Invoice Paid',      color: 'text-emerald-400', bg: 'bg-emerald-950/60 border-emerald-900/40' },
  { id: 'invoice.cancelled', label: 'Invoice Cancelled', color: 'text-zinc-400',    bg: 'bg-zinc-800/60 border-zinc-700/40'       },
  { id: 'invoice.expired',   label: 'Invoice Expired',   color: 'text-rose-400',    bg: 'bg-rose-950/60 border-rose-900/40'       },
  { id: 'donation.received', label: 'Donation Received', color: 'text-violet-400',  bg: 'bg-violet-950/60 border-violet-900/40'   },
];

const EVENT_MAP = Object.fromEntries(WEBHOOK_EVENTS.map(e => [e.id, e]));

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI atoms
// ─────────────────────────────────────────────────────────────────────────────
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
      .skel-blur { filter: blur(8px); opacity: 0.55; pointer-events: none; user-select: none; }
      .glow-pulse { animation: heroGlow 4s ease-in-out infinite; }
    `}</style>
  );
}

function Spinner({ label, className = '' }) {
  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

function ZapierIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.44 17.89l-1.901-3.865-3.865 1.902.976-4.27-4.27-.976 3.864-1.902-1.901-3.864 4.27.976.976-4.27 1.902 3.864 3.864-1.901-.976 4.27 4.27.976-3.864 1.901 1.901 3.865-4.27-.976-.976 4.27z"/>
    </svg>
  );
}

function EventPill({ eventId }) {
  const ev = EVENT_MAP[eventId];
  if (!ev) return null;
  return (
    <span className={`inline-flex items-center text-[9px] font-bold font-mono px-2 py-0.5 border uppercase tracking-wide ${ev.color} ${ev.bg}`}>
      {ev.label}
    </span>
  );
}

function DeliveryBadge({ status, httpStatus }) {
  const cfg = {
    delivered: { cls: 'bg-emerald-950/60 text-emerald-400 border-emerald-900/40', icon: '✓' },
    pending:   { cls: 'bg-amber-950/60 text-amber-400 border-amber-900/40',       icon: '○' },
    failed:    { cls: 'bg-rose-950/60 text-rose-400 border-rose-900/40',           icon: '✕' },
    dead:      { cls: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40',           icon: '—' },
  }[status] ?? { cls: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40', icon: '?' };
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-2 py-0.5 border uppercase tracking-wide ${cfg.cls}`}>
      {cfg.icon} {status}{httpStatus ? ` · ${httpStatus}` : ''}
    </span>
  );
}

function timeAgo(ms) {
  if (!ms) return '—';
  const d = Math.floor((Date.now() - Number(ms)) / 1000);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhookDeliveryLog
// ─────────────────────────────────────────────────────────────────────────────
function WebhookDeliveryLog({ wallet, webhookId, onClose }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGetWebhookDeliveries(wallet, webhookId);
        if (!cancelled) setDeliveries(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, webhookId]);

  return (
    <div className="mt-2 border border-zinc-800/60 bg-zinc-950/80">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60">
        <p className="text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest">Delivery Log</p>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-sm transition-colors">×</button>
      </div>
      {loading && (
        <div className="py-6 flex justify-center">
          <Spinner label="Loading…" className="text-zinc-500 text-[10px] font-mono" />
        </div>
      )}
      {error && <div className="px-4 py-3 text-[10px] font-mono text-rose-400">{error}</div>}
      {!loading && !error && deliveries.length === 0 && (
        <div className="px-4 py-6 text-center text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
          No deliveries yet
        </div>
      )}
      {!loading && deliveries.length > 0 && (
        <div className="divide-y divide-zinc-800/40 max-h-72 overflow-y-auto">
          {deliveries.map(d => (
            <div key={d.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <DeliveryBadge status={d.status} httpStatus={d.httpStatus} />
                <span className="text-[10px] font-mono text-zinc-400 truncate">{d.event}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[9px] font-mono text-zinc-600">attempt {d.attempts}</span>
                <span className="text-[9px] font-mono text-zinc-700">{timeAgo(d.deliveredAt || d.createdAt)}</span>
              </div>
              {d.responseBody && (
                <p className="text-[9px] font-mono text-zinc-700 truncate max-w-[200px]">{d.responseBody}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhookCreateModal
// ─────────────────────────────────────────────────────────────────────────────
function WebhookCreateModal({ onSubmit, onClose }) {
  const [url,    setUrl]    = useState('');
  const [events, setEvents] = useState([]);
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState('');

  const toggleEvent = (id) => {
    setEvents(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
    setErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!url.trim())         return setErr('Endpoint URL is required');
    if (events.length === 0) return setErr('Select at least one event');
    try {
      const parsed = new URL(url.trim());
      const isHttps     = parsed.protocol === 'https:';
      const isLocalhost = parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
      if (!isHttps && !isLocalhost) return setErr('URL must use HTTPS (or http://localhost for local dev)');
    } catch { return setErr('Enter a valid URL'); }
    setBusy(true);
    try { await onSubmit({ url: url.trim(), events }); }
    catch (e) { setErr(e.message || 'Failed to register webhook'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// New endpoint</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">Add Webhook</h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy}
            className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              Endpoint URL <span className="text-sky-400">*</span>
            </label>
            <input type="url" placeholder="https://hooks.zapier.com/..."
              value={url} onChange={e => { setUrl(e.target.value); setErr(''); }} disabled={busy}
              className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all disabled:opacity-40"/>
            <p className="text-[9px] text-zinc-600 font-mono mt-1">Must use HTTPS. For local dev, http://localhost is allowed.</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              Subscribe to events <span className="text-sky-400">*</span>
            </label>
            <div className="space-y-2">
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.id}
                  className={`flex items-center gap-3 p-3 border cursor-pointer transition-all ${
                    events.includes(ev.id)
                      ? 'border-sky-500/40 bg-sky-950/20'
                      : 'border-zinc-800/40 bg-zinc-950/40 hover:border-zinc-700/60'
                  }`}>
                  <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center transition-all ${
                    events.includes(ev.id) ? 'bg-sky-500 border-sky-400' : 'bg-zinc-950 border-zinc-700'
                  }`}>
                    {events.includes(ev.id) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                  <input type="checkbox" className="sr-only"
                    checked={events.includes(ev.id)} onChange={() => toggleEvent(ev.id)}/>
                  <span className={`text-[10px] font-bold font-mono uppercase tracking-wide ${ev.color}`}>{ev.label}</span>
                  <span className="text-[9px] font-mono text-zinc-600 ml-auto">{ev.id}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2.5 px-4 py-3 bg-sky-500/5 border border-sky-500/10">
            <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
              A signing secret will be shown once after creation. Save it to verify webhook signatures on your endpoint.
            </p>
          </div>
          {err && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-950/30 border border-rose-900/30">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="text-xs text-rose-400 font-mono">{err}</span>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold font-mono uppercase tracking-widest text-xs border border-zinc-800 transition-all disabled:opacity-40">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? <Spinner label="Registering…"/> : 'Add Webhook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhookSecretRevealModal
// ─────────────────────────────────────────────────────────────────────────────
function WebhookSecretRevealModal({ webhookData, onClose }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const copySecret = () => {
    navigator.clipboard.writeText(webhookData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Save your secret</p>
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">Webhook registered</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-950/30 border border-amber-900/40">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <p className="text-[10px] font-bold text-amber-400 font-mono uppercase tracking-widest mb-1">Signing secret — shown only once</p>
              <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                Use this to verify that webhook payloads genuinely came from Zeroremit. Store it securely — it cannot be retrieved again.
              </p>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">Endpoint URL</label>
            <div className="h-11 px-4 flex items-center bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 truncate">
              {webhookData.url}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">Signing secret</label>
            <div className="relative">
              <div className="px-4 py-3 bg-zinc-950 border border-zinc-800 font-mono text-xs text-sky-300 break-all select-all leading-relaxed">
                {webhookData.secret}
              </div>
              <button onClick={copySecret}
                className={`absolute top-2 right-2 px-3 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest border transition-all ${
                  copied
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
                }`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">Subscribed events</label>
            <div className="flex flex-wrap gap-1.5">
              {(webhookData.events || []).map(ev => <EventPill key={ev} eventId={ev} />)}
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className={`w-5 h-5 flex-shrink-0 mt-0.5 border flex items-center justify-center transition-all ${
              confirmed ? 'bg-sky-500 border-sky-400' : 'bg-zinc-950 border-zinc-700 group-hover:border-zinc-500'
            }`}>
              {confirmed && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </div>
            <input type="checkbox" className="sr-only" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
            <span className="text-[10px] font-mono text-zinc-400 leading-relaxed">I have saved the signing secret in a safe place.</span>
          </label>
          <button onClick={onClose} disabled={!confirmed}
            className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhookRow
// ─────────────────────────────────────────────────────────────────────────────
function WebhookRow({ endpoint, wallet, onRefresh }) {
  const [logOpen,  setLogOpen]  = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err,      setErr]      = useState('');

  const events   = (() => { try { return JSON.parse(endpoint.events); } catch { return []; } })();
  const revoked  = !!endpoint.revokedAt;
  const failing  = !revoked && endpoint.failCount >= 3;
  const critical = !revoked && endpoint.failCount >= 7;
  const disabled = !endpoint.active;

  const pillCfg = revoked || disabled
    ? { cls: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40',             dot: 'bg-zinc-600',                    label: disabled ? 'Disabled' : 'Deleted'         }
    : critical
    ? { cls: 'bg-rose-950/60 text-rose-400 border-rose-900/40',             dot: 'bg-rose-400',                    label: `Failing (${endpoint.failCount})`         }
    : failing
    ? { cls: 'bg-amber-950/60 text-amber-400 border-amber-900/40',          dot: 'bg-amber-400 animate-pulse',     label: `Degraded (${endpoint.failCount})`        }
    : { cls: 'bg-emerald-950/60 text-emerald-400 border-emerald-900/40',    dot: 'bg-emerald-400 animate-pulse',   label: 'Active'                                  };

  const handleTest = async () => {
    setErr(''); setTesting(true);
    try { await apiTestWebhook(wallet, endpoint.id); }
    catch (e) { setErr(e.message); }
    finally { setTesting(false); }
  };

  const handleToggle = async () => {
    setErr(''); setToggling(true);
    try { await apiPatchWebhook(wallet, endpoint.id, { active: !endpoint.active }); await onRefresh(); }
    catch (e) { setErr(e.message); }
    finally { setToggling(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete webhook for ${endpoint.url}? This cannot be undone.`)) return;
    setErr(''); setDeleting(true);
    try { await apiDeleteWebhook(wallet, endpoint.id); await onRefresh(); }
    catch (e) { setErr(e.message); setDeleting(false); }
  };

  return (
    <div className={`border transition-all ${
      revoked ? 'bg-zinc-950/60 border-zinc-800/60 opacity-50' : 'bg-zinc-950/40 border-zinc-800/40 hover:border-zinc-700/60'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-zinc-200 truncate mb-1">{endpoint.url}</p>
            <p className="text-[9px] font-mono text-zinc-600">
              ID: {endpoint.id}
              {endpoint.lastFiredAt && ` · Last fired ${timeAgo(endpoint.lastFiredAt)}`}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest flex-shrink-0 ${pillCfg.cls}`}>
            <span className={`w-1.5 h-1.5 ${pillCfg.dot}`}/>
            {pillCfg.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {events.map(ev => <EventPill key={ev} eventId={ev} />)}
          {events.length === 0 && <span className="text-[9px] font-mono text-zinc-700">No events subscribed</span>}
        </div>
        {endpoint.failCount > 0 && !revoked && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Consecutive failures</p>
              <p className="text-[9px] font-mono text-zinc-500 tabular-nums">{endpoint.failCount} / 10</p>
            </div>
            <div className="h-1 bg-zinc-900 overflow-hidden">
              <div className={`h-full transition-all ${
                endpoint.failCount >= 7 ? 'bg-rose-500' : endpoint.failCount >= 3 ? 'bg-amber-500' : 'bg-sky-500'
              }`} style={{ width: `${(endpoint.failCount / 10) * 100}%` }} />
            </div>
            {endpoint.failCount >= 7 && (
              <p className="text-[9px] font-mono text-rose-400 mt-1">
                ⚠ Auto-disable after {10 - endpoint.failCount} more failure{10 - endpoint.failCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
        {err && <p className="text-[10px] font-mono text-rose-400 mb-2">{err}</p>}
        {!revoked && (
          <div className="flex flex-wrap gap-2">
            <button onClick={handleTest} disabled={testing || disabled}
              className="flex items-center gap-1.5 h-8 px-3 bg-zinc-900 hover:bg-sky-950/40 hover:text-sky-400 text-zinc-500 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {testing ? <Spinner /> : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              )}
              {testing ? 'Sending…' : 'Test'}
            </button>
            <button onClick={() => setLogOpen(o => !o)}
              className="flex items-center gap-1.5 h-8 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              {logOpen ? 'Hide Log' : 'Log'}
            </button>
            <button onClick={handleToggle} disabled={toggling}
              className={`flex items-center gap-1.5 h-8 px-3 text-[10px] font-bold font-mono uppercase tracking-widest border transition-all disabled:opacity-40 ${
                disabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700'
                  : 'bg-zinc-900 hover:bg-amber-950/40 hover:text-amber-400 text-zinc-500 border-zinc-800'
              }`}>
              {toggling ? <Spinner /> : disabled ? 'Enable' : 'Pause'}
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="ml-auto flex items-center gap-1.5 h-8 px-3 bg-zinc-900 hover:bg-rose-950/40 hover:text-rose-400 text-zinc-500 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all disabled:opacity-40">
              {deleting ? <Spinner /> : 'Delete'}
            </button>
          </div>
        )}
      </div>
      {logOpen && (
        <div className="px-4 pb-4">
          <WebhookDeliveryLog wallet={wallet} webhookId={endpoint.id} onClose={() => setLogOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhooksSection
// ─────────────────────────────────────────────────────────────────────────────
function WebhooksSection({ address }) {
  const [endpoints,  setEndpoints]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newHook,    setNewHook]    = useState(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true); setError('');
    try { setEndpoints(await apiListWebhooks(address)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const activeCount = endpoints.filter(e => e.active && !e.revokedAt).length;

  return (
    <>
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Outbound</p>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">Webhook Endpoints</h3>
            <p className="text-[10px] text-zinc-600 font-mono mt-1">HTTP callbacks fired on invoice and donation events</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-9 px-4 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-[0.98] shadow-md shadow-sky-500/20">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Webhook
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-950/40 border border-rose-900/30 mb-4">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span className="text-[10px] font-mono text-rose-400 flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-rose-400/60 hover:text-rose-300 text-sm">×</button>
          </div>
        )}
        {loading ? (
          <div className="py-8 text-center">
            <Spinner label="Loading webhooks…" className="text-zinc-500 text-[10px] font-mono" />
          </div>
        ) : endpoints.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
            </div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">No webhook endpoints yet</p>
            <p className="text-[10px] font-mono text-zinc-600">Add one to start receiving real-time event callbacks</p>
          </div>
        ) : (
          <div className="space-y-3">
            {endpoints.map(ep => (
              <WebhookRow key={ep.id} endpoint={ep} wallet={address} onRefresh={refresh} />
            ))}
          </div>
        )}
        {activeCount > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800/40 flex items-center justify-between">
            <p className="text-[10px] font-mono text-zinc-600">
              {activeCount} active endpoint{activeCount !== 1 ? 's' : ''} · max 10 per wallet
            </p>
            <button onClick={refresh}
              className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-wide transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Refresh
            </button>
          </div>
        )}
      </div>
      {showCreate && (
        <WebhookCreateModal
          onSubmit={async ({ url, events }) => {
            const created = await apiCreateWebhook({ wallet: address, url, events });
            setShowCreate(false);
            setNewHook(created);
            await refresh();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {newHook && (
        <WebhookSecretRevealModal webhookData={newHook} onClose={() => setNewHook(null)} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SetupGuide — ALL guide sections correctly inside this component
// ─────────────────────────────────────────────────────────────────────────────
function SetupGuide() {
  const [copied, setCopied] = useState('');

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2500);
  };

  const nodeSnippet = `import crypto from 'crypto';

function verifyWebhook(secret, rawBody, headers) {
  const timestamp = headers['x-zeroremit-timestamp'];
  const received  = headers['x-zeroremit-signature'];

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error('Timestamp too old');

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex');

  if (!crypto.timingSafeEqual(
    Buffer.from(received),
    Buffer.from(expected)
  )) throw new Error('Invalid signature');
}

// Express example — use raw body parser
app.use('/webhook', express.raw({ type: 'application/json' }));
app.post('/webhook', (req, res) => {
  verifyWebhook(process.env.WEBHOOK_SECRET, req.body.toString(), req.headers);
  const event = JSON.parse(req.body);
  console.log(event.event, event.data);
  res.sendStatus(200);
});`;

  const pythonSnippet = `import hmac, hashlib, time

def verify_webhook(secret: str, raw_body: bytes, headers: dict):
    timestamp = headers.get('x-zeroremit-timestamp', '')
    received  = headers.get('x-zeroremit-signature', '')

    if abs(time.time() - int(timestamp)) > 300:
        raise ValueError('Timestamp too old')

    signing_input = f"{timestamp}.{raw_body.decode('utf-8')}"
    expected = 'sha256=' + hmac.new(
        secret.encode(), signing_input.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(received, expected):
        raise ValueError('Invalid signature')`;

  const zapierPayload = `{
  "event":     "invoice.paid",
  "timestamp": 1735689600,
  "data": {
    "invoiceId":  "0x...",
    "creator":    "0x...",
    "recipient":  "0x...",
    "kind":       0,
    "payer":      "0x...",
    "txHash":     "0x...",
    "paidAt":     1735689600
  }
}`;

  const guideSteps = (steps) => (
    <div className="space-y-4">
      {steps.map(s => (
        <div key={s.n} className="flex gap-4 items-start">
          <div className="text-2xl font-bold text-zinc-800 tabular-nums font-mono flex-shrink-0 w-8">{s.n}</div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-200 font-mono mb-1">{s.title}</p>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Zapier (generic) ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Zapier</p>
        <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-6">Connect to Zapier</h3>
        {guideSteps([
          { n: '01', title: 'Create a Zap',          desc: 'In Zapier, click "Create Zap". Search for Webhooks by Zapier as the trigger app.' },
          { n: '02', title: 'Choose "Catch Hook"',    desc: 'Select "Catch Hook" as the trigger event. Zapier gives you a unique webhook URL.' },
          { n: '03', title: 'Register the URL here',  desc: 'Come back to the Webhooks tab above, click "Add Webhook", paste your Zapier URL, and select the events you want.' },
          { n: '04', title: 'Send a test delivery',   desc: 'Click the Test button on your new endpoint. Within 3 seconds, Zapier will detect the payload shape.' },
          { n: '05', title: 'Map the fields',         desc: 'Zapier auto-maps event, timestamp, data.invoiceId, data.creator, data.txHash etc. Drag them into your action.' },
          { n: '06', title: 'Add your action',        desc: 'Send a Slack message, create an Airtable row, send an email — anything Zapier supports. Turn the Zap on.' },
        ])}
      </div>

      {/* ── Make.com ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-violet-400 uppercase font-mono mb-1">// Make.com</p>
        <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-6">Connect to Make.com</h3>
        {guideSteps([
          { n: '01', title: 'Add a Webhook module',  desc: 'In Make, add a module and choose Webhooks → Custom Webhook. Click Add to generate a URL.' },
          { n: '02', title: 'Register the URL here', desc: 'Paste the Make URL in the Webhooks tab. Select events and click Add Webhook.' },
          { n: '03', title: 'Fire a test',           desc: 'Click Test on your endpoint. Make detects the data structure automatically.' },
          { n: '04', title: 'Build your scenario',   desc: 'Add modules after the webhook trigger — Google Sheets, Slack, Gmail, HTTP, anything.' },
        ])}
      </div>

      {/* ── Slack via Zapier ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Slack</p>
        <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-6">
          Invoice alerts → Slack channel
        </h3>
        {guideSteps([
          { n: '01', title: 'Create a Zap',                desc: 'In Zapier, click "Create Zap". Search for Webhooks by Zapier as the trigger.' },
          { n: '02', title: 'Choose "Catch Hook"',         desc: 'Select "Catch Hook" as the trigger event. Copy the Zapier webhook URL.' },
          { n: '03', title: 'Register the URL in Zeroremit', desc: 'Go to the Webhooks tab above. Click "Add Webhook", paste your Zapier URL, select invoice.paid (or any event you want). Save.' },
          { n: '04', title: 'Fire a test',                 desc: 'Click the Test button on your new endpoint. Zapier will detect the payload shape automatically.' },
          { n: '05', title: 'Add Slack as the action',     desc: 'In Zapier, add a new action step. Search for Slack. Choose "Send Channel Message". Connect your Slack workspace.' },
          { n: '06', title: 'Map the message fields',      desc: 'Set Channel to whichever channel you want. Set Message to: "💰 Invoice paid! ID: {{data__invoiceId}} from {{data__payer}}".' },
          { n: '07', title: 'Turn the Zap on',             desc: 'Click Publish. Every time an invoice is paid, your Slack channel gets a message within seconds.' },
        ])}
        <div className="mt-6 p-4 bg-zinc-950/60 border border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-3">Sample Slack message</p>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-emerald-500 flex items-center justify-center flex-shrink-0 text-sm">💰</div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-bold text-zinc-100 font-mono">Zeroremit Bot</span>
                <span className="text-[9px] text-zinc-700 font-mono">just now</span>
              </div>
              <div className="bg-zinc-900 border-l-4 border-emerald-500 px-3 py-2 text-[10px] font-mono text-zinc-300 space-y-0.5">
                <div className="font-bold text-emerald-400">💰 Invoice Paid</div>
                <div>Invoice: <span className="text-zinc-400">0x7a3b…f0</span></div>
                <div>From: <span className="text-zinc-400">0xA1c2…E4f0</span></div>
                <div>Tx: <span className="text-sky-400">0x9f3b…7a2c ↗</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Discord via Zapier ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-violet-400 uppercase font-mono mb-1">// Discord</p>
        <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-6">
          Invoice alerts → Discord channel
        </h3>
        {guideSteps([
          { n: '01', title: 'Create a Zap',                   desc: 'In Zapier, click "Create Zap". Search for Webhooks by Zapier as the trigger.' },
          { n: '02', title: 'Choose "Catch Hook"',             desc: 'Select "Catch Hook". Copy the Zapier webhook URL.' },
          { n: '03', title: 'Register the URL in Zeroremit',   desc: 'Go to the Webhooks tab. Click "Add Webhook", paste the Zapier URL, select your events. Save.' },
          { n: '04', title: 'Fire a test',                     desc: 'Click Test on your endpoint. Zapier detects the payload automatically.' },
          { n: '05', title: 'Add Discord as the action',       desc: 'Add a new action step in Zapier. Search for Discord. Choose "Send Channel Message". Connect your Discord server.' },
          { n: '06', title: 'Map the message',                 desc: 'Pick your channel. Set the message to: "🔔 {{data__event}} — Invoice {{data__invoiceId}} — Tx: {{data__txHash}}".' },
          { n: '07', title: 'Turn the Zap on',                 desc: 'Click Publish. Your Discord server now receives real-time on-chain event notifications.' },
        ])}
        <div className="mt-6 p-4 bg-zinc-950/60 border border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-3">Sample Discord message</p>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-violet-500 flex items-center justify-center flex-shrink-0 text-sm">🤖</div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-bold text-zinc-100 font-mono">Zeroremit#0001</span>
                <span className="text-[9px] text-zinc-700 font-mono">Today at 12:00</span>
              </div>
              <div className="bg-zinc-900 border-l-4 border-violet-500 px-3 py-2 text-[10px] font-mono text-zinc-300 space-y-0.5">
                <div className="font-bold text-violet-400">🔔 invoice.paid</div>
                <div>Invoice: <span className="text-zinc-400">0x7a3b…f0</span></div>
                <div>Payer: <span className="text-zinc-400">0xA1c2…E4f0</span></div>
                <div>Tx: <span className="text-sky-400">0x9f3b…7a2c</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Facebook Lead Ads ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-orange-400 uppercase font-mono mb-1">// Facebook Lead Ads</p>
        <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-2">
          New lead → Auto-create invoice
        </h3>
        <p className="text-[10px] text-zinc-500 font-mono leading-relaxed mb-6">
          When a customer fills your Facebook Lead Ad form, Zapier automatically
          creates an invoice via your Zeroremit API key. The customer receives a
          pay link by email.
        </p>
        <div className="flex items-center gap-2 flex-wrap mb-6 px-4 py-3 bg-zinc-950/60 border border-zinc-800">
          {[
            { label: 'FB Lead',                      color: 'text-blue-400'    },
            { label: '→' },
            { label: 'Zapier',                       color: 'text-orange-400'  },
            { label: '→' },
            { label: 'POST /api/public/invoices',    color: 'text-sky-400'     },
            { label: '→' },
            { label: 'Invoice Created',              color: 'text-emerald-400' },
            { label: '→' },
            { label: 'Email to Customer',            color: 'text-violet-400'  },
          ].map((item, i) => (
            <span key={i} className={`text-[10px] font-bold font-mono uppercase tracking-wide ${item.color || 'text-zinc-600'}`}>
              {item.label}
            </span>
          ))}
        </div>
        <div className="mb-5 px-4 py-3 bg-amber-500/5 border border-amber-500/10">
          <p className="text-[10px] font-bold text-amber-400 font-mono uppercase tracking-widest mb-2">Before you start</p>
          <div className="space-y-1">
            {[
              'A burner wallet created in Dashboard → Automation',
              'An API key generated in Dashboard → Automation → API Keys',
              'A Facebook Lead Ad with a form collecting customer name + email',
              'A Zapier account (free tier works)',
            ].map((req, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-amber-400 text-[10px] font-mono flex-shrink-0">✓</span>
                <span className="text-[10px] font-mono text-zinc-500">{req}</span>
              </div>
            ))}
          </div>
        </div>
        {guideSteps([
          { n: '01', title: 'Create a new Zap',                  desc: 'In Zapier click "Create Zap". This Zap has two steps: a trigger (Facebook) and an action (your API).' },
          { n: '02', title: 'Set trigger — Facebook Lead Ads',   desc: 'Search for Facebook Lead Ads. Choose "New Lead" as the event. Connect your Facebook account and select your Ad Account, Form, and Page.' },
          { n: '03', title: 'Test the trigger',                  desc: 'Zapier pulls a sample lead so you can see the field names (e.g. full_name, email). Make sure your form has these fields.' },
          { n: '04', title: 'Add action — Webhooks by Zapier',   desc: 'Add a new action. Search for "Webhooks by Zapier". Choose "POST" as the event.' },
          { n: '05', title: 'Configure the POST request',        desc: 'Set URL to your API endpoint. Set Payload Type to "JSON". Add your API key to the Headers field.' },
          { n: '06', title: 'Map the lead fields',               desc: 'Build the JSON body using Zapier\'s field mapper. See the exact format below.' },
          { n: '07', title: 'Add action — Gmail (send pay link)',desc: 'Add another action step. Search for Gmail. Choose "Send Email". Map {{data__payUrl}} from the previous step into the email body.' },
          { n: '08', title: 'Turn the Zap on',                   desc: 'Click Publish. Every new Facebook lead now automatically gets an invoice created and a payment link sent to their email.' },
        ])}
        <div className="mt-6 space-y-3">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest">Zapier POST configuration</p>
          <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-1">URL</p>
            <code className="text-[10px] font-mono text-sky-400">https://your-api.com/api/public/invoices</code>
          </div>
          <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-2">Headers</p>
            <div className="space-y-1">
              {[
                { k: 'Authorization', v: 'Bearer zr_live_YOUR_KEY_HERE' },
                { k: 'Content-Type',  v: 'application/json' },
              ].map(({ k, v }) => (
                <div key={k} className="flex items-center gap-3">
                  <code className="text-[10px] font-mono text-zinc-400 flex-shrink-0">{k}:</code>
                  <code className="text-[10px] font-mono text-sky-300">{v}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-1">JSON body</p>
            <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/60 border border-zinc-800 p-4 overflow-x-auto leading-relaxed">{`{
  "recipient": "0x0000000000000000000000000000000000000000",
  "amount":    "99.00",
  "title":     "Order for {{full_name}}",
  "memo":      "{{email}} — Facebook Lead Ad",
  "dueAt":     <unix timestamp 30 days from now>
}`}</pre>
          </div>
          <div className="flex items-start gap-2.5 px-4 py-3 bg-sky-500/5 border border-sky-500/10">
            <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
              Use <code className="text-sky-300">0x000...000</code> as a placeholder recipient if your Facebook
              form does not collect a wallet address. The customer will connect their wallet when they open the pay link.
            </p>
          </div>
        </div>
        <div className="mt-5 p-4 bg-zinc-950/60 border border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-3">Sample email to customer (Gmail step)</p>
          <div className="bg-zinc-900 border border-zinc-800 p-4 text-[10px] font-mono text-zinc-300 space-y-2">
            <div><span className="text-zinc-600">To:</span> {'{{email}}'}</div>
            <div><span className="text-zinc-600">Subject:</span> Your payment link — {'{{full_name}}'}</div>
            <div className="border-t border-zinc-800 pt-2 mt-2 leading-relaxed">
              Hi {'{{full_name}}'},<br/><br/>
              Thank you for your interest. Here is your secure payment link:<br/><br/>
              <span className="text-sky-400">{'{{payUrl}}'}</span><br/><br/>
              This link expires in 30 days.<br/><br/>
              <span className="text-zinc-600">— Powered by Zeroremit</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Event payload reference ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase font-mono mb-1">// Payload</p>
        <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mb-4">Event payload shape</h3>
        <div className="mb-4">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-2">Headers sent on every delivery</p>
          <div className="space-y-1">
            {[
              { h: 'X-Zeroremit-Signature', v: 'sha256=<hex>'    },
              { h: 'X-Zeroremit-Timestamp', v: '<unix seconds>'  },
              { h: 'X-Zeroremit-Event',     v: 'invoice.paid'    },
              { h: 'Content-Type',           v: 'application/json'},
            ].map(({ h, v }) => (
              <div key={h} className="flex items-center gap-3 px-3 py-2 bg-zinc-950/60 border border-zinc-800">
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0">{h}</code>
                <code className="text-[10px] font-mono text-zinc-500">{v}</code>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-4 overflow-x-auto">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-2">Supported events</p>
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-zinc-800/60">
                {['Event', 'Fires when'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-widest font-mono">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { ev: 'invoice.created',   desc: 'New single or multi invoice appears on-chain' },
                { ev: 'invoice.paid',      desc: 'Invoice status flips to fully paid'           },
                { ev: 'invoice.cancelled', desc: 'Invoice cancelled by creator'                 },
                { ev: 'invoice.expired',   desc: 'Invoice passes dueAt without payment'         },
                { ev: 'donation.received', desc: 'New donation recorded on a page'              },
              ].map((r, i) => (
                <tr key={r.ev} className={`border-b border-zinc-800/40 ${i % 2 ? 'bg-zinc-900/20' : ''}`}>
                  <td className="px-3 py-2.5"><code className="text-[10px] font-mono text-sky-400">{r.ev}</code></td>
                  <td className="px-3 py-2.5 text-[10px] font-mono text-zinc-500">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="relative">
          <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest mb-2">Sample payload (invoice.paid)</p>
          <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/60 border border-zinc-800 p-4 overflow-x-auto leading-relaxed">{zapierPayload}</pre>
          <button onClick={() => copy(zapierPayload, 'payload')}
            className={`absolute top-8 right-2 px-3 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest border transition-all ${
              copied === 'payload'
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
            }`}>
            {copied === 'payload' ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-[9px] font-mono text-zinc-700 mt-3">
          ⚠ Amounts are FHE-encrypted on-chain and not included in payloads.
          Only the invoice creator or recipient can decrypt via wallet signature.
        </p>
      </div>

      {/* ── HMAC verification ── */}
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <p className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase font-mono mb-1">// Security</p>
        <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mb-2">Verify webhook signatures</h3>
        <p className="text-[10px] text-zinc-500 font-mono leading-relaxed mb-5">
          Every delivery is HMAC-SHA256 signed. Always verify before processing.
          Use the raw request body — not re-serialized JSON.
        </p>
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest">Node.js / Express</p>
            <button onClick={() => copy(nodeSnippet, 'node')}
              className={`px-3 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest border transition-all ${
                copied === 'node'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
              }`}>
              {copied === 'node' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/60 border border-zinc-800 p-4 overflow-x-auto leading-relaxed">{nodeSnippet}</pre>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-zinc-400 font-mono uppercase tracking-widest">Python</p>
            <button onClick={() => copy(pythonSnippet, 'python')}
              className={`px-3 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest border transition-all ${
                copied === 'python'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
              }`}>
              {copied === 'python' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/60 border border-zinc-800 p-4 overflow-x-auto leading-relaxed">{pythonSnippet}</pre>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function ZapierApi() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  const [tab,       setTab]       = useState('overview');
  const [hookCount, setHookCount] = useState(null);

  useEffect(() => {
    if (!address) { setHookCount(0); return; }
    apiListWebhooks(address)
      .then(list => setHookCount(list.filter(e => e.active && !e.revokedAt).length))
      .catch(() => setHookCount(0));
  }, [address, tab]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider selection:bg-sky-400 selection:text-zinc-950">
      <ShimmerStyle />

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden border-b border-zinc-900/60 text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none glow-pulse" />
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-blue-600/4 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-6">
            <Link to="/integrations" className="hover:text-zinc-400 transition-colors">Integrations</Link>
            <span>›</span>
            <span className="text-zinc-400">Zapier & Webhooks</span>
          </div>
          <div className="w-14 h-14 bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
            <ZapierIcon className="w-7 h-7 text-orange-400" />
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-5xl font-bold tracking-tighter text-white leading-[1.05] mb-4 uppercase">
            Zapier
            <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400 bg-clip-text text-transparent"> & Webhooks</span>
          </h1>
          <div className="flex justify-center mb-6">
            {!isConnected ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest bg-zinc-800/60 text-zinc-500 border-zinc-700/40">
                <span className="w-1.5 h-1.5 bg-zinc-600" /> Not connected
              </span>
            ) : hookCount === null ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest bg-zinc-800/60 text-zinc-500 border-zinc-700/40">
                <span className="w-1.5 h-1.5 bg-zinc-600 animate-pulse" /> Loading…
              </span>
            ) : hookCount === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest bg-zinc-800/60 text-zinc-500 border-zinc-700/40">
                <span className="w-1.5 h-1.5 bg-zinc-600" /> No endpoints configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest bg-emerald-950/60 text-emerald-400 border-emerald-900/40">
                <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
                {hookCount} active endpoint{hookCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed font-sans normal-case mb-10">
            Register HTTPS endpoints that receive real-time callbacks whenever invoices are created,
            paid, cancelled, or expired — and when donations land. Wire them to Zapier, Make.com,
            Slack, or any custom app.
          </p>
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 bg-zinc-950/80 border border-zinc-800/80 p-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-5 py-2.5 text-[10px] font-bold font-mono uppercase tracking-widest transition-all ${
                    tab === t.id ? 'bg-sky-500 text-white shadow-lg shadow-sky-900/20' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BODY ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 space-y-6 pt-8">

        {/* ════ OVERVIEW TAB ════ */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                    </svg>
                  ),
                  title: 'Outbound Webhooks',
                  desc: 'Register any HTTPS URL to receive signed JSON callbacks the moment an on-chain event touches your wallet.',
                  cta: 'Add an endpoint', action: () => setTab('webhooks'),
                },
                {
                  icon: <ZapierIcon className="w-5 h-5 text-orange-400" />,
                  title: 'Zapier Compatible',
                  desc: 'Use "Webhooks by Zapier" as a trigger. No custom Zapier app needed — the generic webhook step works out of the box.',
                  cta: 'See setup guide', action: () => setTab('guide'),
                },
                {
                  icon: (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  ),
                  title: 'HMAC Signed',
                  desc: 'Every payload is signed with a per-endpoint HMAC-SHA256 secret. Verify on your side to guarantee authenticity.',
                  cta: 'Verification guide', action: () => setTab('guide'),
                },
              ].map(f => (
                <div key={f.title} className="bg-zinc-900/10 border border-zinc-800/40 p-6 hover:border-sky-500/20 transition-all duration-300">
                  <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">{f.icon}</div>
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
            <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
              <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Flow</p>
              <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-6">How webhooks work</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { n: '01', title: 'On-chain event',     desc: 'Invoice paid, cancelled, expired — or a donation lands on your page.' },
                  { n: '02', title: 'Indexer detects it', desc: 'Our chain indexer picks up the event within ~15 seconds.' },
                  { n: '03', title: 'Payload dispatched', desc: 'A signed JSON payload is POSTed to every matching endpoint you\'ve registered.' },
                  { n: '04', title: 'Your app reacts',    desc: 'Zapier fires an action, your backend updates its DB, Slack posts a message.' },
                ].map(s => (
                  <div key={s.n}>
                    <div className="text-3xl font-bold text-zinc-800 tabular-nums font-mono mb-2">{s.n}</div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-200 font-mono mb-2">{s.title}</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed font-sans normal-case">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
              <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-sky-400 font-mono uppercase tracking-widest mb-1">Reliable delivery with automatic retries</p>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                  Failed deliveries are retried up to 10 times with exponential backoff
                  (30s → 2m → 10m → 30m → 1h → 3h → 6h → 12h → 24h).
                  After 10 consecutive failures the endpoint is auto-disabled.
                  You can re-enable it from the Webhooks tab at any time.
                </p>
              </div>
            </div>
            {!isConnected && (
              <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-12 text-center">
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-mono mb-2">Connect your wallet to get started</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-6 font-sans normal-case">Webhook endpoints are tied to your wallet address.</p>
                <button onClick={() => open()}
                  className="px-6 h-11 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════ WEBHOOKS TAB ════ */}
        {tab === 'webhooks' && (
          <div className="space-y-6">
            {!isConnected ? (
              <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-16 text-center">
                <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-mono mb-2">Connect your wallet to manage webhooks</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-6 font-sans normal-case">Endpoints are scoped to your wallet address.</p>
                <button onClick={() => open()}
                  className="px-6 h-11 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                  Connect Wallet
                </button>
              </div>
            ) : (
              <WebhooksSection address={address} />
            )}
            <div className="flex items-start gap-3 px-5 py-4 bg-amber-500/5 border border-amber-500/10">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-amber-400 font-mono uppercase tracking-widest mb-1">Test before going live</p>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                  Use{' '}
                  <a href="https://webhook.site" target="_blank" rel="noreferrer"
                    className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
                    webhook.site
                  </a>
                  {' '}to get a free disposable HTTPS URL. Register it here, click Test,
                  and inspect the signed payload before wiring up your real endpoint.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════ SETUP GUIDE TAB ════ */}
        {tab === 'guide' && <SetupGuide />}

        <p className="text-center text-[10px] text-zinc-700 font-mono uppercase tracking-widest">
          Webhooks · HMAC-SHA256 · Sepolia · Zama FHE
        </p>
      </div>
    </div>
  );
}