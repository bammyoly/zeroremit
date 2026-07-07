// Dashboard.jsx
import React, {
  useRef, useState, useMemo, useCallback, useEffect,
} from 'react';
import {
  useAccount, usePublicClient, useWalletClient,
} from 'wagmi';
import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { sepolia } from 'viem/chains';

import ConfidentialUSDCArtifact from '../contracts/ConfidentialUSDC.json';
import addresses                from '../contracts/addresses.json';
import { useZamaEncrypt }       from '../hooks/useZamaEncrypt';
import { useDashboard }         from '../hooks/useDashboard';
import { useBurner }            from '../hooks/useBurner';
import { formatEther } from 'viem';
import {
  apiCreateApiKey,
  apiListApiKeys,
  apiRevokeApiKey,
} from '../lib/api';


// ─── Addresses ────────────────────────────────────────────────────────────────
const CUSDC_ADDRESS = addresses.cUSDC;
const USDC_ADDRESS  = addresses.USDC;
const USDC_DECIMALS = 6;

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL;

let _readClient = null;
function getReadClient() {
  if (!_readClient) {
    _readClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL, { timeout: 60_000, retryCount: 5, retryDelay: 2_000 }),
    });
  }
  return _readClient;
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const USDC_BALANCE_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}];
const CUSDC_HANDLE_ABI = [{
  name: 'confidentialBalanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'bytes32' }],
}];
const USDC_APPROVE_ABI = [{
  name: 'approve', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}];
const USDC_ALLOWANCE_ABI = [{
  name: 'allowance', type: 'function', stateMutability: 'view',
  inputs: [
    { name: 'owner',   type: 'address' },
    { name: 'spender', type: 'address' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}];

// ─── Explicit inline ABIs for shield/unshield ─────────────────────────────────
const CUSDC_WRAP_ABI = [{
  name: 'wrap', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'to',     type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'bytes32' }],
}];

const CUSDC_UNWRAP_ENCRYPTED_ABI = [{
  name: 'unwrap', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'from',            type: 'address' },
    { name: 'to',              type: 'address' },
    { name: 'encryptedAmount', type: 'bytes32' },
    { name: 'inputProof',      type: 'bytes'   },
  ],
  outputs: [{ name: '', type: 'bytes32' }],
}];

const CUSDC_SET_OPERATOR_ABI = [{
  name: 'setOperator', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'operator', type: 'address' },
    { name: 'until',    type: 'uint48'  },
  ],
  outputs: [],
}];

// ── Additional ABIs for burner funding ────────────────────────────────────────
const USDC_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'to',     type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'bool' }],
}];

const CUSDC_CONF_TRANSFER_ABI = [{
  name: 'confidentialTransfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'to',              type: 'address' },
    { name: 'encryptedAmount', type: 'bytes32' },
    { name: 'inputProof',      type: 'bytes'   },
  ],
  outputs: [{ name: '', type: 'bytes32' }],
}];

// Gas estimates for funding
const ETH_TRANSFER_GAS       = 21_000n;
const USDC_TRANSFER_GAS      = 100_000n;
const CUSDC_TRANSFER_GAS     = 8_000_000n;

// Gas
const SHIELD_GAS       = 2_000_000n;
const UNSHIELD_GAS     = 8_000_000n;
const SET_OPERATOR_GAS = 300_000n;

const ETH_PRICE_USD = 3000;

// ─── localStorage for pending unshield ───────────────────────────────────────
const PENDING_UNSHIELD_KEY = (wallet) =>
  wallet ? `zeroremit_pending_unshield_${wallet.toLowerCase()}` : null;

function loadPendingUnshield(wallet) {
  try {
    const key = PENDING_UNSHIELD_KEY(wallet);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Extra safety: confirm stored wallet matches current wallet
    if (parsed.wallet?.toLowerCase() !== wallet.toLowerCase()) return null;
    return {
      ...parsed,
      baseUsdc: {
        ...parsed.baseUsdc,
        amount: BigInt(parsed.baseUsdc.amount),
      },
    };
  } catch { return null; }
}

function savePendingUnshield(wallet, data) {
  try {
    const key = PENDING_UNSHIELD_KEY(wallet);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({
      ...data,
      wallet: wallet.toLowerCase(), // store wallet for verification
      baseUsdc: {
        ...data.baseUsdc,
        amount: data.baseUsdc.amount.toString(),
      },
    }));
  } catch {}
}

function clearPendingUnshield(wallet) {
  try {
    const key = PENDING_UNSHIELD_KEY(wallet);
    if (key) localStorage.removeItem(key);

    // Also clear the old non-scoped key if it exists (migration cleanup)
    localStorage.removeItem('zeroremit_pending_unshield');
  } catch {}
}


// ─── Helpers ──────────────────────────────────────────────────────────────────
const shortAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
const shortHash = h => h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—';

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor(Date.now() / 1000) - Number(ts);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtUsdc(bn) {
  if (bn === null || bn === undefined) return '0.00';
  try {
    return Number(formatUnits(bn, USDC_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  } catch { return '0.00'; }
}

function fmtEth(bn) {
  if (bn === null || bn === undefined) return '0.0000';
  try {
    return Number(formatUnits(bn, 18)).toLocaleString(undefined, {
      minimumFractionDigits: 4, maximumFractionDigits: 4,
    });
  } catch { return '0.0000'; }
}

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const INVOICE_TYPE   = ['Single',  'Multi'];

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

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
      <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
      Live
    </span>
  );
}

// ─── Stat cards ───────────────────────────────────────────────────────────────
function BigCard({ label, accent, children }) {
  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-sky-500/20 transition-all duration-300">
      <div className={`text-[10px] font-bold uppercase tracking-widest font-mono mb-3 ${accent || 'text-zinc-400'}`}>
        {label}
      </div>
      {children}
    </div>
  );
}

function MetricRow({ value, unit, unitColor }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold text-zinc-100 tabular-nums font-mono">{value}</span>
      <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${unitColor || 'text-zinc-600'}`}>{unit}</span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-sky-500/20 transition-all duration-300">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3 font-mono">{label}</div>
      <div className={`text-3xl font-bold leading-none tabular-nums font-mono ${accent || 'text-zinc-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-2 font-mono uppercase tracking-wide">{sub}</div>}
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────
const STATUS_CLS = {
  Pending:   'bg-amber-950/60 text-amber-400 border-amber-900/40',
  Paid:      'bg-emerald-950/60 text-emerald-400 border-emerald-900/40',
  Cancelled: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40',
  Expired:   'bg-rose-950/60 text-rose-400 border-rose-900/40',
  Donation:  'bg-sky-950/60 text-sky-400 border-sky-900/40',
};
const STATUS_DOT = {
  Pending: 'bg-amber-400', Paid: 'bg-emerald-400',
  Cancelled: 'bg-zinc-600', Expired: 'bg-rose-500', Donation: 'bg-sky-400',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-wide ${STATUS_CLS[status] || STATUS_CLS.Pending}`}>
      <span className={`w-1.5 h-1.5 flex-shrink-0 ${STATUS_DOT[status] || STATUS_DOT.Pending}`} />
      {status}
    </span>
  );
}

function DirectionPill({ direction }) {
  const sent = direction === 'sent';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 border uppercase tracking-wide ${sent ? 'bg-orange-950/50 text-orange-400 border-orange-900/30' : 'bg-emerald-950/50 text-emerald-400 border-emerald-900/30'}`}>
      <svg className={`w-3 h-3 ${sent ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
      </svg>
      {sent ? 'Sent' : 'Received'}
    </span>
  );
}

// ─── Table rows ───────────────────────────────────────────────────────────────
function ActivityRow({ event, index }) {
  const base   = 'https://sepolia.etherscan.io';
  const isInv  = event.source === 'invoice';
  const status = isInv ? (INVOICE_STATUS[event.status] ?? 'Pending') : 'Donation';
  const type   = isInv ? (INVOICE_TYPE[Number(event.kind)] ?? 'Single') : 'Donation';
  return (
    <tr className={`border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3 text-xs text-zinc-700 font-mono">{index + 1}</td>
      <td className="px-4 py-3"><DirectionPill direction={event.direction} /></td>
      <td className="px-4 py-3">
        <a href={`${base}/tx/${event.txHash}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors group">
          <span className="text-xs font-mono">{shortHash(event.txHash)}</span>
          <svg className="w-3 h-3 opacity-0 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-zinc-500 max-w-[120px] truncate">
        {shortHash(event.invoiceId || event.pageId || '—')}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] px-2 py-0.5 font-mono font-bold uppercase tracking-wide border ${type === 'Single' ? 'bg-zinc-900/60 text-zinc-400 border-zinc-800/60' : 'bg-sky-950/60 text-sky-400 border-sky-900/40'}`}>
          {type}
        </span>
      </td>
      <td className="px-4 py-3">
        <a href={`${base}/address/${event.from}`} target="_blank" rel="noreferrer"
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200">{shortAddr(event.from)}</a>
      </td>
      <td className="px-4 py-3">
        <a href={event.to === 'open' ? '#' : `${base}/address/${event.to}`}
          target="_blank" rel="noreferrer"
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200">
          {event.to === 'open' ? 'Open' : shortAddr(event.to)}
        </a>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-700 italic font-mono select-none tracking-widest">[fhe]</td>
      <td className="px-4 py-3"><StatusBadge status={status} /></td>
      <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap font-mono">{timeAgo(event.timestamp)}</td>
    </tr>
  );
}

function SkeletonRow({ index }) {
  return (
    <tr className={`border-b border-zinc-800/40 ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-3 rounded bg-zinc-800/60 ${i === 1 ? 'w-16' : i === 4 || i === 8 ? 'w-14' : i === 7 ? 'w-10' : 'w-20'}`} />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({ connected, fetchError }) {
  return (
    <tr>
      <td colSpan={10} className="px-4 py-20 text-center">
        {!connected ? (
          <p className="text-zinc-600 text-xs font-mono uppercase tracking-widest">Connect your wallet to view activity</p>
        ) : fetchError ? (
          <div>
            <p className="text-rose-400/80 text-xs font-mono uppercase tracking-widest mb-2">Failed to fetch events</p>
            <p className="text-zinc-700 text-xs font-mono break-all">{fetchError}</p>
          </div>
        ) : (
          <p className="text-zinc-600 text-xs font-mono uppercase tracking-widest">No transactions found</p>
        )}
      </td>
    </tr>
  );
}

// ─── Grouped Bar Chart ────────────────────────────────────────────────────────
function GroupedBarChart({ events }) {
  const [range, setRange] = useState('1M');
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const series = useMemo(() => {
    const inv = events.filter(e => e.source === 'invoice' && e.timestamp);
    const now = Math.floor(Date.now() / 1000);
    const cutoffs = { '1D': now - 86_400, '1W': now - 7 * 86_400, '1M': now - 30 * 86_400 };
    const steps   = { '1D': 3_600, '1W': 86_400, '1M': 86_400 };
    const cutoff  = cutoffs[range]; const step = steps[range];
    const start   = Math.floor(cutoff / step) * step;
    const end     = Math.floor(now / step) * step;
    const bk = {};
    for (let k = start; k <= end; k += step) bk[k] = { pending: 0, paid: 0, cancelled: 0 };
    inv.filter(e => Number(e.timestamp) >= cutoff).forEach(e => {
      const k = Math.floor(Number(e.timestamp) / step) * step;
      if (!bk[k]) bk[k] = { pending: 0, paid: 0, cancelled: 0 };
      if (e.status === 0) bk[k].pending++;
      if (e.status === 1) bk[k].paid++;
      if (e.status === 2) bk[k].cancelled++;
    });
    return Object.keys(bk).map(Number).sort((a, b) => a - b).map(k => ({ t: k, ...bk[k] }));
  }, [events, range]);

  const W = 900; const H = 280;
  const PAD = { top: 24, right: 24, bottom: 36, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const yMax = useMemo(() => {
    const m = Math.max(...series.flatMap(p => [p.pending, p.paid, p.cancelled]), 1);
    return Math.ceil(m / 4) * 4 || 4;
  }, [series]);
  const yFor = v => PAD.top + innerH - (v / yMax) * innerH;
  const n = series.length || 1;
  const groupW = innerW / n;
  const barW = Math.max(2, groupW * 0.22);
  const gap = Math.max(1, groupW * 0.03);
  const BARS = [
    { key: 'pending', color: '#f59e0b', label: 'Pending' },
    { key: 'paid', color: '#10b981', label: 'Settled' },
    { key: 'cancelled', color: '#f43f5e', label: 'Cancelled' },
  ];
  const totalGroupW = barW * 3 + gap * 2;
  function xGroupStart(i) { return PAD.left + groupW * i + (groupW - totalGroupW) / 2; }

  const xLabels = useMemo(() => {
    if (!series.length) return [];
    const fmtDay = t => new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const fmtHr = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit' });
    const fmt = range === '1D' ? fmtHr : fmtDay;
    const step = Math.max(1, Math.floor(series.length / 6));
    const out = [];
    for (let i = 0; i < series.length; i += step)
      out.push({ i, x: PAD.left + groupW * i + groupW / 2, label: fmt(series[i].t) });
    const last = series.length - 1;
    if (out[out.length - 1]?.i !== last && last >= 0)
      out.push({ i: last, x: PAD.left + groupW * last + groupW / 2, label: fmt(series[last].t) });
    return out;
  }, [series, range]);

  const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map(v => Math.round(v));
  function onMove(e) {
    if (!svgRef.current || !series.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(series.length - 1, Math.floor((px - PAD.left) / groupW))));
  }
  const hasData = series.some(p => p.pending + p.paid + p.cancelled > 0);
  const totals = series.reduce((a, p) => ({
    pending: a.pending + p.pending, paid: a.paid + p.paid, cancelled: a.cancelled + p.cancelled,
  }), { pending: 0, paid: 0, cancelled: 0 });

  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-6 hover:border-sky-500/10 transition-all duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Invoice activity</p>
          <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono">Pending · Settled · Cancelled</h3>
        </div>
        <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 p-1">
          {['1D', '1W', '1M'].map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest transition-all ${range === r ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-8 mb-6 pb-5 border-b border-zinc-800/40 flex-wrap">
        {[
          { label: 'Pending', value: totals.pending, color: 'text-amber-400' },
          { label: 'Settled', value: totals.paid, color: 'text-emerald-400' },
          { label: 'Cancelled', value: totals.cancelled, color: 'text-rose-400' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1 font-mono">{label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold tabular-nums font-mono ${color}`}>{value}</span>
              <span className="text-[10px] text-zinc-500 font-mono uppercase">{range}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest">No activity in this period</p>
          </div>
        )}
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair select-none" style={{ maxHeight: 320 }}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {yTicks.map(v => (
            <g key={`y-${v}`}>
              <line x1={PAD.left} y1={yFor(v)} x2={W - PAD.right} y2={yFor(v)} stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
              <text x={PAD.left - 10} y={yFor(v) + 4} textAnchor="end" fill="#52525b" fontSize="11" fontFamily="monospace" fontWeight="600">{v}</text>
            </g>
          ))}
          <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} stroke="#3f3f46" strokeWidth="1" opacity="0.6" />
          {xLabels.map((l, i) => (
            <text key={`x-${i}`} x={l.x} y={H - 6} textAnchor="middle" fill="#52525b" fontSize="11" fontFamily="monospace" fontWeight="600">{l.label}</text>
          ))}
          {series.map((p, i) => {
            const gx = xGroupStart(i);
            return (
              <g key={`g-${i}`}>
                {hover === i && <rect x={PAD.left + groupW * i} y={PAD.top} width={groupW} height={innerH} fill="white" opacity="0.03" />}
                {BARS.map((b, bi) => {
                  const val = p[b.key]; const bh = Math.max(0, (val / yMax) * innerH);
                  const bx = gx + bi * (barW + gap); const by = PAD.top + innerH - bh;
                  return <rect key={b.key} x={bx} y={by} width={barW} height={bh} fill={b.color} opacity={hover === i ? 1 : 0.7} style={{ transition: 'opacity 0.15s' }} />;
                })}
              </g>
            );
          })}
          {hover !== null && series[hover] && (
            <line x1={PAD.left + groupW * hover + groupW / 2} y1={PAD.top}
              x2={PAD.left + groupW * hover + groupW / 2} y2={PAD.top + innerH}
              stroke="#52525b" strokeWidth="1" strokeDasharray="3 3" />
          )}
        </svg>
        {hover !== null && series[hover] && (() => {
          const pct = ((PAD.left + groupW * hover + groupW / 2) / W) * 100;
          return (
            <div className="absolute pointer-events-none bg-zinc-950 border border-zinc-800 shadow-xl px-3 py-2 text-xs font-mono"
              style={{ left: `${pct}%`, top: 8, transform: 'translateX(-50%)', minWidth: 120 }}>
              <div className="text-zinc-500 mb-1.5 font-bold uppercase tracking-wide text-[9px]">
                {new Date(series[hover].t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', hour: range === '1D' ? '2-digit' : undefined })}
              </div>
              {BARS.map(b => (
                <div key={b.key} className="flex items-center justify-between gap-4 text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 inline-block" style={{ background: b.color }} />{b.label}
                  </span>
                  <span className="font-bold">{series[hover][b.key]}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-zinc-800/40 flex-wrap gap-3">
        <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-widest">Hover to inspect</p>
        <div className="flex items-center gap-5">
          {BARS.map(b => (
            <div key={b.key} className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono uppercase">
              <span className="w-2 h-2 inline-block" style={{ background: b.color }} />{b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Donut Card ───────────────────────────────────────────────────────────────
function DonutCard({ title, subtitle, segments, note, valueFormatter }) {
  const [hovered, setHovered] = useState(null);
  const R = 70; const CX = 95; const CY = 90; const STROKE = 22;
  const r = R - STROKE / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const arcs = useMemo(() => {
    if (total === 0) return [];
    let cum = -Math.PI / 2;
    return segments.map(seg => {
      const frac = seg.value / total; const start = cum; const end = cum + frac * 2 * Math.PI; cum = end;
      const x1 = CX + r * Math.cos(start); const y1 = CY + r * Math.sin(start);
      const x2 = CX + r * Math.cos(end); const y2 = CY + r * Math.sin(end);
      const large = frac > 0.5 ? 1 : 0; const midA = (start + end) / 2;
      return {
        ...seg,
        path: total === 1 || frac >= 0.999
          ? `M ${CX} ${CY - r} A ${r} ${r} 0 1 1 ${CX - 0.001} ${CY - r} Z`
          : `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
        pct: Math.round(frac * 100), midX: CX + (r + 8) * Math.cos(midA), midY: CY + (r + 8) * Math.sin(midA),
      };
    });
  }, [segments, total]);
  const hovSeg = hovered !== null ? arcs[hovered] : null;
  const fmt = valueFormatter || (v => v);
  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-sky-500/20 transition-all duration-300">
      <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-0.5">{subtitle}</p>
      <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mb-4">{title}</h4>
      <div className="flex items-center gap-6">
        <div className="flex-shrink-0">
          <svg width={CX * 2} height={CY * 2 - 4} viewBox={`0 0 ${CX * 2} ${CY * 2}`}>
            {total === 0 ? <circle cx={CX} cy={CY} r={r} fill="none" stroke="#27272a" strokeWidth={STROKE} /> : arcs.map((arc, i) => (
              <path key={arc.label} d={arc.path} fill="none" stroke={arc.color}
                strokeWidth={hovered === i ? STROKE + 3 : STROKE} strokeLinecap="butt"
                opacity={hovered !== null && hovered !== i ? 0.3 : 0.9}
                style={{ transition: 'all 0.18s', cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            ))}
            <text x={CX} y={CY - 6} textAnchor="middle" fill="#f4f4f5" fontSize="18" fontFamily="monospace" fontWeight="700">
              {hovSeg ? `${hovSeg.pct}%` : (total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total)}
            </text>
            <text x={CX} y={CY + 10} textAnchor="middle" fill="#52525b" fontSize="9" fontFamily="monospace" fontWeight="600">
              {hovSeg ? hovSeg.label.toUpperCase() : 'TOTAL'}
            </text>
          </svg>
        </div>
        <div className="flex flex-col gap-2.5 min-w-0 flex-1">
          {arcs.map((arc, i) => (
            <div key={arc.label} className="flex items-center justify-between gap-3 cursor-default"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 flex-shrink-0" style={{ background: arc.color }} />
                <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 truncate">{arc.label}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold font-mono text-zinc-200 tabular-nums">{fmt(arc.value)}</span>
                <span className="text-[9px] font-mono text-zinc-600">{arc.pct}%</span>
              </div>
            </div>
          ))}
          {total === 0 && <p className="text-[10px] text-zinc-600 font-mono uppercase">No data yet</p>}
          {note && <p className="text-[9px] text-zinc-700 font-mono mt-1 leading-relaxed">{note}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Pending Unshield Banner ──────────────────────────────────────────────────
function PendingUnshieldBanner({ pendingTxHash, pendingAmount, pendingTimestamp, baseUsdc, onFinalized, onDismiss }) {
  const [elapsed, setElapsed] = useState(0);
  const [finalized, setFinalized] = useState(false);
  const intervalRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (pendingTimestamp) setElapsed(Math.floor((Date.now() - pendingTimestamp) / 1000));
  }, [pendingTimestamp]);

  useEffect(() => {
    intervalRef.current = setInterval(() => setElapsed(e => e + 30), 30_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const current = await getReadClient().readContract({
          address: USDC_ADDRESS, abi: USDC_BALANCE_ABI,
          functionName: 'balanceOf', args: [baseUsdc.address],
        });
        if (!cancelled && current > baseUsdc.amount) {
          setFinalized(true);
          clearInterval(intervalRef.current);
          clearInterval(pollRef.current);
          onFinalized?.();
        }
      } catch {}
    }
    pollRef.current = setInterval(poll, 30_000);
    poll();
    return () => { cancelled = true; clearInterval(pollRef.current); };
  }, [baseUsdc, onFinalized]);

  const mins = Math.floor(elapsed / 60);
  const elapsedLabel = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : mins > 0 ? `${mins}m elapsed` : 'just submitted';

  if (finalized) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-950/40 border border-emerald-900/40">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">USDC arrived — unshield complete</span>
            {pendingAmount && <p className="text-[9px] font-mono text-emerald-400/60 mt-0.5">{pendingAmount} cUSDC → USDC</p>}
          </div>
        </div>
        <button onClick={onDismiss} className="text-[10px] font-mono text-emerald-400/60 hover:text-emerald-300 uppercase tracking-wide">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-sky-950/40 border border-sky-900/40">
      <div className="flex items-center gap-2.5 min-w-0">
        <Spinner className="flex-shrink-0 text-sky-400" />
        <div className="min-w-0">
          <span className="text-[10px] font-mono text-sky-400 uppercase tracking-widest font-bold">
            Unshield pending{pendingAmount && ` · ${pendingAmount} cUSDC`} · {elapsedLabel}
          </span>
          <p className="text-[9px] font-mono text-zinc-600 mt-0.5">
            Zama coprocessor finalizing — USDC arrives automatically · persists across reloads
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {pendingTxHash && (
          <a href={`https://sepolia.etherscan.io/tx/${pendingTxHash}`} target="_blank" rel="noreferrer"
            className="text-[9px] font-mono text-sky-400/60 hover:text-sky-300 uppercase tracking-wide">Tx ↗</a>
        )}
        <button onClick={onDismiss} className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-wide">Dismiss</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// FUND BURNER MODAL
// ═══════════════════════════════════════════════════════════════════════════

function FundBurnerModal({ isOpen, onClose, burnerAddress, usdcBal, cusdcVal, isCusdcDecrypted, ethBal, onSuccess }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { encryptAmount, sdkReady } = useZamaEncrypt();

  const [asset,   setAsset]   = useState('cusdc-shield'); // eth | usdc | cusdc-shield | cusdc-transfer
  const [amount,  setAmount]  = useState('');
  const [step,    setStep]    = useState('idle'); // idle | approving | funding | done | error
  const [txHash,  setTxHash]  = useState('');
  const [errMsg,  setErrMsg]  = useState('');


  useEffect(() => { if (!isOpen) { setAmount(''); setStep('idle'); setTxHash(''); setErrMsg(''); setAsset('cusdc-shield'); } }, [isOpen]);
  useEffect(() => { setAmount(''); setStep('idle'); setTxHash(''); setErrMsg(''); }, [asset]);

  if (!isOpen) return null;

  // ── Balance for the currently selected source asset ─────────────────────────
  const getSourceBalance = () => {
    switch (asset) {
      case 'eth':             return ethBal;
      case 'usdc':            return usdcBal;
      case 'cusdc-shield':    return usdcBal;   // shield source is USDC
      case 'cusdc-transfer':  return cusdcVal;  // direct transfer source is cUSDC
      default: return null;
    }
  };

  const getDecimals    = () => asset === 'eth' ? 18 : USDC_DECIMALS;
  const getSourceLabel = () => asset === 'eth' ? 'ETH' : asset === 'cusdc-transfer' ? 'cUSDC' : 'USDC';
  const getDestLabel   = () => asset === 'eth' ? 'ETH' : asset === 'usdc' ? 'USDC' : 'cUSDC';

  const srcBalance = getSourceBalance();
  const srcDec     = getDecimals();
  const maxStr     = srcBalance ? formatUnits(srcBalance, srcDec) : '0';
  const amtNum     = parseFloat(amount) || 0;
  const maxNum     = srcBalance ? Number(maxStr) : 0;
  const exceeds    = amtNum > maxNum;

  // For cUSDC transfer we need decrypted cUSDC balance
  const needsDecryption = asset === 'cusdc-transfer' && !isCusdcDecrypted;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleFundEth() {
    setStep('funding'); setErrMsg('');
    try {
      const value = parseUnits(amount, 18);
      const tx = await walletClient.sendTransaction({
        to: burnerAddress,
        value,
        account: address,
        chain: sepolia,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx); setStep('done'); onSuccess?.();
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Transfer failed';
      setErrMsg(msg.includes('user rejected') ? 'Transaction cancelled.' : msg);
      setStep('error');
    }
  }

  async function handleFundUsdc() {
    setStep('funding'); setErrMsg('');
    try {
      const raw = parseUnits(amount, USDC_DECIMALS);
      const tx = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_TRANSFER_ABI,
        functionName: 'transfer',
        args: [burnerAddress, raw],
        account: address, chain: sepolia,
        gas: USDC_TRANSFER_GAS,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx); setStep('done'); onSuccess?.();
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Transfer failed';
      setErrMsg(msg.includes('user rejected') ? 'Transaction cancelled.' : msg);
      setStep('error');
    }
  }

  async function handleShieldToBurner() {
    setErrMsg('');
    try {
      const raw = parseUnits(amount, USDC_DECIMALS);

      // Step 1: approve
      const allowance = await publicClient.readContract({
        address: USDC_ADDRESS, abi: USDC_ALLOWANCE_ABI,
        functionName: 'allowance', args: [address, CUSDC_ADDRESS],
      });
      if (allowance < raw) {
        setStep('approving');
        const approveTx = await walletClient.writeContract({
          address: USDC_ADDRESS, abi: USDC_APPROVE_ABI,
          functionName: 'approve', args: [CUSDC_ADDRESS, raw],
          account: address, chain: sepolia,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      // Step 2: wrap directly to burner
      setStep('funding');
      const wrapTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_WRAP_ABI,
        functionName: 'wrap', args: [burnerAddress, raw],
        account: address, chain: sepolia, gas: SHIELD_GAS,
      });
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });
      setTxHash(wrapTx); setStep('done'); onSuccess?.();
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Shield failed';
      setErrMsg(msg.includes('user rejected') ? 'Transaction cancelled.' : msg);
      setStep('error');
    }
  }

  async function handleConfidentialTransfer() {
    setErrMsg('');
    try {
      const raw = parseUnits(amount, USDC_DECIMALS);
      if (isCusdcDecrypted && cusdcVal !== null && raw > BigInt(cusdcVal)) {
        throw new Error('Amount exceeds cUSDC balance');
      }

      // Step 1: setOperator (so cUSDC contract can move funds)
      setStep('approving');
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const opTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_SET_OPERATOR_ABI,
        functionName: 'setOperator', args: [CUSDC_ADDRESS, expiry],
        account: address, chain: sepolia, gas: SET_OPERATOR_GAS,
      });
      await publicClient.waitForTransactionReceipt({ hash: opTx });

      // Step 2: encrypt amount
      setStep('funding');
      const { handle, proof } = await encryptAmount(amount, CUSDC_ADDRESS);

      // Step 3: confidential transfer
      const tx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_CONF_TRANSFER_ABI,
        functionName: 'confidentialTransfer',
        args: [burnerAddress, handle, proof],
        account: address, chain: sepolia, gas: CUSDC_TRANSFER_GAS,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx); setStep('done'); onSuccess?.();
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Transfer failed';
      setErrMsg(msg.includes('user rejected') ? 'Transaction cancelled.' : msg);
      setStep('error');
    }
  }

  const handleFund = () => {
    if (!amount || parseFloat(amount) <= 0 || exceeds) return;
    switch (asset) {
      case 'eth':             return handleFundEth();
      case 'usdc':            return handleFundUsdc();
      case 'cusdc-shield':    return handleShieldToBurner();
      case 'cusdc-transfer':  return handleConfidentialTransfer();
    }
  };

  const busy = ['approving', 'funding'].includes(step);
  const STEP_LABEL = {
    approving: asset === 'cusdc-transfer' ? 'Authorizing operator…' : 'Approving USDC…',
    funding:   asset === 'cusdc-transfer' ? 'Encrypting & transferring…' :
               asset === 'cusdc-shield'   ? 'Shielding to burner…' :
               `Transferring ${getDestLabel()}…`,
  };

  const ASSET_OPTIONS = [
    {
      id: 'cusdc-shield',
      title: 'cUSDC (Shield from USDC)',
      desc: 'Convert USDC to cUSDC directly in burner. Recommended.',
      accent: 'text-sky-400',
    },
    {
      id: 'cusdc-transfer',
      title: 'cUSDC (Direct transfer)',
      desc: 'Send existing cUSDC balance to burner. Uses FHE encryption.',
      accent: 'text-violet-400',
    },
    {
      id: 'eth',
      title: 'Sepolia ETH',
      desc: 'For gas fees when burner signs transactions.',
      accent: 'text-amber-400',
    },
    {
      id: 'usdc',
      title: 'USDC (Plain)',
      desc: 'Rarely needed — payments happen in cUSDC.',
      accent: 'text-emerald-400',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60 sticky top-0 bg-zinc-950 z-10">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-amber-500 uppercase font-mono">// Burner funding</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mt-0.5">Fund Burner Wallet</h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy} className="text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5">
          {step === 'done' ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-emerald-950/60 border border-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="text-sm font-bold text-emerald-400 font-mono uppercase tracking-wider mb-2">Burner funded successfully</p>
              <p className="text-[10px] text-zinc-500 font-mono mb-4">{amount} {getDestLabel()} sent to burner</p>
              {txHash && (
                <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-mono flex items-center justify-center gap-1.5 mb-4">
                  {shortHash(txHash)}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </a>
              )}
              <button onClick={onClose} className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold font-mono uppercase tracking-widest transition-all">Close</button>
            </div>
          ) : (
            <>
              {/* Asset picker */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono mb-2">What to fund</p>
                <div className="space-y-2">
                  {ASSET_OPTIONS.map(opt => (
                    <label key={opt.id}
                      className={`flex items-start gap-3 p-3 border cursor-pointer transition-all ${
                        asset === opt.id
                          ? 'border-amber-500/40 bg-amber-950/20'
                          : 'border-zinc-800/40 bg-zinc-950/40 hover:border-zinc-700/60'
                      }`}>
                      <div className={`w-4 h-4 flex-shrink-0 mt-0.5 border rounded-full flex items-center justify-center transition-all ${
                        asset === opt.id ? 'border-amber-500' : 'border-zinc-700'
                      }`}>
                        {asset === opt.id && <div className="w-2 h-2 rounded-full bg-amber-500"/>}
                      </div>
                      <input type="radio" className="sr-only" checked={asset === opt.id} onChange={() => setAsset(opt.id)}/>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[10px] font-bold font-mono uppercase tracking-wide ${opt.accent}`}>{opt.title}</p>
                        <p className="text-[9px] text-zinc-600 font-mono mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">Available {getSourceLabel()}</span>
                {needsDecryption ? (
                  <span className="text-[10px] font-mono text-amber-400">Decrypt cUSDC first</span>
                ) : srcBalance ? (
                  <button onClick={() => setAmount(maxStr)} disabled={busy}
                    className="text-[10px] font-bold font-mono text-sky-400 hover:text-sky-300 uppercase tracking-wide transition-colors disabled:opacity-40">
                    {asset === 'eth' ? fmtEth(srcBalance) : fmtUsdc(srcBalance)} MAX
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-zinc-600">0</span>
                )}
              </div>

              <div className="relative mb-2">
                <input type="number" min="0" step={asset === 'eth' ? '0.001' : '0.01'} placeholder="0.00"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  disabled={busy || needsDecryption}
                  className="w-full bg-zinc-900 border border-zinc-800 px-4 py-3 pr-16 text-zinc-100 font-mono text-sm placeholder-zinc-700 focus:outline-none focus:border-amber-500/60 disabled:opacity-40 transition-colors"/>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-zinc-500 uppercase">{getSourceLabel()}</span>
              </div>

              {exceeds && <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wide mb-3">Exceeds available balance</p>}

              {/* Destination info */}
              <div className="mb-3 px-3 py-2 bg-zinc-900/40 border border-zinc-800/60">
                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-0.5">Destination</p>
                <p className="text-[10px] font-mono text-zinc-400 break-all">{burnerAddress}</p>
              </div>

              {step === 'error' && errMsg && (
                <div className="mb-3 px-3 py-2 bg-rose-950/40 border border-rose-900/40">
                  <p className="text-[10px] font-mono text-rose-400 break-all">{errMsg}</p>
                </div>
              )}

              {busy && (
                <div className="mb-3 px-3 py-2.5 bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Spinner/>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wide">{STEP_LABEL[step]}</span>
                  </div>
                </div>
              )}

              <button onClick={handleFund}
                disabled={busy || !amount || parseFloat(amount) <= 0 || exceeds || needsDecryption || (asset === 'cusdc-transfer' && !sdkReady)}
                className="w-full py-3 text-[10px] font-bold font-mono uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] bg-amber-500 hover:bg-amber-400 text-zinc-900">
                {busy ? <Spinner label={STEP_LABEL[step]}/> : `Fund burner with ${amount || '0'} ${getDestLabel()}`}
              </button>

              <p className="text-[9px] text-zinc-700 font-mono mt-3 text-center">
                Transactions are irreversible. Verify the burner address before confirming.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shield / Unshield Modal ──────────────────────────────────────────────────
function ShieldModal({ isOpen, onClose, usdcBal, cusdcVal, cusdcHandle, isCusdcDecrypted, onShieldSuccess, onUnshieldSubmitted }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { encryptAmount, sdkReady } = useZamaEncrypt();

  const [tab, setTab] = useState('shield');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('idle');
  const [txHash, setTxHash] = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => { if (!isOpen) { setAmount(''); setStep('idle'); setTxHash(''); setErrMsg(''); } }, [isOpen]);
  useEffect(() => { setAmount(''); setStep('idle'); setTxHash(''); setErrMsg(''); }, [tab]);

  const maxUsdcStr = usdcBal ? formatUnits(usdcBal, USDC_DECIMALS) : '0';
  const maxCusdcStr = (isCusdcDecrypted && cusdcVal !== null && cusdcVal !== undefined)
    ? formatUnits(cusdcVal, USDC_DECIMALS) : null;
  const amtNum = parseFloat(amount) || 0;
  const maxNum = tab === 'shield' ? Number(maxUsdcStr) : (maxCusdcStr !== null ? Number(maxCusdcStr) : Infinity);
  const exceeds = amtNum > maxNum && maxNum !== Infinity;

  async function handleShield() {
    if (!amount || !walletClient || !address) return;
    setErrMsg(''); setStep('approving');
    try {
      const raw = parseUnits(amount, USDC_DECIMALS);
      if (raw <= 0n) throw new Error('Amount must be greater than 0');
      if (usdcBal !== null && raw > usdcBal) throw new Error('Amount exceeds USDC balance');
      const currentAllowance = await publicClient.readContract({
        address: USDC_ADDRESS, abi: USDC_ALLOWANCE_ABI, functionName: 'allowance', args: [address, CUSDC_ADDRESS],
      });
      if (currentAllowance < raw) {
        const approveTx = await walletClient.writeContract({
          address: USDC_ADDRESS, abi: USDC_APPROVE_ABI, functionName: 'approve', args: [CUSDC_ADDRESS, raw], account: address, chain: sepolia,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }
      setStep('shielding');
      const shieldTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_WRAP_ABI, functionName: 'wrap', args: [address, raw], account: address, chain: sepolia, gas: SHIELD_GAS,
      });
      await publicClient.waitForTransactionReceipt({ hash: shieldTx });
      setTxHash(shieldTx); setStep('done'); onShieldSuccess?.();
    } catch (err) {
      console.error('[shield]', err);
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      setErrMsg(msg.includes('user rejected') || msg.includes('User rejected') ? 'Transaction cancelled.' : msg.includes('insufficient') ? 'Insufficient USDC balance.' : msg);
      setStep('error');
    }
  }

  async function handleUnshield() {
    if (!amount || !walletClient || !address) return;
    if (!cusdcHandle) { setErrMsg('No cUSDC balance found.'); return; }
    setErrMsg('');
    try {
      const raw = parseUnits(amount, USDC_DECIMALS);
      if (raw <= 0n) throw new Error('Amount must be greater than 0');
      if (isCusdcDecrypted && cusdcVal !== null && raw > BigInt(cusdcVal)) throw new Error('Amount exceeds your cUSDC balance');

      // Step 1: setOperator — grant cUSDC contract ACL access
      setStep('authorizing');
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const opTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_SET_OPERATOR_ABI, functionName: 'setOperator',
        args: [CUSDC_ADDRESS, expiry], account: address, chain: sepolia, gas: SET_OPERATOR_GAS,
      });
      await publicClient.waitForTransactionReceipt({ hash: opTx });
      console.log('[unshield] setOperator confirmed:', opTx);

      // Step 2: Encrypt amount
      setStep('encrypting');
      const { handle: encHandle, proof: encProof } = await encryptAmount(amount, CUSDC_ADDRESS);
      console.log('[unshield] encHandle:', encHandle);

      // Snapshot USDC balance
      let baseUsdcAmount = 0n;
      try {
        baseUsdcAmount = await getReadClient().readContract({
          address: USDC_ADDRESS, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [address],
        });
      } catch {}

      // Step 3: Submit unwrap
      setStep('unshielding');
      const unwrapTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_UNWRAP_ENCRYPTED_ABI, functionName: 'unwrap',
        args: [address, address, encHandle, encProof], account: address, chain: sepolia, gas: UNSHIELD_GAS,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: unwrapTx });
      console.log('[unshield] unwrap receipt status:', receipt.status);
      if (receipt.status === 'reverted') throw new Error('Unwrap transaction reverted on-chain.');

      setTxHash(unwrapTx); setStep('done');
      onUnshieldSubmitted?.({ txHash: unwrapTx, amount, timestamp: Date.now(), baseUsdc: { address, amount: baseUsdcAmount } });
    } catch (err) {
      console.error('[unshield]', err);
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      setErrMsg(
        msg.includes('user rejected') || msg.includes('User rejected') ? 'Transaction cancelled.' :
        msg.includes('insufficient') || msg.includes('ZeroBalance') ? 'Insufficient cUSDC balance.' :
        msg.includes('reverted') ? 'Transaction reverted. Check Etherscan for details.' : msg
      );
      setStep('error');
    }
  }

  const busy = ['approving', 'shielding', 'authorizing', 'encrypting', 'unshielding'].includes(step);
  const STEP_LABEL = {
    approving: 'Approving USDC spend…', shielding: 'Shielding to cUSDC…',
    authorizing: 'Authorizing cUSDC contract…', encrypting: 'Encrypting amount with FHE…', unshielding: 'Submitting unwrap request…',
  };
  const canUnshield = !!cusdcHandle && sdkReady;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-md mx-4 bg-zinc-950 border border-zinc-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono">// Token Management</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mt-0.5">Shield · Unshield</h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy} className="text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex border-b border-zinc-800/60">
          {[{ key: 'shield', label: 'Shield USDC → cUSDC' }, { key: 'unshield', label: 'Unshield cUSDC → USDC' }].map(t => (
            <button key={t.key} onClick={() => !busy && setTab(t.key)} disabled={busy}
              className={`flex-1 px-4 py-3 text-[10px] font-bold font-mono uppercase tracking-widest transition-all border-b-2 ${tab === t.key ? 'border-sky-500 text-sky-400 bg-sky-950/20' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-emerald-950/60 border border-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-sm font-bold text-emerald-400 font-mono uppercase tracking-wider mb-2">
                {tab === 'shield' ? 'Shielded successfully' : 'Unshield request submitted'}
              </p>
              {tab === 'unshield' && (
                <div className="mt-2 mb-4 px-3 py-2.5 bg-sky-950/30 border border-sky-900/40 text-left">
                  <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
                    Your request is on-chain. A banner on the dashboard will track when your USDC arrives — even if you reload. The coprocessor typically finalizes in <span className="font-bold">5–30 minutes</span> on Sepolia.
                  </p>
                </div>
              )}
              {txHash && (
                <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-mono flex items-center justify-center gap-1.5 mt-1 mb-4">
                  {shortHash(txHash)}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
              <button onClick={() => { setStep('idle'); setAmount(''); onClose(); }}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold font-mono uppercase tracking-widest transition-all">Close</button>
            </div>
          )}

          {step !== 'done' && (
            <>
              {tab === 'shield' && (
                <>
                  <div className="mb-4 px-3 py-2.5 border text-[10px] font-mono leading-relaxed bg-sky-950/30 border-sky-900/40 text-sky-400/80">
                    USDC will be locked in the cUSDC contract. Your balance becomes an encrypted FHE handle — the amount is hidden on-chain.
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">Available USDC</span>
                    <button onClick={() => setAmount(maxUsdcStr)} disabled={!usdcBal || usdcBal === 0n}
                      className="text-[10px] font-bold font-mono text-sky-400 hover:text-sky-300 uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {fmtUsdc(usdcBal)} MAX
                    </button>
                  </div>
                  <div className="relative mb-2">
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}
                      className="w-full bg-zinc-900 border border-zinc-700 px-4 py-3 pr-16 text-zinc-100 font-mono text-sm placeholder-zinc-700 focus:outline-none focus:border-sky-500/60 disabled:opacity-40 transition-colors" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-zinc-500 uppercase">USDC</span>
                  </div>
                  {exceeds ? <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wide mb-4">Exceeds available balance</p> : <div className="mb-4" />}
                  {step === 'error' && errMsg && <div className="mb-4 px-3 py-2 bg-rose-950/40 border border-rose-900/40"><p className="text-[10px] font-mono text-rose-400 break-all">{errMsg}</p></div>}
                  {busy && (
                    <div className="mb-4 px-3 py-2.5 bg-zinc-900/60 border border-zinc-800">
                      <div className="flex items-center gap-2 mb-2.5"><Spinner /><span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wide">{STEP_LABEL[step]}</span></div>
                      <div className="flex gap-6">
                        {[{ label: '1. Approve', done: step === 'shielding' }, { label: '2. Wrap', done: false }].map(s => (
                          <div key={s.label} className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 ${s.done ? 'bg-emerald-400' : 'bg-zinc-600 animate-pulse'}`} />
                            <span className={`text-[9px] font-mono uppercase tracking-wide ${s.done ? 'text-emerald-400' : 'text-zinc-600'}`}>{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={handleShield} disabled={busy || !amount || parseFloat(amount) <= 0 || exceeds}
                    className="w-full py-3 text-[10px] font-bold font-mono uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] bg-sky-500 hover:bg-sky-400 text-white">
                    {busy ? <Spinner label={STEP_LABEL[step]} /> : `Shield ${amount || '0'} USDC → cUSDC`}
                  </button>
                </>
              )}

              {tab === 'unshield' && (
                <>
                  <div className="mb-4 px-3 py-2.5 border text-[10px] font-mono leading-relaxed bg-amber-950/30 border-amber-900/40 text-amber-400/80">
                    Enter the amount. The cUSDC contract will be authorized, your amount FHE-encrypted, then the coprocessor releases USDC automatically (5–30 min on testnet).
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">Available cUSDC</span>
                    {isCusdcDecrypted && cusdcVal !== null ? (
                      <button onClick={() => setAmount(maxCusdcStr)}
                        className="text-[10px] font-bold font-mono text-sky-400 hover:text-sky-300 uppercase tracking-wide transition-colors">
                        {fmtUsdc(cusdcVal)} MAX
                      </button>
                    ) : cusdcHandle ? (
                      <span className="text-[10px] font-mono text-sky-300 italic tracking-wider">●●●●●● encrypted</span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-600">$0.00</span>
                    )}
                  </div>
                  {!cusdcHandle && <div className="mb-4 px-3 py-2.5 bg-amber-950/30 border border-amber-900/40 text-[10px] text-amber-300 font-mono">⚠ No cUSDC balance found. Shield some USDC first.</div>}
                  {cusdcHandle && !sdkReady && <div className="mb-4 px-3 py-2.5 bg-zinc-900/60 border border-zinc-800 text-[10px] text-zinc-500 font-mono">Initialising FHE SDK…</div>}
                  <div className="relative mb-2">
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy || !cusdcHandle}
                      className="w-full bg-zinc-900 border border-zinc-700 px-4 py-3 pr-16 text-zinc-100 font-mono text-sm placeholder-zinc-700 focus:outline-none focus:border-amber-500/60 disabled:opacity-40 transition-colors" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-zinc-500 uppercase">cUSDC</span>
                  </div>
                  {exceeds ? <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wide mb-4">Exceeds decrypted cUSDC balance</p> : <div className="mb-4" />}
                  {step === 'error' && errMsg && <div className="mb-4 px-3 py-2 bg-rose-950/40 border border-rose-900/40"><p className="text-[10px] font-mono text-rose-400 break-all">{errMsg}</p></div>}
                  {busy && (
                    <div className="mb-4 px-3 py-2.5 bg-zinc-900/60 border border-zinc-800">
                      <div className="flex items-center gap-2 mb-2.5"><Spinner /><span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wide">{STEP_LABEL[step]}</span></div>
                      <div className="flex gap-3 flex-wrap">
                        {[
                          { label: '1. Authorize', done: ['encrypting', 'unshielding', 'done'].includes(step) },
                          { label: '2. Encrypt', done: ['unshielding', 'done'].includes(step) },
                          { label: '3. Unwrap', done: step === 'done' },
                          { label: '4. Finalize', done: false },
                        ].map(s => (
                          <div key={s.label} className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 ${s.done ? 'bg-emerald-400' : 'bg-zinc-600 animate-pulse'}`} />
                            <span className={`text-[9px] font-mono uppercase tracking-wide ${s.done ? 'text-emerald-400' : 'text-zinc-600'}`}>{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={handleUnshield} disabled={busy || !canUnshield || !amount || parseFloat(amount) <= 0 || exceeds}
                    className="w-full py-3 text-[10px] font-bold font-mono uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] bg-amber-500 hover:bg-amber-400 text-zinc-900">
                    {busy ? <Spinner label={STEP_LABEL[step]} /> : `Unshield ${amount || '0'} cUSDC → USDC`}
                  </button>
                  <div className="mt-3 px-3 py-2.5 bg-zinc-900/40 border border-zinc-800/60">
                    <p className="text-[9px] font-mono text-zinc-600 leading-relaxed">
                      <span className="text-zinc-500 font-bold">4-step flow: </span>
                      Authorize → Encrypt → <span className="text-sky-400">unwrap()</span> →
                      Zama coprocessor calls <span className="text-sky-400">finalizeUnwrap()</span> automatically.
                    </p>
                  </div>
                </>
              )}
              <p className="text-[9px] text-zinc-700 font-mono mt-3 text-center">Transactions are irreversible. Verify before confirming.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SWEEP ALL MODAL
// ═══════════════════════════════════════════════════════════════════════════

function SweepAllModal({ isOpen, onClose, burnerAddress, ethBal, usdcBal, cusdcBal, cusdcHandle, onSweep }) {
  const [confirmed, setConfirmed] = useState(false);
  const [password,  setPassword]  = useState('');
  const [busy,      setBusy]      = useState(false);
  const [progress,  setProgress]  = useState({ cusdc: 'idle', usdc: 'idle', eth: 'idle' });
  const [txHashes,  setTxHashes]  = useState({});
  const [err,       setErr]       = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfirmed(false); setPassword(''); setBusy(false);
      setProgress({ cusdc: 'idle', usdc: 'idle', eth: 'idle' });
      setTxHashes({}); setErr('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasEth   = ethBal   && ethBal   > 0n;
  const hasUsdc  = usdcBal  && usdcBal  > 0n;
  const hasCusdc = cusdcHandle !== null;
  const nothingToSweep = !hasEth && !hasUsdc && !hasCusdc;

  const handleSweep = async () => {
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    setErr(''); setBusy(true);
    try {
      // Sweep is delegated to parent hook — passes back progress updates
      await onSweep(password, {
        onCusdcStart:  () => setProgress(p => ({ ...p, cusdc: 'active' })),
        onCusdcDone:   (hash) => { setTxHashes(t => ({ ...t, cusdc: hash })); setProgress(p => ({ ...p, cusdc: 'done' })); },
        onCusdcSkip:   () => setProgress(p => ({ ...p, cusdc: 'skipped' })),
        onUsdcStart:   () => setProgress(p => ({ ...p, usdc: 'active' })),
        onUsdcDone:    (hash) => { setTxHashes(t => ({ ...t, usdc: hash })); setProgress(p => ({ ...p, usdc: 'done' })); },
        onUsdcSkip:    () => setProgress(p => ({ ...p, usdc: 'skipped' })),
        onEthStart:    () => setProgress(p => ({ ...p, eth: 'active' })),
        onEthDone:     (hash) => { setTxHashes(t => ({ ...t, eth: hash })); setProgress(p => ({ ...p, eth: 'done' })); },
        onEthSkip:     () => setProgress(p => ({ ...p, eth: 'skipped' })),
      });
    } catch (e) {
      setErr(e.message || 'Sweep failed');
    } finally {
      setBusy(false);
    }
  };

  const allDone = ['done', 'skipped'].includes(progress.cusdc) &&
                  ['done', 'skipped'].includes(progress.usdc) &&
                  ['done', 'skipped'].includes(progress.eth) &&
                  (progress.cusdc === 'done' || progress.usdc === 'done' || progress.eth === 'done');

  const stepRow = (key, label, balDisplay, hasBalance) => {
    const status = progress[key];
    const cfg = {
      idle:    { icon: '○', color: 'text-zinc-600',    label: 'Waiting'  },
      active:  { icon: '◐', color: 'text-sky-400 animate-pulse', label: 'In progress' },
      done:    { icon: '✓', color: 'text-emerald-400', label: 'Done' },
      skipped: { icon: '—', color: 'text-zinc-600',    label: 'Skipped (zero balance)' },
    }[status];

    return (
      <div className="flex items-center gap-3 px-3 py-2.5 bg-zinc-950/40 border border-zinc-800/60">
        <span className={`text-sm font-mono ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-widest">{label}</p>
          <p className="text-[9px] font-mono text-zinc-600">
            {hasBalance ? balDisplay : '0 (nothing to sweep)'}
          </p>
        </div>
        <span className={`text-[9px] font-mono uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
        {txHashes[key] && (
          <a href={`https://sepolia.etherscan.io/tx/${txHashes[key]}`} target="_blank" rel="noreferrer"
            className="text-[9px] text-sky-400 hover:text-sky-300 font-mono">Tx ↗</a>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => !busy && onClose()}/>
      <div className="relative w-full max-w-lg mx-4 bg-zinc-950 border border-zinc-800 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60 sticky top-0 bg-zinc-950 z-10">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono">// Sweep</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mt-0.5">Sweep All to Main Wallet</h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {allDone ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-emerald-950/60 border border-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="text-sm font-bold text-emerald-400 font-mono uppercase tracking-wider mb-4">Sweep complete</p>
              <div className="space-y-2 mb-4">
                {stepRow('cusdc', 'cUSDC', hasCusdc ? '[encrypted]' : '0', hasCusdc)}
                {stepRow('usdc',  'USDC',  fmtUsdc(usdcBal),               hasUsdc)}
                {stepRow('eth',   'ETH',   fmtEth(ethBal),                 hasEth)}
              </div>
              <button onClick={onClose} className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold font-mono uppercase tracking-widest">Close</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-400 font-sans normal-case leading-relaxed">
                This will transfer all funds from your burner wallet back to your main wallet
                in three sequential transactions. cUSDC is swept first (needs gas), then USDC,
                then ETH last (using whatever is left after fees).
              </p>

              {nothingToSweep && (
                <div className="px-3 py-2.5 bg-amber-950/30 border border-amber-900/40">
                  <p className="text-[10px] font-mono text-amber-400">Nothing to sweep — burner has zero balances.</p>
                </div>
              )}

              <div className="space-y-2">
                {stepRow('cusdc', 'cUSDC', hasCusdc ? '[encrypted balance]' : '0', hasCusdc)}
                {stepRow('usdc',  'USDC',  fmtUsdc(usdcBal),                       hasUsdc)}
                {stepRow('eth',   'ETH',   fmtEth(ethBal),                         hasEth)}
              </div>

              {!busy && !nothingToSweep && (
                <>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 flex-shrink-0 mt-0.5 border flex items-center justify-center transition-all ${
                      confirmed ? 'bg-sky-500 border-sky-400' : 'bg-zinc-950 border-zinc-700 group-hover:border-zinc-500'
                    }`}>
                      {confirmed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    <input type="checkbox" className="sr-only" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
                    <span className="text-[10px] font-mono text-zinc-400 leading-relaxed">
                      I understand ETH will be swept last using whatever is left after gas fees, and small dust amounts may remain.
                    </span>
                  </label>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                      Burner wallet password
                    </label>
                    <input type="password" placeholder="Min 8 characters"
                      value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
                      className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-sans focus:outline-none focus:border-sky-500/60"/>
                  </div>
                </>
              )}

              {err && (
                <div className="px-3 py-2 bg-rose-950/40 border border-rose-900/40">
                  <p className="text-[10px] font-mono text-rose-400 break-all">{err}</p>
                </div>
              )}

              <button onClick={handleSweep}
                disabled={busy || nothingToSweep || !confirmed || password.length < 8}
                className="w-full py-3 text-[10px] font-bold font-mono uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] bg-sky-500 hover:bg-sky-400 text-white">
                {busy ? <Spinner label="Sweeping…"/> : 'Sign & sweep all'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT REPORT MODAL
// ═══════════════════════════════════════════════════════════════════════════

const AUDIT_PREFS_KEY = 'zeroremit_audit_prefs';

function loadAuditPrefs() {
  try {
    const raw = localStorage.getItem(AUDIT_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAuditPrefs(prefs) {
  try { localStorage.setItem(AUDIT_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function AuditReportModal({ isOpen, onClose, onGenerate }) {
  const saved = loadAuditPrefs();

  const [filename,    setFilename]    = useState('');
  const [perspective, setPerspective] = useState(saved?.perspective || 'both');
  const [sections,    setSections]    = useState(saved?.sections || {
    mainAddress:      true,
    burnerAddress:    true,
    invoiceMemos:     true,
    invoiceLineItems: true,
    balanceSnapshot:  true,
    incomingReceipts: true,
    outgoingReceipts: true,
    invoiceAppendices:true,
  });
  const [savePref, setSavePref] = useState(!!saved);

  useEffect(() => { if (!isOpen) { setFilename(''); } }, [isOpen]);

  if (!isOpen) return null;

  const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));

  const handleGenerate = () => {
    if (savePref) saveAuditPrefs({ perspective, sections });
    else localStorage.removeItem(AUDIT_PREFS_KEY);
    onGenerate({ filename: filename.trim() || undefined, perspective, sections });
  };

  const SECTION_LIST = [
    { key: 'mainAddress',       label: 'Main Address'       },
    { key: 'burnerAddress',     label: 'Burner Address'     },
    { key: 'invoiceMemos',      label: 'Invoice Memos'      },
    { key: 'invoiceLineItems',  label: 'Invoice Line Items' },
    { key: 'balanceSnapshot',   label: 'Balance Snapshot'   },
    { key: 'incomingReceipts',  label: 'Incoming Receipts'  },
    { key: 'outgoingReceipts',  label: 'Outgoing Receipts'  },
    { key: 'invoiceAppendices', label: 'Invoice Appendices' },
  ];

  const PERSPECTIVES = [
    { id: 'merchant', title: 'Merchant', desc: 'Earnings review' },
    { id: 'payer',    title: 'Payer',    desc: 'Outgoing receipts' },
    { id: 'both',     title: 'Both',     desc: 'Full evidence' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60 sticky top-0 bg-zinc-950 z-10">
          <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Audit</p>
          <h2 className="text-base font-bold text-zinc-100 font-mono">Configure Audit Report</h2>
          <p className="text-xs text-zinc-500 font-sans normal-case mt-1">
            Customize the fields and details you want to include in the exported audit bundle.
          </p>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Filename */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              Custom filename (optional)
            </label>
            <input type="text" placeholder="Zeroremit_Audit_Report_..."
              value={filename} onChange={e => setFilename(e.target.value)}
              className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-sky-500/60 transition-colors"/>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Perspective */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Audit perspective
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PERSPECTIVES.map(p => (
                  <button key={p.id} onClick={() => setPerspective(p.id)}
                    className={`p-3 text-left border transition-all ${
                      perspective === p.id
                        ? 'border-sky-500/50 bg-sky-950/30'
                        : 'border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700'
                    }`}>
                    <p className={`text-[11px] font-bold font-mono uppercase tracking-wide ${perspective === p.id ? 'text-sky-400' : 'text-zinc-300'}`}>
                      {p.title}
                    </p>
                    <p className="text-[9px] font-mono text-zinc-600 mt-1">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Include sections */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Include sections
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {SECTION_LIST.map(s => (
                  <label key={s.key}
                    className="flex items-center justify-between px-3 py-2 bg-zinc-950/40 border border-zinc-800/60 cursor-pointer hover:border-zinc-700 transition-colors">
                    <span className="text-[11px] font-mono text-zinc-300">{s.label}</span>
                    <button type="button" onClick={() => toggleSection(s.key)}
                      className={`relative inline-flex h-5 w-9 items-center transition-colors ${sections[s.key] ? 'bg-sky-500' : 'bg-zinc-700'}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform bg-white transition-transform ${sections[s.key] ? 'translate-x-5' : 'translate-x-1'}`}/>
                    </button>
                    <input type="checkbox" className="sr-only" checked={sections[s.key]} onChange={() => toggleSection(s.key)}/>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Save prefs + actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-zinc-800/40">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-4 h-4 border flex items-center justify-center transition-all ${
                savePref ? 'bg-sky-500 border-sky-400' : 'bg-zinc-950 border-zinc-700'
              }`}>
                {savePref && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
              </div>
              <input type="checkbox" className="sr-only" checked={savePref} onChange={e => setSavePref(e.target.checked)}/>
              <span className="text-[10px] font-mono text-zinc-500">Save preferences for next time</span>
            </label>

            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={onClose}
                className="flex-1 sm:flex-initial px-5 h-10 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all">
                Cancel
              </button>
              <button onClick={handleGenerate}
                className="flex-1 sm:flex-initial px-5 h-10 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all">
                Generate Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// BURNER-STYLED NUMBER (amber accent, same font throughout)
// ═══════════════════════════════════════════════════════════════════════════

function BurnerNum({ value, unit }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-bold text-amber-500 tabular-nums font-mono">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70 font-mono">{unit}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BURNER WALLET CARD — Statistics row 1, card 2
// Title: orange · Amounts: white · Labels: ash/green/purple
// ═══════════════════════════════════════════════════════════════════════════

function BurnerBalanceCard({
  burner,
  ethBal, usdcBal, cusdcVal, cusdcHandle, isCusdcDecrypted,
  onFund, onDecryptBurnerCusdc, decryptingBurner, decryptStatus, sdkReady,
}) {
  if (!burner) {
    return (
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-amber-500/20 transition-all duration-300 flex flex-col">
        <div className="text-[10px] font-bold uppercase tracking-widest font-mono mb-4 text-amber-500">
          Burner Wallet
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-zinc-500 font-sans normal-case mb-2">No burner wallet</p>
          <p className="text-[10px] text-zinc-600 font-mono">Create one in the Automation tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-amber-500/20 transition-all duration-300 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest font-mono text-amber-500">
          Burner Wallet
        </div>
        <span className={`inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 border uppercase tracking-wide ${
          burner.automationEnabled
            ? 'bg-amber-950/60 text-amber-500 border-amber-900/40'
            : 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40'
        }`}>
          <span className={`w-1 h-1 ${burner.automationEnabled ? 'bg-amber-500 animate-pulse' : 'bg-zinc-600'}`}/>
          {burner.automationEnabled ? 'Live' : 'Off'}
        </span>
      </div>

      {/* ETH */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
          {ethBal !== null ? Number(formatEther(ethBal)).toFixed(4) : '—'}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-mono">ETH</span>
      </div>

      {/* USDC */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
          {usdcBal !== null ? fmtUsdc(usdcBal) : '—'}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 font-mono">USDC</span>
      </div>

      {/* cUSDC */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2">
          {isCusdcDecrypted && cusdcVal !== null ? (
            <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
              {fmtUsdc(cusdcVal)}
            </span>
          ) : cusdcHandle ? (
            <span className="text-lg font-bold text-zinc-500 tabular-nums font-mono tracking-wider">••••••</span>
          ) : (
            <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">0.00</span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400 font-mono">cUSDC</span>
        </div>
        {cusdcHandle && !isCusdcDecrypted && (
          <div className="mt-1">
            <SmallDecryptButton
              onClick={onDecryptBurnerCusdc}
              decrypting={decryptingBurner}
              sdkReady={sdkReady}
              hasHandle={!!cusdcHandle}
              decryptStatus={decryptStatus}
              accent="amber"
            />
          </div>
        )}
      </div>

      {/* Fund Burner button (orange) */}
      <button onClick={onFund}
        className="mt-auto w-full h-9 bg-amber-500 hover:bg-amber-400 text-zinc-900 text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-[0.98] shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
        </svg>
        Fund Burner
      </button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// DUAL DONUT CARD — shows main + burner side by side
// Falls back to single donut when no burner exists
// ═══════════════════════════════════════════════════════════════════════════

function MiniDonut({ segments, label, sizeMult = 1, labelClass = `text-zinc-500` }) {
  const R = 50 * sizeMult; const CX = 65 * sizeMult; const CY = 65 * sizeMult; const STROKE = 16 * sizeMult;
  const r = R - STROKE / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const arcs = useMemo(() => {
    if (total === 0) return [];
    let cum = -Math.PI / 2;
    return segments.map(seg => {
      const frac = seg.value / total; const start = cum; const end = cum + frac * 2 * Math.PI; cum = end;
      const x1 = CX + r * Math.cos(start); const y1 = CY + r * Math.sin(start);
      const x2 = CX + r * Math.cos(end); const y2 = CY + r * Math.sin(end);
      const large = frac > 0.5 ? 1 : 0;
      return {
        ...seg,
        path: total === 1 || frac >= 0.999
          ? `M ${CX} ${CY - r} A ${r} ${r} 0 1 1 ${CX - 0.001} ${CY - r} Z`
          : `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
      };
    });
  }, [segments, total]);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={CX * 2} height={CY * 2 - 4} viewBox={`0 0 ${CX * 2} ${CY * 2}`}>
        {total === 0
          ? <circle cx={CX} cy={CY} r={r} fill="none" stroke="#27272a" strokeWidth={STROKE} />
          : arcs.map(arc => (
              <path key={arc.label} d={arc.path} fill="none" stroke={arc.color}
                strokeWidth={STROKE} strokeLinecap="butt" opacity="0.9" />
            ))
        }
        <text x={CX} y={CY - 2} textAnchor="middle" fill="#f4f4f5" fontSize={14 * sizeMult} fontFamily="monospace" fontWeight="700">
          {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toFixed(total < 10 ? 2 : 0)}
        </text>
        <text x={CX} y={CY + 12 * sizeMult} textAnchor="middle" fill="#52525b" fontSize={8 * sizeMult} fontFamily="monospace" fontWeight="600">
          TOTAL
        </text>
      </svg>
      <p className="text-[9px] font-bold font-mono uppercase tracking-widest ${labelClass}">{label}</p>
    </div>
  );
}

function DualDonutCard({ title, subtitle, mainSegments, burnerSegments, hasBurner, note, valueFormatter }) {
  const fmt = valueFormatter || (v => v.toString());
  const combinedLegend = hasBurner
    ? mainSegments.map((m, i) => ({
        label: m.label,
        color: m.color,
        mainVal:   fmt(m.value),
        burnerVal: fmt(burnerSegments[i]?.value ?? 0),
      }))
    : mainSegments.map(m => ({ label: m.label, color: m.color, mainVal: fmt(m.value) }));

  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-sky-500/20 transition-all duration-300">
      <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-0.5">{subtitle}</p>
      <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono mb-5">{title}</h4>

      {/* Donuts row */}
      <div className={`flex items-center justify-around gap-4 mb-5 ${hasBurner ? '' : 'justify-center'}`}>
        <MiniDonut segments={mainSegments} label="Main Wallet" labelClass="text-zinc-500" />
        {hasBurner && (
          <MiniDonut
            segments={burnerSegments}
            label="Burner Wallet"
            labelClass="text-amber-500"
          />
        )}

      </div>

      {/* Legend + values below */}
      <div className="space-y-2 pt-4 border-t border-zinc-800/40">
        {combinedLegend.map(item => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 flex-shrink-0" style={{ background: item.color }}/>
              <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 truncate">{item.label}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-[10px] font-bold font-mono text-zinc-200 tabular-nums">{item.mainVal}</span>
              {hasBurner && (
                <span className="text-[10px] font-bold font-mono text-amber-500 tabular-nums">{item.burnerVal}</span>
              )}
            </div>
          </div>
        ))}
        {hasBurner && (
          <div className="flex items-center justify-end gap-3 pt-2 mt-2 border-t border-zinc-800/40">
            <span className="text-[9px] font-mono uppercase text-zinc-600 tracking-widest">Main / Burner</span>
          </div>
        )}
      </div>

      {note && <p className="text-[9px] text-zinc-700 font-mono mt-3 leading-relaxed">{note}</p>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION TAB (streamlined — no balance display)
// ═══════════════════════════════════════════════════════════════════════════

function AutomationTab({ address, isConnected, burnerState, burnerBalances }) {
  const { burner, loading, error, create, importKey, disableAutomation,
          enableAutomation, remove, sweepAll, clearError } = burnerState;

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [backup,     setBackup]     = useState(null);
  const [showEnable, setShowEnable] = useState(false);
  const [showSweep,  setShowSweep]  = useState(false);

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-16 text-center">
        <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-mono mb-2">
          Connect your wallet to manage automation
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans normal-case">
          Burner wallets let Telegram and Zapier create invoices on your behalf without
          you signing every time.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-16 text-center">
        <Spinner label="Loading automation status…" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-950/40 border border-rose-900/30">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span className="text-[10px] font-mono text-rose-400 flex-1">{error}</span>
          <button onClick={clearError} className="text-rose-400/60 hover:text-rose-300 text-sm">×</button>
        </div>
      )}

      {!burner ? (
        // ═══════ NO BURNER: discovery + creation ═══════
        <>
          <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Automation</p>
            <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono mb-3">
              Burner Wallet
            </h3>
            <p className="text-xs text-zinc-500 font-sans normal-case leading-relaxed mb-6">
              A burner wallet lets your Telegram bot and Zapier integrations create invoices
              for you automatically — no MetaMask popup every time. The private key is
              encrypted with a password you choose; we never see the plaintext.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { n: '01', title: 'Set password', desc: 'Encrypts the key in your browser' },
                { n: '02', title: 'Backup key',   desc: 'Shown once — save it somewhere safe' },
                { n: '03', title: 'Automation live', desc: 'Server signs with capped limits' },
              ].map(s => (
                <div key={s.n} className="bg-zinc-950/40 border border-zinc-800/40 p-4">
                  <div className="text-2xl font-bold text-zinc-800 tabular-nums font-mono mb-2">{s.n}</div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-200 font-mono mb-1">{s.title}</p>
                  <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={() => setShowCreate(true)}
                className="h-11 flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                Create new burner
              </button>
              <button onClick={() => setShowImport(true)}
                className="h-11 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Import existing key
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
            <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <div>
              <p className="text-[10px] font-bold text-sky-400 font-mono uppercase tracking-widest mb-1">
                Safe by default
              </p>
              <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                Every API key you generate later comes with per-invoice and daily USDC caps
                ($500 / $2,000 by default). You can revoke any key or delete the burner
                entirely at any time.
              </p>
            </div>
          </div>
        </>
      ) : (
        // ═══════ BURNER EXISTS: streamlined management ═══════
        <>
          <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Automation</p>
                <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono">Burner Wallet</h3>
                <p className="text-[10px] text-zinc-600 font-mono mt-1">
                  Created {new Date(burner.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest ${
                burner.automationEnabled
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/40'
                  : 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40'
              }`}>
                <span className={`w-1.5 h-1.5 ${burner.automationEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}/>
                {burner.automationEnabled ? 'Automation on' : 'Automation off'}
              </span>
            </div>

            {/* Address only (no balance) */}
            <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono mb-1">
                Burner address
              </p>
              <p className="text-xs font-mono text-zinc-300 break-all">{burner.burnerAddress}</p>
              <p className="text-[9px] font-mono text-zinc-600 mt-2">
                Balances shown in the <strong className="text-amber-500">Statistics tab</strong>.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowSweep(true)}
                className="flex items-center gap-1.5 h-9 px-4 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-[0.98] shadow-md shadow-sky-500/20">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                </svg>
                Sweep all
              </button>

              {burner.automationEnabled ? (
                <button
                  onClick={async () => {
                    if (!confirm('Disable automation? Server-side signing will stop until you re-enable it.')) return;
                    await disableAutomation();
                  }}
                  className="flex items-center gap-1.5 h-9 px-4 bg-zinc-900 hover:bg-amber-950/40 hover:text-amber-400 text-zinc-500 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all">
                  Disable automation
                </button>
              ) : (
                <button onClick={() => setShowEnable(true)}
                  className="flex items-center gap-1.5 h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all">
                  Enable automation
                </button>
              )}

              <button
                onClick={async () => {
                  if (!confirm('Remove burner? This deletes both encrypted keys and revokes all API keys. Make sure you have your private key backup.')) return;
                  await remove();
                }}
                className="ml-auto flex items-center gap-1.5 h-9 px-4 bg-zinc-900 hover:bg-rose-950/40 hover:text-rose-400 text-zinc-500 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all">
                Remove burner
              </button>
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
            <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <div>
              <p className="text-[10px] font-bold text-sky-400 font-mono uppercase tracking-widest mb-1">
                Dual-key encryption
              </p>
              <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                Your key is encrypted with your password (client-side) AND with a server
                wrapping key (for automation). Disabling automation deletes the server
                copy — you can still recover manually with your password.
              </p>
            </div>
          </div>

          {/* API Keys section — reuse existing component */}
          <ApiKeysSection address={address} />
        </>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <BurnerCreateModal
          mode="create"
          onSubmit={async ({ password }) => {
            const result = await create(password);
            setShowCreate(false);
            setBackup(result);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showImport && (
        <BurnerCreateModal
          mode="import"
          onSubmit={async ({ password, privateKey }) => {
            await importKey(privateKey, password);
            setShowImport(false);
          }}
          onClose={() => setShowImport(false)}
        />
      )}
      {backup && (
        <BurnerBackupModal
          privateKey={backup.privateKey}
          burnerAddress={backup.burnerAddress}
          onConfirm={() => setBackup(null)}
        />
      )}
      {showEnable && (
        <BurnerPasswordPrompt
          title="Enable automation"
          description="Enter your burner wallet password so we can re-encrypt the key for the server."
          onSubmit={async (password) => {
            await enableAutomation(password);
            setShowEnable(false);
          }}
          onClose={() => setShowEnable(false)}
        />
      )}

      {/* Sweep All Modal */}
      <SweepAllModal
        isOpen={showSweep}
        onClose={() => setShowSweep(false)}
        burnerAddress={burner?.burnerAddress}
        ethBal={burnerBalances?.eth}
        usdcBal={burnerBalances?.usdc}
        cusdcBal={burnerBalances?.cusdcVal}
        cusdcHandle={burnerBalances?.cusdcHandle}
        onSweep={sweepAll}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEYS SECTION
// ═══════════════════════════════════════════════════════════════════════════

function ApiKeysSection({ address }) {
  const [keys,       setKeys]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newKey,     setNewKey]     = useState(null);   // { id, key, label, ... }

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError('');
    try {
      const list = await apiListApiKeys(address);
      setKeys(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRevoke = async (id, label) => {
    if (!confirm(`Revoke key "${label || id}"? Automations using it will stop working immediately.`)) return;
    try {
      await apiRevokeApiKey(address, id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const activeCount = keys.filter(k => !k.revokedAt).length;

  return (
    <>
      <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Integrations</p>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
              API Keys
            </h3>
            <p className="text-[10px] text-zinc-600 font-mono mt-1">
              For Zapier, Telegram bot, and custom scripts
            </p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-9 px-4 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-[0.98] shadow-md shadow-sky-500/20">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Generate key
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
            <Spinner label="Loading keys…" />
          </div>
        ) : keys.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
            </div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
              No API keys yet
            </p>
            <p className="text-[10px] font-mono text-zinc-600">
              Generate one to enable Telegram bot or Zapier automation
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map(k => <ApiKeyRow key={k.id} apiKey={k} onRevoke={handleRevoke} />)}
          </div>
        )}

        {activeCount > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800/40 flex items-center justify-between">
            <p className="text-[10px] font-mono text-zinc-600">
              {activeCount} active key{activeCount !== 1 ? 's' : ''}
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

      {/* Usage docs snippet */}
      <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
        <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <p className="text-[10px] font-bold text-sky-400 font-mono uppercase tracking-widest mb-1">
            How to use
          </p>
          <p className="text-[10px] text-zinc-500 leading-relaxed font-mono mb-2">
            Send a POST request to <code className="text-zinc-300">/api/public/invoices</code> with
            your API key in the Authorization header:
          </p>
          <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/60 border border-zinc-800 p-3 overflow-x-auto leading-relaxed">
{`curl -X POST https://your-api.com/api/public/invoices \\
  -H "Authorization: Bearer zr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipient": "0x...",
    "amount": "25.00",
    "title": "Invoice from Zapier"
  }'`}
          </pre>
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <ApiKeyCreateModal
          onSubmit={async (data) => {
            const created = await apiCreateApiKey({ wallet: address, ...data });
            setShowCreate(false);
            setNewKey(created);
            await refresh();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {newKey && (
        <ApiKeyRevealModal
          keyData={newKey}
          onClose={() => setNewKey(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY ROW
// ═══════════════════════════════════════════════════════════════════════════

function ApiKeyRow({ apiKey, onRevoke }) {
  const revoked = !!apiKey.revokedAt;
  const usagePct = apiKey.dailyLimitUsdc > 0
    ? Math.min(100, (apiKey.usedTodayUsdc / apiKey.dailyLimitUsdc) * 100)
    : 0;

  const lastUsed = apiKey.lastUsedAt
    ? timeAgo(Number(apiKey.lastUsedAt) / 1000)
    : 'never';

  return (
    <div className={`p-4 border transition-all ${
      revoked
        ? 'bg-zinc-950/60 border-zinc-800/60 opacity-60'
        : 'bg-zinc-950/40 border-zinc-800/40 hover:border-zinc-700/60'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] font-bold text-zinc-100 font-mono uppercase tracking-wide truncate">
              {apiKey.label || 'Unlabeled key'}
            </p>
            {revoked ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 border bg-zinc-800/60 text-zinc-500 border-zinc-700/40 uppercase tracking-wide">
                Revoked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 border bg-emerald-950/60 text-emerald-400 border-emerald-900/40 uppercase tracking-wide">
                <span className="w-1 h-1 bg-emerald-400 animate-pulse"/>
                Active
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-[10px] font-mono">
            <div>
              <p className="text-zinc-600 uppercase tracking-widest text-[9px] mb-0.5">Per invoice</p>
              <p className="text-zinc-300 tabular-nums">${apiKey.maxAmountUsdc}</p>
            </div>
            <div>
              <p className="text-zinc-600 uppercase tracking-widest text-[9px] mb-0.5">Daily cap</p>
              <p className="text-zinc-300 tabular-nums">${apiKey.dailyLimitUsdc}</p>
            </div>
            <div>
              <p className="text-zinc-600 uppercase tracking-widest text-[9px] mb-0.5">Last used</p>
              <p className="text-zinc-300">{lastUsed}</p>
            </div>
          </div>

          {!revoked && apiKey.dailyLimitUsdc > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                  Today's usage
                </p>
                <p className="text-[10px] font-mono text-zinc-400 tabular-nums">
                  ${apiKey.usedTodayUsdc} / ${apiKey.dailyLimitUsdc}
                </p>
              </div>
              <div className="h-1 bg-zinc-900 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    usagePct >= 90 ? 'bg-rose-500' :
                    usagePct >= 60 ? 'bg-amber-500' :
                    'bg-sky-500'
                  }`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {!revoked && (
          <button
            onClick={() => onRevoke(apiKey.id, apiKey.label)}
            className="flex-shrink-0 h-8 px-3 bg-zinc-900 hover:bg-rose-950/40 hover:text-rose-400 text-zinc-500 text-[10px] font-bold font-mono uppercase tracking-widest border border-zinc-800 transition-all">
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY CREATE MODAL
// ═══════════════════════════════════════════════════════════════════════════

function ApiKeyCreateModal({ onSubmit, onClose }) {
  const [label,          setLabel]          = useState('');
  const [maxAmountUsdc,  setMaxAmountUsdc]  = useState('500');
  const [dailyLimitUsdc, setDailyLimitUsdc] = useState('2000');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');

    const maxNum   = parseInt(maxAmountUsdc);
    const dailyNum = parseInt(dailyLimitUsdc);

    if (!Number.isFinite(maxNum)   || maxNum   <= 0) return setErr('Per-invoice cap must be a positive number');
    if (!Number.isFinite(dailyNum) || dailyNum <= 0) return setErr('Daily cap must be a positive number');
    if (maxNum > dailyNum)                           return setErr('Per-invoice cap cannot exceed daily cap');

    setBusy(true);
    try {
      await onSubmit({
        label: label.trim() || undefined,
        maxAmountUsdc:  maxNum,
        dailyLimitUsdc: dailyNum,
      });
    } catch (e) {
      setErr(e.message || 'Failed to create key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 shadow-2xl">

        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// New key</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
              Generate API key
            </h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy}
            className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Label */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              Label
            </label>
            <input type="text" placeholder="e.g. Zapier — Facebook leads"
              maxLength={100}
              value={label}
              onChange={e => { setLabel(e.target.value); setErr(''); }}
              className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-sans focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all"/>
            <p className="text-[10px] text-zinc-600 font-mono mt-1">
              Helps you remember what this key is for
            </p>
          </div>

          {/* Caps */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Per invoice cap
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold font-mono text-zinc-600 pointer-events-none">$</span>
                <input type="number" min="1" step="1"
                  value={maxAmountUsdc}
                  onChange={e => { setMaxAmountUsdc(e.target.value); setErr(''); }}
                  className="w-full h-11 pl-7 pr-14 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono tabular-nums focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all"/>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-zinc-600 uppercase">USDC</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Daily cap
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold font-mono text-zinc-600 pointer-events-none">$</span>
                <input type="number" min="1" step="1"
                  value={dailyLimitUsdc}
                  onChange={e => { setDailyLimitUsdc(e.target.value); setErr(''); }}
                  className="w-full h-11 pl-7 pr-14 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono tabular-nums focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all"/>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-zinc-600 uppercase">USDC</span>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2.5 px-4 py-3 bg-sky-500/5 border border-sky-500/10">
            <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
              Caps protect your burner from runaway automation. The key will be
              rejected if any single invoice exceeds the per-invoice cap or if the
              total for today would exceed the daily cap.
            </p>
          </div>

          {err && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/30 border border-red-900/30">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="text-xs text-red-400 font-sans normal-case">{err}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold font-mono uppercase tracking-widest text-xs border border-zinc-800 transition-all disabled:opacity-40">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? <Spinner label="Generating…"/> : 'Generate key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY REVEAL MODAL (shown once after creation)
// ═══════════════════════════════════════════════════════════════════════════

function ApiKeyRevealModal({ keyData, onClose }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(keyData.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800/80 shadow-2xl">

        <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Save your key</p>
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
            API key generated
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5">

          <div className="flex items-start gap-3 px-4 py-3 bg-amber-950/30 border border-amber-900/40">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <p className="text-[10px] font-bold text-amber-400 font-mono uppercase tracking-widest mb-1">
                This key is shown only once
              </p>
              <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                Copy it now and store it securely. If you lose it, revoke it and
                generate a new one — there's no way to view it again.
              </p>
            </div>
          </div>

          {/* Label */}
          {keyData.label && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Label
              </label>
              <div className="h-11 px-4 flex items-center bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300">
                {keyData.label}
              </div>
            </div>
          )}

          {/* Key */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              API key
            </label>
            <div className="relative">
              <div className="px-4 py-3 bg-zinc-950 border border-zinc-800 font-mono text-xs text-sky-300 break-all select-all leading-relaxed">
                {keyData.key}
              </div>
              <button onClick={copyKey}
                className={`absolute top-2 right-2 px-3 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest border transition-all ${
                  copied
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
                }`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Caps summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono mb-1">
                Per invoice
              </p>
              <p className="text-sm font-mono text-zinc-100 tabular-nums">
                ${keyData.maxAmountUsdc}
              </p>
            </div>
            <div className="px-4 py-3 bg-zinc-950/60 border border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono mb-1">
                Daily cap
              </p>
              <p className="text-sm font-mono text-zinc-100 tabular-nums">
                ${keyData.dailyLimitUsdc}
              </p>
            </div>
          </div>

          {/* Confirmation */}
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
            <input type="checkbox" className="sr-only"
              checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
            <span className="text-[10px] font-mono text-zinc-400 leading-relaxed">
              I have copied and saved this key in a safe place.
            </span>
          </label>

          <button onClick={() => {
              // Save API key to localStorage so burner operations (decrypt cUSDC, sweep)
              // can use it later. Stored per-wallet.
              try {
                const wallet = (keyData.wallet || '').toLowerCase();
                if (wallet && keyData.key) {
                  localStorage.setItem(`zeroremit_api_key_${wallet}`, keyData.key);
                }
              } catch (e) {
                console.warn('Failed to save API key locally:', e.message);
              }
              onClose();
            }}
            disabled={!confirmed}
            className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Done
          </button>

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BURNER CREATE / IMPORT MODAL
// ═══════════════════════════════════════════════════════════════════════════

function BurnerCreateModal({ mode, onSubmit, onClose }) {
  const [password,   setPassword]   = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (mode === 'create' && password !== confirmPw) return setErr('Passwords do not match.');
    if (mode === 'import') {
      if (!privateKey.trim()) return setErr('Paste your burner private key.');
      if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey.trim())) {
        return setErr('Invalid private key (expected 0x + 64 hex chars).');
      }
    }
    setBusy(true);
    try {
      await onSubmit({ password, privateKey: privateKey.trim() });
    } catch (e) {
      setErr(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Burner wallet</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
              {mode === 'create' ? 'Set wallet password' : 'Import burner wallet'}
            </h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy}
            className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {mode === 'create' && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-sky-500/5 border border-sky-500/10">
              <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
                This password encrypts your burner wallet's private key.
                It is <strong>never sent to our servers</strong>.
              </p>
            </div>
          )}

          {mode === 'import' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Private key <span className="text-sky-400">*</span>
              </label>
              <textarea rows={2} placeholder="0x…"
                value={privateKey}
                onChange={e => { setPrivateKey(e.target.value); setErr(''); }}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all resize-none"/>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              {mode === 'create' ? 'Password' : 'Encryption password'}
              <span className="text-sky-400 ml-0.5">*</span>
            </label>
            <input type="password" placeholder="Min 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setErr(''); }}
              className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-sans focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all"/>
          </div>

          {mode === 'create' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
                Confirm password <span className="text-sky-400 ml-0.5">*</span>
              </label>
              <input type="password" placeholder="Re-enter password"
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setErr(''); }}
                className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-sans focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all"/>
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/30 border border-red-900/30">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="text-xs text-red-400 font-sans normal-case">{err}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold font-mono uppercase tracking-widest text-xs border border-zinc-800 transition-all disabled:opacity-40">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy
                ? <Spinner label={mode === 'create' ? 'Creating…' : 'Importing…'}/>
                : mode === 'create' ? 'Create burner' : 'Import & encrypt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BURNER BACKUP MODAL (shown once after creation)
// ═══════════════════════════════════════════════════════════════════════════

function BurnerBackupModal({ privateKey, burnerAddress, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Backup</p>
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">
            Save your burner private key
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-950/30 border border-amber-900/40">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <p className="text-[10px] font-bold text-amber-400 font-mono uppercase tracking-widest mb-1">
                This key is shown only once
              </p>
              <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                Save it in a password manager or write it down. If you lose both
                this key and your password, your burner wallet is unrecoverable.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              Burner address
            </label>
            <div className="h-11 px-4 flex items-center bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 break-all">
              {burnerAddress}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono block mb-2">
              Private key
            </label>
            <div className="relative">
              <div className="px-4 py-3 bg-zinc-950 border border-zinc-800 font-mono text-xs text-rose-300 break-all select-all leading-relaxed">
                {privateKey}
              </div>
              <button onClick={copyKey}
                className={`absolute top-2 right-2 px-3 py-1.5 text-[9px] font-bold font-mono uppercase tracking-widest border transition-all ${
                  copied
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
                }`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
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
            <input type="checkbox" className="sr-only"
              checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
            <span className="text-[10px] font-mono text-zinc-400 leading-relaxed">
              I have saved my private key in a safe place and understand it
              will not be shown again.
            </span>
          </label>

          <button onClick={onConfirm} disabled={!confirmed}
            className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
            I've saved it — continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD PROMPT (for re-enabling automation)
// ═══════════════════════════════════════════════════════════════════════════

function BurnerPasswordPrompt({ title, description, confirmLabel = 'Confirm', onSubmit, onClose }) {
  const [password, setPassword] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await onSubmit(password);
    } catch (e) {
      setErr(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">// Password</p>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono">{title}</h2>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy}
            className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-zinc-500 font-sans normal-case leading-relaxed">{description}</p>

          <input type="password" placeholder="Burner wallet password" autoFocus
            value={password}
            onChange={e => { setPassword(e.target.value); setErr(''); }}
            className="w-full h-11 px-4 bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-sans focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20 transition-all"/>

          {err && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/30 border border-red-900/30">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="text-xs text-red-400 font-sans normal-case">{err}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold font-mono uppercase tracking-widest text-xs border border-zinc-800 transition-all disabled:opacity-40">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono uppercase tracking-widest text-xs transition-all active:scale-[0.98] disabled:opacity-50">
              {busy ? <Spinner label="Signing…"/> : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



  // ═══════════════════════════════════════════════════════════════════════════
// Small inline decrypt button — used in both wallet cards
// ═══════════════════════════════════════════════════════════════════════════

function SmallDecryptButton({ onClick, decrypting, sdkReady, hasHandle, decryptStatus, accent = 'sky' }) {
  const colorClass = accent === 'amber'
    ? 'text-amber-500 hover:text-amber-400'
    : 'text-sky-400 hover:text-sky-300';

  if (!hasHandle) return null;

  return (
    <button onClick={onClick} disabled={decrypting || !sdkReady}
      className={`text-[9px] font-bold font-mono uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colorClass}`}>
      {decrypting ? (decryptStatus || 'Decrypting…') : 'Decrypt →'}
    </button>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN WALLET CARD — Statistics row 1, card 1
// Title: sky-blue · Amounts: white · Labels: ash/green/purple
// ═══════════════════════════════════════════════════════════════════════════

function MainWalletCard({
  isConnected,
  ethBal, ethReady,
  usdcBal, usdcReady,
  cusdcVal, cusdcHandle, cusdcReady, isCusdcDecrypted,
  onDecryptCusdc, decrypting, decryptStatus, sdkReady,
  onShieldClick,
  onRefresh,
}) {
  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-sky-500/20 transition-all duration-300 flex flex-col">
      <div className="text-[10px] font-bold uppercase tracking-widest font-mono mb-4 text-sky-400">
        Main Wallet
      </div>

      {/* ETH */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
          {ethReady && isConnected ? fmtEth(ethBal) : '—'}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-mono">ETH</span>
      </div>

      {/* USDC */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
          {usdcReady && isConnected ? fmtUsdc(usdcBal) : '—'}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 font-mono">USDC</span>
      </div>

      {/* cUSDC */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2">
          {isCusdcDecrypted && cusdcVal !== null ? (
            <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
              {fmtUsdc(cusdcVal)}
            </span>
          ) : cusdcHandle ? (
            <span className="text-lg font-bold text-zinc-500 tabular-nums font-mono tracking-wider">••••••</span>
          ) : (
            <span className="text-lg font-bold text-zinc-100 tabular-nums font-mono">
              {isConnected ? '0.00' : '—'}
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400 font-mono">cUSDC</span>
        </div>
        {isConnected && cusdcHandle && !isCusdcDecrypted && (
          <div className="mt-1">
            <SmallDecryptButton
              onClick={onDecryptCusdc}
              decrypting={decrypting}
              sdkReady={sdkReady}
              hasHandle={!!cusdcHandle}
              decryptStatus={decryptStatus}
              accent="sky"
            />
          </div>
        )}
      </div>

      {/* Shield / Unshield button (sky) */}
      <button onClick={onShieldClick} disabled={!isConnected}
        className="mt-auto w-full h-9 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold font-mono uppercase tracking-widest transition-all active:scale-[0.98] shadow-md shadow-sky-500/20 flex items-center justify-center gap-1.5">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zM10 7a2 2 0 114 0v1H10V7z"/>
        </svg>
        Shield · Unshield
      </button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// INVOICE CREATION SPLIT CARD — Statistics row 3
// Shows main vs burner invoice creation percentage with bar visualization
// ═══════════════════════════════════════════════════════════════════════════

function PaymentSplitCard({ mainCount, burnerCount, hasBurner }) {
  const total     = mainCount + burnerCount;
  const mainPct   = total > 0 ? Math.round((mainCount   / total) * 100) : 0;
  const burnerPct = total > 0 ? Math.round((burnerCount / total) * 100) : 0;

  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-5 hover:border-sky-500/20 transition-all duration-300">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3 font-mono">
        Invoice Creation Split
      </div>

      {total === 0 ? (
        <div className="py-4">
          <p className="text-xs text-zinc-500 font-sans normal-case">No invoices created yet</p>
        </div>
      ) : (
        <>
          {/* Percentages row — main left, burner right */}
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-left">
              <div className="text-2xl font-bold text-zinc-100 tabular-nums font-mono">
                {mainPct}%
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 font-mono mt-0.5">
                Main
              </div>
            </div>

            {hasBurner && (
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-500 tabular-nums font-mono">
                  {burnerPct}%
                </div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-500/70 font-mono mt-0.5">
                  Burner
                </div>
              </div>
            )}
          </div>

          {/* Bar visualization */}
          {hasBurner ? (
            <div className="h-1.5 bg-zinc-900 overflow-hidden flex">
              <div
                className="h-full bg-zinc-100 transition-all"
                style={{ width: `${mainPct}%` }}
              />
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${burnerPct}%` }}
              />
            </div>
          ) : (
            <div className="h-1.5 bg-zinc-900 overflow-hidden">
              <div className="h-full bg-zinc-100 transition-all" style={{ width: '100%' }} />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">
              {mainCount} main
            </span>
            {hasBurner && (
              <span className="text-[10px] text-amber-500 font-mono uppercase tracking-wide">
                {burnerCount} burner
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}




// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
const PAGE_TABS = ['Statistics', 'Transactions', 'Automation'];
const ACTIVITY_TABS = ['All', 'Pending', 'Paid', 'Cancelled', 'Donations'];

export default function Dashboard() {
  const { data: walletClient } = useWalletClient();
  const { address, isConnected } = useAccount();
  const { decryptHandle, sdkReady } = useZamaEncrypt();
  const { events, stats, eventsReady, fetchError, fetchAll } = useDashboard(address);
  const burnerState = useBurner(address);

  const [pageTab, setPageTab] = useState('Statistics');
  const [actTab, setActTab] = useState('All');
  const [usdcBal, setUsdcBal] = useState(null);
  const [usdcReady, setUsdcReady] = useState(false);
  const [ethBal, setEthBal] = useState(null);
  const [ethReady, setEthReady] = useState(false);
  
    // ── Burner balances ─────────────────────────────────────────────────────────
  const [burnerEth,           setBurnerEth]           = useState(null);
  const [burnerUsdc,          setBurnerUsdc]          = useState(null);
  const [burnerCusdcHandle,   setBurnerCusdcHandle]   = useState(null);
  const [burnerCusdcVal,      setBurnerCusdcVal]      = useState(null);
  const [burnerReady,         setBurnerReady]         = useState(false);
  const [decryptingBurner,    setDecryptingBurner]    = useState(false);
  const [fundBurnerOpen,      setFundBurnerOpen]      = useState(false);
  const [auditModalOpen,      setAuditModalOpen]      = useState(false);

  const [decryptStatus, setDecryptStatus] = useState(''); 


  const [cusdcHandle, setCusdcHandle] = useState(null);
  const [cusdcReady, setCusdcReady] = useState(false);
  const [cusdcVal, setCusdcVal] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState('');
  const [shieldOpen, setShieldOpen] = useState(false);

  // Pending unshield — persisted to localStorage
  const [pendingUnshield, setPendingUnshield] = useState(null);

  // Load pending unshield when wallet connects, clear when it disconnects
useEffect(() => {
  if (!address) {
    // Wallet disconnected — clear the banner immediately
    setPendingUnshield(null);
    return;
  }
  // Wallet connected — load their specific pending unshield if any
  const stored = loadPendingUnshield(address);
  setPendingUnshield(stored);
}, [address]);


 useEffect(() => {
  if (!address) return; // no wallet, nothing to save
  if (pendingUnshield) savePendingUnshield(address, pendingUnshield);
  else clearPendingUnshield(address);
}, [pendingUnshield, address]);

  const statsLoading = !eventsReady;
  const tableLoading = !eventsReady;

  const extraStats = useMemo(() => {
    const inv = events.filter(e => e.source === 'invoice');
    const multiInv = inv.filter(e => Number(e.kind) === 1);
    const donRecv = events.filter(e => e.source === 'donation' && e.direction === 'received');
    const multiPct = inv.length ? ((multiInv.length / inv.length) * 100).toFixed(1) : '0.0';
    return { donationsReceived: donRecv.length, multiCount: multiInv.length, multiPct };
  }, [events]);

  const invoicePie = useMemo(() => {
    const inv = events.filter(e => e.source === 'invoice');
    return [
      { label: 'Single', value: inv.filter(e => Number(e.kind) === 0).length, color: '#71717a' },
      { label: 'Multi', value: inv.filter(e => Number(e.kind) === 1).length, color: '#38bdf8' },
      { label: 'Settled', value: inv.filter(e => e.status === 1).length, color: '#10b981' },
    ];
  }, [events]);

  const tokenPie = useMemo(() => {
    const usdcUsd = usdcBal ? Number(formatUnits(usdcBal, USDC_DECIMALS)) : 0;
    const ethUsd = ethBal ? Number(formatUnits(ethBal, 18)) * ETH_PRICE_USD : 0;
    return [
      { label: 'ETH', value: Math.round(ethUsd * 100) / 100, color: '#8b5cf6' },
      { label: 'USDC', value: Math.round(usdcUsd * 100) / 100, color: '#10b981' },
    ];
  }, [ethBal, usdcBal]);

  const burnerInvoicePie = useMemo(() => {
  if (!burnerState.burner) return [];
  const burnerAddr = burnerState.burner.burnerAddress.toLowerCase();
  const inv = events.filter(e => e.source === 'invoice' && e.from?.toLowerCase() === burnerAddr);
  return [
    { label: 'Single',   value: inv.filter(e => Number(e.kind) === 0).length, color: '#71717a' },
    { label: 'Multi',    value: inv.filter(e => Number(e.kind) === 1).length, color: '#38bdf8' },
    { label: 'Settled',  value: inv.filter(e => e.status === 1).length,       color: '#10b981' },
  ];
}, [events, burnerState.burner]);

  const burnerTokenPie = useMemo(() => {
    const usdcUsd  = burnerUsdc      ? Number(formatUnits(burnerUsdc, USDC_DECIMALS)) : 0;
    const cusdcUsd = burnerCusdcVal !== null ? Number(formatUnits(burnerCusdcVal, USDC_DECIMALS)) : 0;
    const ethUsd   = burnerEth       ? Number(formatUnits(burnerEth, 18)) * ETH_PRICE_USD : 0;
    return [
      { label: 'ETH',   value: Math.round(ethUsd   * 100) / 100, color: '#8b5cf6' },
      { label: 'USDC',  value: Math.round(usdcUsd  * 100) / 100, color: '#10b981' },
      { label: 'cUSDC', value: Math.round(cusdcUsd * 100) / 100, color: '#f59e0b' },
    ];
  }, [burnerEth, burnerUsdc, burnerCusdcVal]);

  // Update main tokenPie to include cUSDC too
  const mainTokenPie = useMemo(() => {
    const usdcUsd  = usdcBal        ? Number(formatUnits(usdcBal, USDC_DECIMALS)) : 0;
    const cusdcUsd = cusdcVal !== null ? Number(formatUnits(cusdcVal, USDC_DECIMALS)) : 0;
    const ethUsd   = ethBal         ? Number(formatUnits(ethBal, 18)) * ETH_PRICE_USD : 0;
    return [
      { label: 'ETH',   value: Math.round(ethUsd   * 100) / 100, color: '#8b5cf6' },
      { label: 'USDC',  value: Math.round(usdcUsd  * 100) / 100, color: '#10b981' },
      { label: 'cUSDC', value: Math.round(cusdcUsd * 100) / 100, color: '#f59e0b' },
    ];
  }, [ethBal, usdcBal, cusdcVal]);


  const invoiceCreationSplit = useMemo(() => {
  const mainAddr   = address?.toLowerCase();
  const burnerAddr = burnerState.burner?.burnerAddress?.toLowerCase();

  const invoices = events.filter(e => e.source === 'invoice');
  const mainCount   = invoices.filter(e => e.from?.toLowerCase() === mainAddr).length;
  const burnerCount = burnerAddr
    ? invoices.filter(e => e.from?.toLowerCase() === burnerAddr).length
    : 0;

  return { mainCount, burnerCount };
}, [events, address, burnerState.burner]);


  const downloadAuditReport = useCallback(async (config) => {
  try {
    const { generateAuditPdf } = await import('../lib/auditPdf.js');

    // Calculate invoice creation split for main vs burner
    const burnerAddr = burnerState.burner?.burnerAddress?.toLowerCase();
    const mainAddr   = address?.toLowerCase();

    const mainCreated   = events.filter(e =>
      e.source === 'invoice' && e.from?.toLowerCase() === mainAddr).length;
    const burnerCreated = burnerAddr
      ? events.filter(e => e.source === 'invoice' && e.from?.toLowerCase() === burnerAddr).length
      : 0;

    generateAuditPdf(config, {
      wallet: address,
      stats,
      events,
      mainBalances: {
        eth:   ethBal,
        usdc:  usdcBal,
        cusdc: cusdcVal,
      },
      burnerInfo: burnerState.burner ? {
        address: burnerState.burner.burnerAddress,
        eth:     burnerEth,
        usdc:    burnerUsdc,
        cusdc:   burnerCusdcVal,
      } : null,
      contracts: {
        chainId:       addresses.chainId,
        cUSDC:         addresses.cUSDC,
        paymentRouter: addresses.PaymentRouter,
        donationVault: addresses.DonationVault,
      },
      creationSplit: { main: mainCreated, burner: burnerCreated },
    });

    setAuditModalOpen(false);
  } catch (err) {
    console.error('[audit-pdf]', err);
    alert(`Failed to generate PDF: ${err.message}`);
  }
}, [
  address, events, stats,
  usdcBal, cusdcVal, ethBal,
  burnerState.burner, burnerEth, burnerUsdc, burnerCusdcVal,
]);



  const refreshUsdc = useCallback(async () => {
    if (!address) { setUsdcReady(true); return; }
    try { setUsdcBal(await getReadClient().readContract({ address: USDC_ADDRESS, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [address] })); }
    catch (e) { console.warn('[usdc]', e?.message); }
    finally { setUsdcReady(true); }
  }, [address]);

  const refreshEth = useCallback(async () => {
    if (!address) { setEthReady(true); return; }
    try { setEthBal(await getReadClient().getBalance({ address })); }
    catch (e) { console.warn('[eth]', e?.message); }
    finally { setEthReady(true); }
  }, [address]);

  const refreshCusdcHandle = useCallback(async () => {
    if (!address) { setCusdcReady(true); return; }
    try {
      const h = await getReadClient().readContract({ address: CUSDC_ADDRESS, abi: CUSDC_HANDLE_ABI, functionName: 'confidentialBalanceOf', args: [address] });
      setCusdcHandle(BigInt(h) === 0n ? null : h); setCusdcVal(null);
    } catch (e) { console.warn('[cusdc]', e?.message); setCusdcHandle(null); }
    finally { setCusdcReady(true); }
  }, [address]);

  const decryptCusdc = useCallback(async () => {
    if (!cusdcHandle || !sdkReady) return;
    setDecryptError('');
    setDecrypting(true);
    try {
      setCusdcVal(await decryptHandle(cusdcHandle, CUSDC_ADDRESS));
    } catch (e) {
      setDecryptError(e?.shortMessage || e?.message || 'Decryption failed');
    } finally {
      setDecrypting(false);
    }
  }, [cusdcHandle, decryptHandle, sdkReady]);

  useEffect(() => {
    if (!address) { setUsdcReady(true); setCusdcReady(true); setEthReady(true); return; }
    refreshUsdc(); refreshEth(); refreshCusdcHandle();
  }, [address, refreshUsdc, refreshEth, refreshCusdcHandle]);

  //burner Refresh
  const refreshBurnerBalances = useCallback(async () => {
  const burnerAddr = burnerState.burner?.burnerAddress;
  if (!burnerAddr) {
    setBurnerEth(null); setBurnerUsdc(null); setBurnerCusdcHandle(null); setBurnerCusdcVal(null);
    setBurnerReady(true);
    return;
  }
  try {
    const [eth, usdc, cusdc] = await Promise.all([
      getReadClient().getBalance({ address: burnerAddr }),
      getReadClient().readContract({
        address: USDC_ADDRESS, abi: USDC_BALANCE_ABI,
        functionName: 'balanceOf', args: [burnerAddr],
      }),
      getReadClient().readContract({
        address: CUSDC_ADDRESS, abi: CUSDC_HANDLE_ABI,
        functionName: 'confidentialBalanceOf', args: [burnerAddr],
      }),
    ]);
    setBurnerEth(eth);
    setBurnerUsdc(usdc);
    setBurnerCusdcHandle(BigInt(cusdc) === 0n ? null : cusdc);
    setBurnerCusdcVal(null); // reset decryption on refresh
  } catch (e) {
    console.warn('[burner-balances]', e?.message);
  } finally {
    setBurnerReady(true);
  }
}, [burnerState.burner?.burnerAddress]);


const decryptBurnerCusdc = useCallback(async () => {
  if (!burnerState.burner || !isConnected) return;
  setDecryptingBurner(true);
  setDecryptStatus('Signing…');

  try {
    const { getStoredApiKey, apiDecryptBurnerCusdc } = await import('../lib/api.js');
    const apiKey = await getStoredApiKey(address);

    setDecryptStatus('Decrypting (may take up to 45s)…');
    const result = await apiDecryptBurnerCusdc(apiKey);

    if (result.empty) {
      setBurnerCusdcVal(0n);
    } else {
      setBurnerCusdcVal(BigInt(result.raw));
    }
    setDecryptStatus('');
  } catch (e) {
    console.warn('[burner-decrypt]', e?.message);
    setDecryptStatus('');
    alert(`Failed to decrypt burner cUSDC: ${e.message}`);
  } finally {
    setDecryptingBurner(false);
  }
}, [burnerState.burner, isConnected, address]);


useEffect(() => {
  refreshBurnerBalances();
}, [refreshBurnerBalances]);


  const counts = useMemo(() => ({
    All: events.length,
    Pending: events.filter(e => e.source === 'invoice' && e.status === 0).length,
    Paid: events.filter(e => e.source === 'invoice' && e.status === 1).length,
    Cancelled: events.filter(e => e.source === 'invoice' && e.status === 2).length,
    Donations: events.filter(e => e.source === 'donation').length,
  }), [events]);

  const filtered = useMemo(() => {
    let l = events;
    if (actTab === 'Pending') l = l.filter(e => e.source === 'invoice' && e.status === 0);
    if (actTab === 'Paid') l = l.filter(e => e.source === 'invoice' && e.status === 1);
    if (actTab === 'Cancelled') l = l.filter(e => e.source === 'invoice' && e.status === 2);
    if (actTab === 'Donations') l = l.filter(e => e.source === 'donation');
    return l;
  }, [events, actTab]);

  const hasHandle = cusdcHandle !== null;
  const isDecrypted = cusdcVal !== null;
  const canDecrypt = isConnected && hasHandle && !decrypting && sdkReady;
  const cusdcDisplay = isDecrypted ? `$${fmtUsdc(cusdcVal)}` : '••••••';
  const canExport = isConnected && events.length > 0 && !statsLoading;

const handleUnshieldFinalized = useCallback(() => {
  refreshUsdc(); refreshCusdcHandle(); setCusdcVal(null);
  clearPendingUnshield(address);  // pass address
  setPendingUnshield(null);
}, [refreshUsdc, refreshCusdcHandle, address]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider selection:bg-sky-400 selection:text-zinc-950">
      <ShimmerStyle />

      <ShieldModal
        isOpen={shieldOpen} onClose={() => setShieldOpen(false)}
        usdcBal={usdcBal} cusdcVal={cusdcVal} cusdcHandle={cusdcHandle} isCusdcDecrypted={isDecrypted}
        onShieldSuccess={() => { refreshUsdc(); refreshCusdcHandle(); setCusdcVal(null); }}
        onUnshieldSubmitted={({ txHash, amount, timestamp, baseUsdc }) => {
          const data = { txHash, amount, timestamp, baseUsdc };
          setPendingUnshield(data);
          savePendingUnshield(address, data);  // save immediately with wallet
          refreshCusdcHandle();
          setCusdcVal(null);
        }}
      />

      <FundBurnerModal
        isOpen={fundBurnerOpen}
        onClose={() => setFundBurnerOpen(false)}
        burnerAddress={burnerState.burner?.burnerAddress}
        usdcBal={usdcBal}
        cusdcVal={cusdcVal}
        isCusdcDecrypted={cusdcVal !== null}
        ethBal={ethBal}
        onSuccess={() => {
          refreshUsdc();
          refreshCusdcHandle();
          refreshEth();
          refreshBurnerBalances();
          setCusdcVal(null);
        }}
      />

      <AuditReportModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        onGenerate={downloadAuditReport}
      />

      {/* HERO */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden border-b border-zinc-900/60 text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none glow-pulse" />
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-blue-600/4 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <h1 className="text-4xl sm:text-6xl lg:text-5xl font-bold tracking-tighter text-white leading-[1.05] mb-6 uppercase">
            Merchant<span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400 bg-clip-text text-transparent"> Portal</span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed font-sans normal-case mb-8">Manage invoices, balances and settlements</p>
          {isConnected && (
            <div className="mb-10 flex justify-center">
              <button onClick={() => setAuditModalOpen(true)} disabled={!canExport}
                className="group inline-flex items-center gap-3 px-6 py-3 bg-transparent border border-zinc-700/50 hover:border-sky-500/50 text-zinc-400 hover:text-sky-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]">
                <svg className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-[10px] font-bold font-mono uppercase tracking-widest">Download Audit Report</span>
                {canExport && <span className="text-[9px] text-zinc-600 font-mono ml-1 border-l border-zinc-700 pl-2">{events.length} events</span>}
              </button>
            </div>
          )}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 bg-zinc-950/80 border border-zinc-800/80 p-1">
              {PAGE_TABS.map(t => (
                <button key={t} onClick={() => setPageTab(t)}
                  className={`px-6 py-2.5 text-[10px] font-bold font-mono uppercase tracking-widest transition-all ${pageTab === t ? 'bg-sky-500 text-white shadow-lg shadow-sky-900/20' : 'text-zinc-500 hover:text-zinc-300'}`}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BODY */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 space-y-6 pt-8">

        {/* Pending unshield banner */}
        {pendingUnshield && (
          <PendingUnshieldBanner
            pendingTxHash={pendingUnshield.txHash} pendingAmount={pendingUnshield.amount}
            pendingTimestamp={pendingUnshield.timestamp} baseUsdc={pendingUnshield.baseUsdc}
            onFinalized={handleUnshieldFinalized}
            onDismiss={() => { setPendingUnshield(null); clearPendingUnshield(address); }}
          />
        )}


        {pageTab === 'Statistics' && (
          <>
            {/* ── Row 1: Main Wallet · Burner Wallet · Total Invoices · Settled ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LoadingShell loading={!usdcReady || !ethReady || !cusdcReady}>
                <MainWalletCard
                  isConnected={isConnected}
                  ethBal={ethBal}
                  ethReady={ethReady}
                  usdcBal={usdcBal}
                  usdcReady={usdcReady}
                  cusdcVal={cusdcVal}
                  cusdcHandle={cusdcHandle}
                  cusdcReady={cusdcReady}
                  isCusdcDecrypted={isDecrypted}
                  onDecryptCusdc={decryptCusdc}
                  decrypting={decrypting}
                  decryptStatus="Decrypting…"
                  sdkReady={sdkReady}
                  onShieldClick={() => setShieldOpen(true)}
                  onRefresh={refreshUsdc}
                />
              </LoadingShell>

              <LoadingShell loading={!burnerReady}>
                <BurnerBalanceCard
                  burner={burnerState.burner}
                  ethBal={burnerEth}
                  usdcBal={burnerUsdc}
                  cusdcVal={burnerCusdcVal}
                  cusdcHandle={burnerCusdcHandle}
                  isCusdcDecrypted={burnerCusdcVal !== null}
                  onFund={() => setFundBurnerOpen(true)}
                  onDecryptBurnerCusdc={decryptBurnerCusdc}
                  decryptingBurner={decryptingBurner}
                  decryptStatus={decryptStatus}
                  sdkReady={sdkReady}
                />
              </LoadingShell>

              <LoadingShell loading={statsLoading}>
                <StatCard
                  label="Total Invoices"
                  value={statsLoading ? '—' : stats.invoices.toLocaleString()}
                  sub={statsLoading ? '—' : `${stats.donations} donations`}
                />
              </LoadingShell>

              <LoadingShell loading={statsLoading}>
                <StatCard
                  label="Settled"
                  accent="text-emerald-400"
                  value={statsLoading ? '—' : stats.paid.toLocaleString()}
                  sub={statsLoading ? '—' : `${stats.rate}% settlement rate`}
                />
              </LoadingShell>
            </div>

            {/* ── Row 2: Pending · Cancelled · Paid to you · Sent/Received ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LoadingShell loading={statsLoading}>
                <StatCard label="Pending"   accent="text-amber-400"   value={statsLoading ? '—' : stats.pending.toLocaleString()}   sub="awaiting payment" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Cancelled" accent="text-rose-400"    value={statsLoading ? '—' : stats.cancelled.toLocaleString()} sub="by creator" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Paid to you" value={statsLoading ? '—' : stats.recvPaid.toLocaleString()} sub="settled invoices received" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Sent / Received" value={statsLoading ? '— / —' : `${stats.sent} / ${stats.received}`} sub="outgoing vs incoming" />
              </LoadingShell>
            </div>

            {/* ── Row 3: Donations · Multi-pay · Settlement Rate · Invoice Creation Split ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LoadingShell loading={statsLoading}>
                <StatCard label="Donations Received" accent="text-sky-400" value={statsLoading ? '—' : extraStats.donationsReceived.toLocaleString()} sub="on your donation pages" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Multi-pay Invoices" accent="text-violet-400" value={statsLoading ? '—' : extraStats.multiCount.toLocaleString()} sub="multi-recipient invoices" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <StatCard label="Settlement Rate" accent="text-emerald-400" value={statsLoading ? '—' : `${stats.rate}%`} sub="paid ÷ total invoices" />
              </LoadingShell>
              <LoadingShell loading={statsLoading}>
                <PaymentSplitCard
                  mainCount={invoiceCreationSplit.mainCount}
                  burnerCount={invoiceCreationSplit.burnerCount}
                  hasBurner={!!burnerState.burner}
                />
              </LoadingShell>
            </div>

            {/* ── Dual donut cards (unchanged) ── */}
            <LoadingShell loading={statsLoading || !usdcReady || !cusdcReady || !ethReady || !burnerReady}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <DualDonutCard
                  subtitle=""
                  title="Invoice Breakdown"
                  mainSegments={invoicePie}
                  burnerSegments={burnerInvoicePie}
                  hasBurner={!!burnerState.burner}
                />
                <DualDonutCard
                  subtitle=""
                  title="Token Distribution"
                  mainSegments={mainTokenPie}
                  burnerSegments={burnerTokenPie}
                  hasBurner={!!burnerState.burner}
                  note={`Public wallet holdings valued in USD (ETH ≈ $${ETH_PRICE_USD.toLocaleString()}). cUSDC values shown only when decrypted.`}
                  valueFormatter={v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
              </div>
            </LoadingShell>

            <LoadingShell loading={statsLoading}>
              <GroupedBarChart events={events} />
            </LoadingShell>
          </>
        )}


        {pageTab === 'Transactions' && (
          <div className="bg-zinc-900/10 border border-zinc-800/40 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60">
              <div className="flex items-center gap-3 flex-wrap">
                <LiveDot />
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">Wallet Activity</span>
                {!tableLoading && <span className="text-[10px] text-zinc-600 font-mono">{filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}</span>}
                <button onClick={fetchAll} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1.5 font-mono uppercase tracking-wide">
                  <svg className={`w-3 h-3 ${tableLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  {tableLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
              <div className="flex items-center gap-1 bg-zinc-950/80 border border-zinc-800/60 p-1 overflow-x-auto">
                {ACTIVITY_TABS.map(t => (
                  <button key={t} onClick={() => setActTab(t)}
                    className={`px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider transition-all whitespace-nowrap ${actTab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}>
                    {t}
                    {!tableLoading && counts[t] > 0 && <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 font-mono ${actTab === t ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-900 text-zinc-600'}`}>{counts[t]}</span>}
                  </button>
                ))}
              </div>
            </div>
            <LoadingShell loading={tableLoading}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px]">
                  <thead>
                    <tr className="border-b border-zinc-800/60">
                      {['#', 'Direction', 'Tx Hash', 'Invoice / Page', 'Type', 'From', 'To', 'Amount', 'Status', 'Time'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-widest whitespace-nowrap font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableLoading
                      ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} index={i} />)
                      : !isConnected || filtered.length === 0
                        ? <EmptyState connected={isConnected} fetchError={fetchError} />
                        : filtered.slice(0, 200).map((ev, i) => <ActivityRow key={`${ev.txHash}-${i}`} event={ev} index={i} />)}
                  </tbody>
                </table>
              </div>
            </LoadingShell>
            {!tableLoading && isConnected && filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-zinc-800/40 flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] text-zinc-700 font-mono uppercase tracking-wide">{Math.min(filtered.length, 200).toLocaleString()} of {filtered.length.toLocaleString()} events</span>
                <a href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noreferrer"
                  className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1.5 font-mono uppercase tracking-wide">
                  View on Etherscan
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            )}
          </div>
        )}

        {pageTab === 'Automation' && (
          <AutomationTab
            address={address}
            isConnected={isConnected}
            burnerState={burnerState}
            burnerBalances={{
              eth:         burnerEth,
              usdc:        burnerUsdc,
              cusdcHandle: burnerCusdcHandle,
              cusdcVal:    burnerCusdcVal,
            }}
          />
        )}

        <p className="text-center text-[10px] text-zinc-700 font-mono uppercase tracking-widest">Sepolia · Zama FHE · Chain {addresses.chainId}</p>
      </div>
    </div>
  );
}