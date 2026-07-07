// Explorer.jsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useExplorer } from '../hooks/useExplorer';
import addresses from '../contracts/addresses.json';

// ─── Slide-in on first scroll-into-view ──────────────────────────────────────
// Fires once per element; respects prefers-reduced-motion.
function useSlideIn(direction = 'up', delay = 0) {
  const ref  = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const base = 'transition-all duration-700 ease-out';
  const delayClass = delay ? `delay-[${delay}ms]` : '';
  const hidden = direction === 'up'   ? 'opacity-0 translate-y-8'
               : direction === 'left' ? 'opacity-0 -translate-x-8'
               : 'opacity-0 translate-x-8';
  return { ref, cls: `${base} ${delayClass} ${vis ? 'opacity-100 translate-y-0 translate-x-0' : hidden}` };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const shortAddr = a => !a || a === '0x0000000000000000000000000000000000000000'
  ? '—' : `${a.slice(0,6)}…${a.slice(-4)}`;
const shortHash = h => !h ? '—' : `${h.slice(0,10)}…${h.slice(-6)}`;

const timeAgo = ts => {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const INVOICE_TYPE   = ['Single',  'Multi'];

// ─── Shimmer / skeleton ───────────────────────────────────────────────────────
function ShimmerStyle() {
  return (
    <style>{`
      @keyframes shimmer {
        0%   { background-position: -1000px 0; }
        100% { background-position:  1000px 0; }
      }
      .skel-shimmer {
        background: linear-gradient(
          90deg,
          rgba(63,63,70,0) 0%,
          rgba(82,82,91,0.25) 50%,
          rgba(63,63,70,0) 100%
        );
        background-size: 1000px 100%;
        animation: shimmer 1.8s infinite linear;
      }
      .skel-blur {
        filter: blur(8px);
        opacity: 0.55;
        pointer-events: none;
        user-select: none;
      }
    `}</style>
  );
}

function LoadingShell({ loading, children }) {
  return (
    <div className="relative h-full">
      <div className={`h-full ${loading ? 'skel-blur transition-all duration-500' : 'transition-all duration-500'}`}>
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

function SkeletonRow({ index }) {
  return (
    <tr className={`border-b border-zinc-800/40 ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3"><div className="h-3 w-4 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-14 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-zinc-800/60" /></td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-zinc-800/60" /></td>
    </tr>
  );
}

// ─── Status styles ────────────────────────────────────────────────────────────
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
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium font-mono
      px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-wide
      ${STATUS_CLS[status] || STATUS_CLS.Pending}`}>
      <span className={`w-1.5 h-1.5 flex-shrink-0 ${STATUS_DOT[status] || STATUS_DOT.Pending}`}/>
      {status}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono
      font-bold text-emerald-400 uppercase tracking-widest">
      <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
      Live
    </span>
  );
}

// ─── Stat card — Home.jsx aesthetic ──────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className="h-full bg-zinc-900/10 border border-zinc-800/40 p-5
      hover:border-sky-500/20 transition-all duration-300 flex flex-col justify-between">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3 font-mono">
        {label}
      </div>
      <div className={`text-4xl font-bold leading-none tabular-nums font-mono
        ${accent || 'text-zinc-100'}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-zinc-500 mt-3 font-mono uppercase tracking-wide">
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────
function ActivityRow({ event, index }) {
  const base  = 'https://sepolia.etherscan.io';
  const isInv = event.source === 'invoice';
  const status = isInv ? (INVOICE_STATUS[event.status] ?? 'Pending') : 'Donation';
  const type   = isInv ? (INVOICE_TYPE[Number(event.kind)] ?? 'Single') : 'Donation';

  return (
    <tr className={`border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors
      ${index % 2 ? 'bg-zinc-900/20' : ''}`}>
      <td className="px-4 py-3 text-xs text-zinc-700 font-mono w-8">{index + 1}</td>
      <td className="px-4 py-3">
        <a href={`${base}/tx/${event.txHash}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-sky-400 hover:text-sky-300 group">
          <span className="text-xs font-mono">{shortHash(event.txHash)}</span>
          <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </a>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-zinc-500 max-w-[140px] truncate">
        {shortHash(event.invoiceId || event.pageId || '—')}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] px-2 py-0.5 font-mono font-bold uppercase tracking-wide border ${
          type === 'Single'
            ? 'bg-zinc-900/60 text-zinc-400 border-zinc-800/60'
            : type === 'Multi'
            ? 'bg-violet-950/60 text-violet-400 border-violet-900/40'
            : 'bg-sky-950/60 text-sky-400 border-sky-900/40'
        }`}>
          {type}
        </span>
      </td>
      <td className="px-4 py-3"><StatusBadge status={status}/></td>
      <td className="px-4 py-3 text-xs text-zinc-700 italic font-mono select-none
        tracking-widest">
        [fhe]
      </td>
      <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap font-mono">
        {timeAgo(event.timestamp)}
      </td>
    </tr>
  );
}

function EmptyState({ query, fetchError }) {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-20 text-center">
        {fetchError ? (
          <div>
            <div className="text-rose-400/80 text-xs font-mono mb-2 uppercase tracking-widest">
              Failed to load events
            </div>
            <div className="text-zinc-700 text-xs font-mono max-w-md mx-auto break-all">
              {fetchError}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-zinc-600 text-xs font-mono uppercase tracking-widest mb-1">
              {query ? `No results for "${query}"` : 'No events indexed yet'}
            </div>
            <div className="text-zinc-700 text-[10px] font-mono">
              {query ? 'Try a different tx hash or invoice ID' : 'Waiting for on-chain activity'}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Activity graph — logic 100% unchanged, styling updated ──────────────────
function ActivityGraph({ events }) {
  const [range,  setRange]  = useState('1M');
  const [filter, setFilter] = useState('Both');
  const [zoom,   setZoom]   = useState(1);
  const [hover,  setHover]  = useState(null);
  const svgRef = React.useRef(null);

  const series = useMemo(() => {
    const inv = events.filter(e => e.source === 'invoice' && e.timestamp);
    const now = Math.floor(Date.now() / 1000);
    const cutoffs = { '1D': now - 86_400, '1W': now - 7 * 86_400, '1M': now - 30 * 86_400 };
    const steps   = { '1D': 3_600,         '1W': 86_400,           '1M': 86_400 };
    const cutoff  = cutoffs[range];
    const step    = steps[range];
    const start   = Math.floor(cutoff / step) * step;
    const end     = Math.floor(now    / step) * step;
    const bk = {};
    for (let k = start; k <= end; k += step) bk[k] = { pending: 0, paid: 0 };
    inv.filter(e => Number(e.timestamp) >= cutoff).forEach(e => {
      const k = Math.floor(Number(e.timestamp) / step) * step;
      if (!bk[k]) bk[k] = { pending: 0, paid: 0 };
      if (e.status === 0) bk[k].pending++;
      if (e.status === 1) bk[k].paid++;
    });
    return Object.keys(bk).map(Number).sort((a, b) => a - b)
      .map(k => ({ t: k, pending: bk[k].pending, paid: bk[k].paid }));
  }, [events, range]);

  const totals = useMemo(() =>
    series.reduce((acc, p) => ({
      pending: acc.pending + p.pending,
      paid:    acc.paid    + p.paid,
    }), { pending: 0, paid: 0 }),
  [series]);

  const hasData = totals.pending > 0 || totals.paid > 0;
  const W = 900; const H = 280;
  const PAD = { top: 24, right: 24, bottom: 32, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;
  const showPaid = filter === 'Both' || filter === 'Settled';
  const showPend = filter === 'Both' || filter === 'Pending';
  const max  = Math.max(...series.flatMap(p => [showPend ? p.pending : 0, showPaid ? p.paid : 0]), 4);
  const yMax = Math.ceil(max / 4) * 4 || 4;
  const xFor = i => series.length <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (series.length - 1)) * innerW;
  const yFor = v => PAD.top + innerH - (v / yMax) * innerH;

  function smoothPath(pts) {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i-1)]; const p1 = pts[i];
      const p2 = pts[i+1]; const p3 = pts[Math.min(pts.length-1, i+2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6; const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6; const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  const paidPts = series.map((p, i) => ({ x: xFor(i), y: yFor(p.paid) }));
  const pendPts = series.map((p, i) => ({ x: xFor(i), y: yFor(p.pending) }));
  const paidLine = smoothPath(paidPts);
  const pendLine = smoothPath(pendPts);
  const closeArea = (d, pts) => {
    if (!pts.length) return '';
    return `${d} L ${pts[pts.length-1].x.toFixed(2)} ${(PAD.top+innerH).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(PAD.top+innerH).toFixed(2)} Z`;
  };
  const yTicks = [0, yMax/4, yMax/2, (3*yMax)/4, yMax].map(v => Math.round(v));

  const xLabels = useMemo(() => {
    if (series.length === 0) return [];
    const fmtDay = t => new Date(t*1000).toLocaleDateString([],{month:'short',day:'numeric'});
    const fmtHr  = t => new Date(t*1000).toLocaleTimeString([],{hour:'2-digit'});
    if (range === '1W') {
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      return series.map((p,i) => ({
        i, x: xFor(i),
        label: days[new Date(p.t*1000).getDay()===0 ? 6 : new Date(p.t*1000).getDay()-1],
      }));
    }
    const fmt  = range === '1D' ? fmtHr : fmtDay;
    const step = Math.max(1, Math.floor(series.length / 6));
    const out  = [];
    for (let i = 0; i < series.length; i += step) out.push({ i, x: xFor(i), label: fmt(series[i].t) });
    const last = series.length - 1;
    if (out[out.length-1]?.i !== last && last >= 0) out.push({ i: last, x: xFor(last), label: fmt(series[last].t) });
    return out;
  }, [series, range]);

  function onMove(e) {
    if (!svgRef.current || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px   = ((e.clientX - rect.left) / rect.width) * W;
    const rel  = (px - PAD.left) / innerW;
    setHover(Math.max(0, Math.min(series.length-1, Math.round(rel*(series.length-1)))));
  }
  function onLeave() { setHover(null); }
  function onWheel(e) {
    e.preventDefault();
    setZoom(z => Math.max(1, Math.min(4, z + (e.deltaY > 0 ? -0.15 : 0.15))));
  }
  const viewBox = (() => {
    if (zoom === 1) return `0 0 ${W} ${H}`;
    const visibleW = W / zoom;
    const focusX   = xFor(hover ?? Math.floor(series.length/2));
    const x = Math.max(0, Math.min(W - visibleW, focusX - visibleW/2));
    return `${x} 0 ${visibleW} ${H}`;
  })();

  return (
    <div className="bg-zinc-900/10 border border-zinc-800/40 p-6 h-full flex flex-col
      hover:border-sky-500/10 transition-all duration-300 min-h-[420px]">

      {/* Graph header */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-1">
            // Protocol activity
          </p>
          <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide font-mono">
            Pending vs settled
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Range picker */}
          <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 p-1">
            {['1D','1W','1M'].map(r => (
              <button key={r} onClick={() => { setRange(r); setZoom(1); }}
                className={`px-4 py-1.5 text-[10px] font-bold font-mono uppercase
                  tracking-widest transition-all ${
                  range === r
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>{r}</button>
            ))}
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          {/* Filter picker */}
          <div className="inline-flex items-center bg-zinc-950/80 border border-zinc-800/80 p-1">
            {['Both','Pending','Settled'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 text-[10px] font-bold font-mono uppercase
                  tracking-widest transition-all ${
                  filter === f
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Totals row */}
      <div className="flex items-end gap-8 mb-5 pb-5 border-b border-zinc-800/40">
        {[
          { label: 'Pending', value: totals.pending, color: 'text-amber-400' },
          { label: 'Settled', value: totals.paid,    color: 'text-emerald-400' },
          { label: 'Total',   value: totals.pending + totals.paid, color: 'text-zinc-100' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1 font-mono">
              {label}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold tabular-nums font-mono ${color}`}>{value}</span>
              <span className="text-[10px] text-zinc-500 font-mono uppercase">{range}</span>
            </div>
          </div>
        ))}
        {zoom > 1 && (
          <button onClick={() => setZoom(1)}
            className="ml-auto px-4 py-1.5 text-[10px] font-bold font-mono uppercase
              tracking-widest text-zinc-400 hover:text-zinc-200 bg-zinc-800/60
              hover:bg-zinc-700/60 border border-zinc-700/40 transition-all">
            Reset zoom
          </button>
        )}
      </div>

      {/* SVG chart — logic unchanged */}
      <div className="relative flex-1">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest">
              No payments in this period
            </p>
          </div>
        )}
        <svg ref={svgRef} viewBox={viewBox}
          className="w-full h-auto cursor-crosshair select-none"
          style={{ maxHeight: 320 }}
          onMouseMove={onMove} onMouseLeave={onLeave} onWheel={onWheel}>
          <defs>
            <linearGradient id="exPaidFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0"    />
            </linearGradient>
            <linearGradient id="exPendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"    />
            </linearGradient>
          </defs>
          {yTicks.map(v => (
            <g key={`y-${v}`}>
              <line x1={PAD.left} y1={yFor(v)} x2={W-PAD.right} y2={yFor(v)}
                stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 4" opacity="0.4"/>
              <text x={PAD.left-10} y={yFor(v)+4} textAnchor="end"
                fill="#52525b" fontSize="11" fontFamily="monospace" fontWeight="600">{v}</text>
            </g>
          ))}
          <line x1={PAD.left} y1={PAD.top+innerH} x2={W-PAD.right} y2={PAD.top+innerH}
            stroke="#3f3f46" strokeWidth="1" opacity="0.6"/>
          {xLabels.map((l, i) => (
            <text key={`x-${i}`} x={l.x} y={H-8} textAnchor="middle"
              fill="#52525b" fontSize="11" fontFamily="monospace" fontWeight="600">
              {l.label}
            </text>
          ))}
          {showPaid && paidPts.length > 1 && <path d={closeArea(paidLine, paidPts)} fill="url(#exPaidFill)"/>}
          {showPend && pendPts.length > 1 && <path d={closeArea(pendLine, pendPts)} fill="url(#exPendFill)"/>}
          {showPaid && <path d={paidLine} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
          {showPend && <path d={pendLine} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
          {hover !== null && series[hover] && (
            <g pointerEvents="none">
              <line x1={xFor(hover)} y1={PAD.top} x2={xFor(hover)} y2={PAD.top+innerH}
                stroke="#52525b" strokeWidth="1" strokeDasharray="3 3"/>
              {showPaid && <circle cx={xFor(hover)} cy={yFor(series[hover].paid)}    r="5" fill="#10b981" stroke="#09090b" strokeWidth="2"/>}
              {showPend && <circle cx={xFor(hover)} cy={yFor(series[hover].pending)} r="5" fill="#f59e0b" stroke="#09090b" strokeWidth="2"/>}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hover !== null && series[hover] && (
          <div className="absolute pointer-events-none bg-zinc-950 border border-zinc-800
            shadow-xl px-3 py-2 text-xs font-mono"
            style={{ left:`${(xFor(hover)/W)*100}%`, top: 8, transform:'translateX(-50%)' }}>
            <div className="text-zinc-500 mb-1 font-bold uppercase tracking-wide text-[9px]">
              {new Date(series[hover].t*1000).toLocaleDateString([],{
                month: 'short', day: 'numeric',
                hour:  range === '1D' ? '2-digit' : undefined,
              })}
            </div>
            {showPend && (
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-2 h-2 bg-amber-400"/>
                Pending: <span className="font-bold">{series[hover].pending}</span>
              </div>
            )}
            {showPaid && (
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-2 h-2 bg-emerald-400"/>
                Settled: <span className="font-bold">{series[hover].paid}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/40">
        <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-widest">
          Scroll chart to zoom
        </p>
        <div className="flex items-center gap-4">
          {showPend && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono uppercase">
              <span className="w-2 h-2 bg-amber-400"/>Pending
            </div>
          )}
          {showPaid && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono uppercase">
              <span className="w-2 h-2 bg-emerald-400"/>Settled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
const TABS = ['All', 'Pending', 'Paid', 'Cancelled', 'Expired', 'Donations'];

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPLORER
// ═════════════════════════════════════════════════════════════════════════════
export default function Explorer() {
  const { events, stats, loading, fetchError, fetchEvents } = useExplorer();

  const [tab,         setTab]         = useState('All');
  const [search,      setSearch]      = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Slide-in refs for each body section
  const s1 = useSlideIn('up',   0);   // stats + graph
  const s2 = useSlideIn('up',  80);   // activity table
  const s3 = useSlideIn('up', 160);   // contract cards

  const tabCount = useMemo(() => ({
    All:       events.length,
    Pending:   events.filter(e => e.source === 'invoice' && e.status === 0).length,
    Paid:      events.filter(e => e.source === 'invoice' && e.status === 1).length,
    Cancelled: events.filter(e => e.source === 'invoice' && e.status === 2).length,
    Expired:   events.filter(e => e.source === 'invoice' && e.status === 3).length,
    Donations: events.filter(e => e.source === 'donation').length,
  }), [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (tab === 'Pending')   list = list.filter(e => e.source === 'invoice' && e.status === 0);
    if (tab === 'Paid')      list = list.filter(e => e.source === 'invoice' && e.status === 1);
    if (tab === 'Cancelled') list = list.filter(e => e.source === 'invoice' && e.status === 2);
    if (tab === 'Expired')   list = list.filter(e => e.source === 'invoice' && e.status === 3);
    if (tab === 'Donations') list = list.filter(e => e.source === 'donation');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.txHash    || '').toLowerCase().includes(q) ||
        (e.invoiceId || '').toLowerCase().includes(q) ||
        (e.pageId    || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, tab, search]);

  const handleSearch = e => { e.preventDefault(); setSearch(searchInput.trim()); };
  const clearSearch  = () => { setSearch(''); setSearchInput(''); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono
      tracking-wider selection:bg-sky-400 selection:text-zinc-950">
      <ShimmerStyle />

      {/* ── HERO — centered, Home.jsx typography ─────────────────────────── */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden
        border-b border-zinc-900/60 text-center">

        {/* Subtle radial glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]
          bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />
        {/* Dot grid texture */}
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none
          bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-24
          bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />

        <div className="max-w-4xl mx-auto relative z-10">

          {/* Main headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-4xl font-bold tracking-tighter
            text-white leading-[1.05] mb-6 uppercase">
            Zero Exposure<br />
            <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400
              bg-clip-text text-transparent">
              Full Remittance
            </span>
          </h1>

          <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed
            font-sans normal-case mb-10">
            Every invoice and donation passing through Zeroremit's contracts —
            status, type, and timing all visible. Amounts stay encrypted.
            That's the point.
          </p>

          {/* Search bar — centered */}
          <form onSubmit={handleSearch}
            className="flex gap-2 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4
                text-zinc-500 pointer-events-none"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input type="text" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search by tx hash or invoice ID…"
                className="w-full pl-10 pr-9 py-2.5 bg-zinc-900/80
                  border border-zinc-800 text-sm text-zinc-200
                  placeholder-zinc-600 font-sans normal-case
                  focus:outline-none focus:border-sky-500/60
                  focus:ring-1 focus:ring-sky-500/30 transition-all"/>
              {searchInput && (
                <button type="button" onClick={clearSearch}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                    text-zinc-600 hover:text-zinc-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
            <button type="submit"
              className="px-6 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950
                font-bold text-xs tracking-widest uppercase transition-all
                active:scale-95 whitespace-nowrap">
              Search
            </button>
          </form>

          {search && (
            <div className="mt-4 flex items-center justify-center gap-2
              text-xs text-zinc-500 font-mono">
              <span className="uppercase tracking-wide">Results for</span>
              <span className="text-zinc-300 bg-zinc-800/60 px-2 py-0.5 border border-zinc-800">
                {search}
              </span>
              <button onClick={clearSearch}
                className="text-sky-400 hover:text-sky-300 uppercase tracking-wide">
                clear
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 space-y-4 pt-8">

        {/* Stats + Graph */}
        <div ref={s1.ref} className={s1.cls}>
        {/* Stats + Graph — graph left, cards right, equal height */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

          {/* Stat cards — RIGHT, 2×2 grid stretching to full column height */}
          <div className="lg:col-span-5 grid grid-cols-2 grid-rows-2 gap-3 h-full">
            <LoadingShell loading={loading}>
              <StatCard
                label="Total invoices"
                value={loading ? '—' : stats.invoices.toLocaleString()}
                sub={loading ? '— · —' : `${stats.single} single · ${stats.multi} multi`}
              />
            </LoadingShell>
            <LoadingShell loading={loading}>
              <StatCard
                label="Settled"
                value={loading ? '—' : stats.paid.toLocaleString()}
                sub={loading ? '—' : stats.invoices > 0 ? `${stats.successRate}% success` : '—'}
                accent="text-emerald-400"
              />
            </LoadingShell>
            <LoadingShell loading={loading}>
              <StatCard
                label="Pending"
                value={loading ? '—' : stats.pending.toLocaleString()}
                sub={loading ? '—' :
                  [stats.cancelled > 0 ? `${stats.cancelled} cancelled` : '',
                   stats.expired   > 0 ? `${stats.expired} expired`     : '']
                  .filter(Boolean).join(' · ') || 'awaiting payment'
                }
                accent="text-amber-400"
              />
            </LoadingShell>
            <LoadingShell loading={loading}>
              <StatCard
                label="Unique wallets"
                value={loading ? '—' : stats.creators.toLocaleString()}
                sub={loading ? '—' :
                  `${stats.donations} donation${stats.donations !== 1 ? 's' : ''}`
                }
              />
            </LoadingShell>
          </div>

          {/* Activity graph — LEFT, larger column */}
          <div className="lg:col-span-7 h-full">
            <LoadingShell loading={loading}>
              <ActivityGraph events={events} />
            </LoadingShell>
          </div>
        </div>

        </div>{/* end s1 slide-in */}

        {/* Activity table */}
        <div ref={s2.ref} className={s2.cls}>
        <div className="bg-zinc-900/10 border border-zinc-800/40 overflow-hidden">

          {/* Table toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between
            gap-3 px-5 py-4 border-b border-zinc-800/60">
            <div className="flex items-center gap-3 flex-wrap">
              <LiveDot />
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                Activity
              </span>
              {!loading && (
                <span className="text-[10px] text-zinc-600 font-mono">
                  {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
              <button onClick={fetchEvents} disabled={loading}
                className="text-[10px] text-zinc-600 hover:text-zinc-400
                  disabled:opacity-40 transition-colors flex items-center gap-1.5
                  font-mono uppercase tracking-wide">
                <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 bg-zinc-950/80 border border-zinc-800/60
              p-1 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[10px] font-bold font-mono uppercase
                    tracking-wider transition-all whitespace-nowrap ${
                    tab === t
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-600 hover:text-zinc-300'
                  }`}>
                  {t}
                  {!loading && tabCount[t] > 0 && (
                    <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 font-mono ${
                      tab === t
                        ? 'bg-zinc-700 text-zinc-200'
                        : 'bg-zinc-900 text-zinc-600'
                    }`}>
                      {tabCount[t]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <LoadingShell loading={loading}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-zinc-800/60">
                    {['#','Tx Hash','Invoice / Page','Type','Status','Amount','Time'].map(h => (
                      <th key={h}
                        className="px-4 py-3 text-left text-[9px] font-bold
                          text-zinc-600 uppercase tracking-widest whitespace-nowrap font-mono">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} index={i}/>)
                  ) : filtered.length === 0 ? (
                    <EmptyState query={search} fetchError={fetchError}/>
                  ) : (
                    filtered.slice(0, 200).map((ev, i) => (
                      <ActivityRow key={`${ev.txHash}-${i}`} event={ev} index={i}/>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </LoadingShell>

          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-zinc-800/40">
              <span className="text-[10px] text-zinc-700 font-mono uppercase tracking-wide">
                {Math.min(filtered.length, 200).toLocaleString()} of{' '}
                {filtered.length.toLocaleString()} events
                <span className="ml-2 text-zinc-800">· refreshes every 15s</span>
              </span>
            </div>
          )}
        </div>

        </div>{/* end s2 slide-in */}

        {/* Contract address cards */}
        <div ref={s3.ref} className={s3.cls}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'USDC (Circle)', addr: addresses.USDC },
            { label: 'cUSDC',         addr: addresses.cUSDC },
            { label: 'PaymentRouter', addr: addresses.PaymentRouter },
            { label: 'DonationVault', addr: addresses.DonationVault },
          ].map(c => (
            <a key={c.label}
              href={`https://sepolia.etherscan.io/address/${c.addr}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between px-4 py-3
                bg-zinc-900/10 border border-zinc-800/40
                hover:border-sky-500/30 transition-all group">
              <div>
                <div className="text-[9px] text-zinc-600 mb-0.5 font-mono uppercase
                  tracking-widest">
                  {c.label}
                </div>
                <div className="text-xs font-mono text-zinc-500
                  group-hover:text-zinc-200 transition-colors">
                  {shortAddr(c.addr)}
                </div>
              </div>
              <svg className="w-3.5 h-3.5 text-zinc-700 group-hover:text-sky-400
                flex-shrink-0 transition-colors"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          ))}
        </div>

        {/* Footer meta */}
        <div className="text-center text-[10px] text-zinc-700 font-mono uppercase
          tracking-widest pt-2">
          Deployed{' '}
          {new Date(addresses.deployedAt).toLocaleDateString('en', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
          {' · '}Sepolia {addresses.chainId}
          {' · '}PaymentRouter v2
        </div>
        </div>{/* end s3 slide-in */}
      </div>
    </div>
  );
}