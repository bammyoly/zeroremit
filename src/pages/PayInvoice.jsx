// PayInvoice.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits } from 'viem';
import jsQR from 'jsqr';
import { useZamaEncrypt } from '../hooks/useZamaEncrypt';

import PaymentRouterArtifact    from '../contracts/PaymentRouter.json';
import ConfidentialUSDCArtifact from '../contracts/ConfidentialUSDC.json';
import addresses                from '../contracts/addresses.json';

const ROUTER_ADDRESS = addresses.PaymentRouter;
const CUSDC_ADDRESS  = addresses.cUSDC;
const USDC_ADDRESS   = addresses.USDC;
const ROUTER_ABI     = PaymentRouterArtifact.abi;
const CUSDC_ABI      = ConfidentialUSDCArtifact.abi;
const USDC_DECIMALS  = 6;
const ZERO_ADDRESS   = '0x0000000000000000000000000000000000000000';

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const INVOICE_TYPE   = ['Single',  'Multi'];

const FHE_PAY_GAS = 5_000_000n;

const CUSDC_HANDLE_ABI = [{
  name: 'confidentialBalanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'bytes32' }],
}];

// ── Helpers ───────────────────────────────────────────────────────────────────
const shortAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';

function timeUntil(ts) {
  const diff = Number(ts) - Math.floor(Date.now() / 1000);
  if (diff <= 0)    return 'Expired';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  return `${Math.floor(diff / 86400)}d left`;
}

function parseInvoiceInput(raw) {
  const trimmed = (raw ?? '').toString().trim();
  try {
    const url  = new URL(trimmed);
    const segs = url.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (/^0x[0-9a-fA-F]{64}$/.test(last)) return last;
  } catch {}
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed;
  return null;
}

// ── Shimmer styles ────────────────────────────────────────────────────────────
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
      .glow-pulse {
        animation: heroGlow 4s ease-in-out infinite;
      }
    `}</style>
  );
}

function LoadingShell({ loading, children }) {
  return (
    <div className="relative">
      <div className={loading
        ? 'skel-blur transition-all duration-500'
        : 'transition-all duration-500'}>
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

// ── UI atoms ──────────────────────────────────────────────────────────────────
function Spinner({ label, className = '' }) {
  return (
    <span className={`flex items-center justify-center gap-2 ${className}`}>
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-red-950/40 border border-red-900/30
      text-sm text-red-400 font-mono">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span className="text-xs">{message}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    Pending:   'bg-amber-950/60 text-amber-400 border-amber-900/40',
    Paid:      'bg-emerald-950/60 text-emerald-400 border-emerald-900/40',
    Cancelled: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40',
    Expired:   'bg-rose-950/60 text-rose-400 border-rose-900/40',
  };
  const dot = {
    Pending: 'bg-amber-400', Paid: 'bg-emerald-400',
    Cancelled: 'bg-zinc-600', Expired: 'bg-rose-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold font-mono
      px-2.5 py-0.5 border whitespace-nowrap uppercase tracking-widest
      ${cfg[status] || cfg.Pending}`}>
      <span className={`w-1.5 h-1.5 flex-shrink-0 ${dot[status] || dot.Pending}`} />
      {status}
    </span>
  );
}

// ── Step indicator (now 3 real steps: Details → Verify → Pay) ────────────────
function StepIndicator({ currentStep }) {
  const steps = [
    { num: 1, label: 'Details' },
    { num: 2, label: 'Verify'  },
    { num: 3, label: 'Pay'     },
  ];
  return (
    <div className="flex items-center justify-between mb-8 px-2">
      {steps.map((step, i) => {
        const isComplete = currentStep > step.num;
        const isActive   = currentStep === step.num;
        return (
          <React.Fragment key={step.num}>
            <div className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 flex items-center justify-center text-[10px]
                font-bold font-mono transition-all duration-300 border ${
                isComplete
                  ? 'bg-sky-500 text-white border-sky-400'
                  : isActive
                  ? 'bg-sky-600 text-white border-sky-500 shadow-lg shadow-sky-500/30'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800'
              }`}>
                {isComplete ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                  </svg>
                ) : step.num}
              </div>
              <span className={`text-[10px] uppercase tracking-widest font-bold font-mono ${
                isActive ? 'text-white' : isComplete ? 'text-zinc-400' : 'text-zinc-600'
              }`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 transition-all duration-300 ${
                currentStep > step.num ? 'bg-sky-500' : 'bg-zinc-800'
              }`}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Shield modal ──────────────────────────────────────────────────────────────
function ShieldModal({ usdcBalance, onShield, onClose, loading, loadingMsg, error, suggestedAmount }) {
  const [amount, setAmount] = useState(suggestedAmount ? suggestedAmount.toString() : '');
  const maxUsdc = usdcBalance !== null ? (Number(usdcBalance) / 1e6).toFixed(6) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
      bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono">
              Shield USDC
            </h3>
            <p className="text-[10px] text-zinc-500 mt-0.5 font-mono uppercase tracking-wide">
              Convert to confidential cUSDC
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="bg-zinc-950/60 p-3 border border-zinc-800/60">
            <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-widest font-mono font-bold">
              USDC
            </div>
            <div className="text-base font-bold text-zinc-200 font-mono tabular-nums">
              {usdcBalance !== null ? `${(Number(usdcBalance) / 1e6).toFixed(2)}` : '…'}
            </div>
          </div>
          <div className="bg-sky-500/5 p-3 border border-sky-500/20">
            <div className="text-[10px] text-sky-400 mb-1 uppercase tracking-widest font-mono font-bold">
              cUSDC
            </div>
            <div className="text-sm font-mono text-zinc-500 italic">encrypted</div>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-widest font-mono">
            Amount
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-zinc-500 font-mono">$</span>
            <input type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-14 pl-10 pr-16 bg-zinc-950 border border-zinc-800
                text-xl font-bold text-zinc-100 placeholder-zinc-700 font-mono
                focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20
                transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold
              text-zinc-600 font-mono uppercase tracking-widest">USDC</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            {suggestedAmount && (
              <button onClick={() => setAmount(suggestedAmount.toString())}
                className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors
                  font-mono uppercase tracking-wide">
                Use invoice amount (${suggestedAmount.toFixed(2)})
              </button>
            )}
            {maxUsdc && !suggestedAmount && (
              <button onClick={() => setAmount(maxUsdc)}
                className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors
                  font-mono uppercase tracking-wide">
                Use max ({(Number(usdcBalance) / 1e6).toFixed(2)} USDC)
              </button>
            )}
            {suggestedAmount && maxUsdc && (
              <button onClick={() => setAmount(maxUsdc)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors
                  font-mono uppercase tracking-wide">
                Max
              </button>
            )}
          </div>
        </div>

        {error && <div className="mb-4"><ErrorBox message={error} /></div>}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold font-mono
              text-[10px] uppercase tracking-widest border border-zinc-700 transition-all">
            Cancel
          </button>
          <button onClick={() => onShield(amount)}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 text-white font-bold font-mono
              text-[10px] uppercase tracking-widest transition-all active:scale-95
              disabled:opacity-50 shadow-lg shadow-sky-500/20">
            {loading ? <Spinner label={loadingMsg || 'Shielding…'} /> : 'Shield USDC'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Encrypted amount with decrypt button ─────────────────────────────────────
function EncryptedAmount({ value, canDecrypt, decrypting, onDecrypt, decryptError, isPublic, compact }) {
  if (value !== null && value !== undefined) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-900/30
          px-3 py-1.5">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
          </svg>
          <span className="text-sm font-bold text-emerald-300 font-mono tabular-nums">
            ${(Number(value) / 1e6).toFixed(2)}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-1 border border-zinc-800
          uppercase tracking-widest font-bold">
          cUSDC
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-sky-950/40 border border-sky-900/30
          px-3 py-1.5">
          <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <span className="text-xs font-bold text-sky-300 italic font-mono uppercase tracking-wide">
            {isPublic ? 'Hidden' : 'Encrypted'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-1 border border-zinc-800
          uppercase tracking-widest font-bold">
          cUSDC
        </span>
        {canDecrypt && (
          <button onClick={onDecrypt} disabled={decrypting}
            title={isPublic ? 'Public decrypt (anyone can view)' : 'Decrypt amount (authorized only)'}
            className="h-8 px-2.5 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30
              text-sky-300 transition-all disabled:opacity-50 flex items-center gap-1.5
              font-mono text-[10px] font-bold uppercase tracking-widest">
            {decrypting ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            )}
            {decrypting ? 'Wait' : (isPublic ? 'View' : 'Decrypt')}
          </button>
        )}
      </div>
      {decryptError && (
        <span className="text-[10px] text-red-400 max-w-[280px] text-right font-mono">{decryptError}</span>
      )}
    </div>
  );
}

// ── Multi item row ────────────────────────────────────────────────────────────
function ItemRow({ item, index, onPay, paying, invoiceStatus, canDecrypt, onDecryptItem, isPublic, canPay, showPayButton }) {
  const itemCanPay = invoiceStatus === 'Pending' && !item.paid && canPay && showPayButton;
  return (
    <div className={`flex items-center gap-3 p-4 border transition-all ${
      item.paid
        ? 'bg-emerald-950/10 border-emerald-900/30'
        : 'bg-zinc-950/40 border-zinc-800/60 hover:border-zinc-700/60'
    }`}>
      <div className={`w-7 h-7 flex items-center justify-center flex-shrink-0 ${
        item.paid ? 'bg-emerald-500' : 'bg-zinc-800/80 border border-zinc-700/60'
      }`}>
        {item.paid ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
          </svg>
        ) : (
          <span className="text-[10px] font-mono font-bold text-zinc-500">{index + 1}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-bold font-mono uppercase tracking-wide truncate ${
          item.paid ? 'text-zinc-500 line-through' : 'text-zinc-200'
        }`}>
          {item.description || `Item ${index + 1}`}
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1.5 font-mono">
          {item.decryptedAmount !== undefined && item.decryptedAmount !== null ? (
            <span className="text-emerald-400 font-bold tabular-nums">
              ${(Number(item.decryptedAmount) / 1e6).toFixed(2)} cUSDC
            </span>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <span className="uppercase tracking-widest text-[9px]">
                {isPublic ? 'Hidden amount' : 'Encrypted'}
              </span>
              {canDecrypt && (
                <button onClick={() => onDecryptItem(index)} disabled={item.decrypting}
                  className="ml-1 text-sky-400 hover:text-sky-300 underline underline-offset-2
                    text-[10px] uppercase tracking-wide font-bold">
                  {item.decrypting ? '…' : (isPublic ? 'view' : 'decrypt')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {itemCanPay && (
        <button onClick={() => onPay(index)} disabled={paying === index}
          className="px-4 h-9 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold
            font-mono uppercase tracking-widest transition-all active:scale-95
            disabled:opacity-50 whitespace-nowrap shadow-md shadow-sky-500/20">
          {paying === index ? <Spinner label="Paying…" /> : 'Pay'}
        </button>
      )}
      {item.paid && (
        <span className="text-[10px] text-emerald-400 font-bold font-mono uppercase tracking-widest">
          Settled
        </span>
      )}
    </div>
  );
}

// ── QR Upload helper ─────────────────────────────────────────────────────────
async function decodeQRFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) resolve(code.data);
        else reject(new Error('No QR code found in image'));
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function PayInvoice() {
  const { invoiceId: paramId }   = useParams();
  const navigate                  = useNavigate();
  const { address, isConnected } = useAccount();
  const { open }                  = useAppKit();
  const publicClient              = usePublicClient();
  const { data: walletClient }   = useWalletClient();
  const { decryptHandle, publicDecryptHandle, sdkReady, sdkError } = useZamaEncrypt();
  const fileInputRef              = useRef(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [linkInput,   setLinkInput]   = useState('');
  const [linkError,   setLinkError]   = useState('');
  const [resolving,   setResolving]   = useState(false);
  const [uploadingQR, setUploadingQR] = useState(false);

  const [activeId,   setActiveId]   = useState(paramId || null);
  const [invoice,    setInvoice]    = useState(null);
  const [items,      setItems]      = useState([]);
  const [fetching,   setFetching]   = useState(!!paramId);
  const [fetchError, setFetchError] = useState('');

  // NEW: Checkout step (1 = Details, 2 = Verify, 3 = Pay)
  const [checkoutStep, setCheckoutStep] = useState(1);

  const [paying,        setPaying]        = useState(null);
  const [payError,      setPayError]      = useState('');
  const [payTxHash,     setPayTxHash]     = useState('');
  const [payLoadingMsg, setPayLoadingMsg] = useState('');
  const [paid,          setPaid]          = useState(false);
  const [payerNote,     setPayerNote]     = useState('');

  const [showShield,  setShowShield]  = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [shielding,   setShielding]   = useState(false);
  const [shieldMsg,   setShieldMsg]   = useState('');
  const [shieldError, setShieldError] = useState('');

  const [decryptedAmount, setDecryptedAmount] = useState(null);
  const [decrypting,      setDecrypting]      = useState(false);
  const [decryptError,    setDecryptError]    = useState('');

  // NEW: cUSDC balance state
  const [cusdcHandle,    setCusdcHandle]    = useState(null);
  const [cusdcBalance,   setCusdcBalance]   = useState(null);
  const [cusdcDecrypting, setCusdcDecrypting] = useState(false);
  const [cusdcError,     setCusdcError]     = useState('');

  // ── Fetch invoice ─────────────────────────────────────────────────────────
  const fetchInvoice = useCallback(async (id) => {
    if (!publicClient || !id) return;
    setFetching(true);
    setFetchError('');
    setInvoice(null);
    setItems([]);
    setDecryptedAmount(null);
    setDecryptError('');
    setCheckoutStep(1);
    try {
      const data = await publicClient.readContract({
        address: ROUTER_ADDRESS, abi: ROUTER_ABI,
        functionName: 'getInvoice', args: [id],
      });
      const [creator, recipient, kind, status, title, memo, createdAt, dueAt, itemCount, paidItems] = data;
      const inv = {
        creator, recipient,
        kind: Number(kind), status: Number(status),
        title, memo, createdAt, dueAt,
        itemCount: Number(itemCount), paidItems: Number(paidItems),
      };

      if (Number(itemCount) > 0) {
        const [descriptions, paidStatus, paidByList, paidAtList, amountHandles] =
          await publicClient.readContract({
            address: ROUTER_ADDRESS, abi: ROUTER_ABI,
            functionName: 'getAllItems', args: [id],
          });

        const parsedItems = descriptions.map((desc, i) => ({
          description:      desc,
          paid:             paidStatus[i],
          paidBy:           paidByList[i],
          paidAt:           paidAtList[i],
          encryptedAmount:  amountHandles[i],
          decryptedAmount:  null,
          decrypting:       false,
        }));
        setItems(parsedItems);

        if (Number(kind) === 0) {
          inv.encryptedAmount = parsedItems[0]?.encryptedAmount;
        }
      }

      setInvoice(inv);
    } catch (e) {
      console.error('[fetchInvoice]', e);
      setFetchError('Invoice not found or could not be loaded.');
    } finally {
      setFetching(false);
    }
  }, [publicClient]);

  useEffect(() => {
    if (paramId) {
      setActiveId(paramId);
      setLinkInput('');
      setLinkError('');
      setPaid(false);
      setPayTxHash('');
      setPayError('');
      setCheckoutStep(1);
      fetchInvoice(paramId);
    } else {
      setActiveId(null);
      setInvoice(null);
      setItems([]);
      setFetchError('');
      setPaid(false);
      setPayTxHash('');
      setPayError('');
      setDecryptedAmount(null);
      setCheckoutStep(1);
    }
  }, [paramId, fetchInvoice]);

  // ── USDC balance fetch ───────────────────────────────────────────────────
  const refreshUsdcBalance = useCallback(async () => {
    if (!publicClient || !address) return;
    try {
      const bal = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'balanceOf', args: [address],
      });
      setUsdcBalance(bal);
    } catch {}
  }, [publicClient, address]);

  useEffect(() => { refreshUsdcBalance(); }, [refreshUsdcBalance]);

  // ── cUSDC handle fetch ───────────────────────────────────────────────────
  const refreshCusdcHandle = useCallback(async () => {
    if (!publicClient || !address) return;
    try {
      const h = await publicClient.readContract({
        address: CUSDC_ADDRESS, abi: CUSDC_HANDLE_ABI,
        functionName: 'confidentialBalanceOf', args: [address],
      });
      const isZero = BigInt(h) === 0n;
      setCusdcHandle(isZero ? null : h);
      setCusdcBalance(null);
    } catch (e) {
      console.warn('[cusdc handle]', e?.message);
      setCusdcHandle(null);
    }
  }, [publicClient, address]);

  useEffect(() => { refreshCusdcHandle(); }, [refreshCusdcHandle]);

  // ── Access control ──────────────────────────────────────────────────────
  const isMulti  = invoice?.kind === 1;
  const isSingle = invoice?.kind === 0;

  const isCreator = isConnected && invoice && address &&
    invoice.creator.toLowerCase() === address.toLowerCase();

  const isNamedRecipient = isConnected && invoice && address &&
    invoice.recipient !== ZERO_ADDRESS &&
    invoice.recipient.toLowerCase() === address.toLowerCase();

  // Decryption rights:
  //   SINGLE — only creator + named recipient
  //   MULTI  — anyone (publicly decryptable)
  const canDecrypt = isMulti ? true : (isCreator || isNamedRecipient);

  // Payment rights:
  //   SINGLE — only the named recipient
  //   MULTI  — anyone except the creator
  const canPay = invoice && (isMulti
    ? (isConnected && !isCreator)
    : isNamedRecipient
  );

  // Total invoice amount (sum of decrypted item amounts, if available)
  const decryptedInvoiceTotal = React.useMemo(() => {
    if (isSingle && decryptedAmount !== null) {
      return Number(decryptedAmount) / 1e6;
    }
    if (isMulti) {
      const unpaidItems = items.filter(it => !it.paid);
      if (unpaidItems.every(it => it.decryptedAmount !== null && it.decryptedAmount !== undefined)) {
        const sum = unpaidItems.reduce((acc, it) => acc + Number(it.decryptedAmount), 0);
        return sum / 1e6;
      }
    }
    return null;
  }, [isSingle, isMulti, decryptedAmount, items]);

  // cUSDC sufficient?
  const cusdcSufficient = cusdcBalance !== null && decryptedInvoiceTotal !== null
    ? Number(cusdcBalance) / 1e6 >= decryptedInvoiceTotal
    : null;

  // ── Resolver handlers ─────────────────────────────────────────────────────
  const handleResolveLink = async (e) => {
    e?.preventDefault();
    setLinkError('');
    const id = parseInvoiceInput(linkInput);
    if (!id) { setLinkError('Paste a valid invoice link or bytes32 ID'); return; }
    setResolving(true);
    navigate(`/pay/${id}`);
    setResolving(false);
  };

  const handleQRUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLinkError('');
    setUploadingQR(true);
    try {
      const data = await decodeQRFromFile(file);
      const id   = parseInvoiceInput(data);
      if (id) {
        navigate(`/pay/${id}`);
      } else {
        setLinkInput(data);
        setLinkError('QR decoded, but did not contain a valid invoice link.');
      }
    } catch (err) {
      setLinkError(err.message || 'Could not decode QR from image');
    } finally {
      setUploadingQR(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = () => navigate('/pay');

  // ── Decrypt handlers ──────────────────────────────────────────────────────
  const handleDecryptMain = async () => {
    if (!invoice?.encryptedAmount) return;
    setDecryptError('');
    setDecrypting(true);
    try {
      let value;
      if (isMulti) {
        value = await publicDecryptHandle(invoice.encryptedAmount);
      } else {
        if (!canDecrypt) throw new Error('Not authorized to decrypt this amount');
        value = await decryptHandle(invoice.encryptedAmount, ROUTER_ADDRESS);
      }
      setDecryptedAmount(value);
    } catch (e) {
      console.error('[handleDecryptMain]', e);
      setDecryptError(e.shortMessage || e.message || 'Decryption failed');
    } finally {
      setDecrypting(false);
    }
  };

  const handleDecryptItem = async (idx) => {
    const item = items[idx];
    if (!item?.encryptedAmount) return;

    setItems(prev => prev.map((it, i) => i === idx ? { ...it, decrypting: true } : it));
    try {
      let value;
      if (isMulti) {
        value = await publicDecryptHandle(item.encryptedAmount);
      } else {
        if (!canDecrypt) throw new Error('Not authorized to decrypt');
        value = await decryptHandle(item.encryptedAmount, ROUTER_ADDRESS);
      }
      setItems(prev => prev.map((it, i) =>
        i === idx ? { ...it, decrypting: false, decryptedAmount: value } : it
      ));
    } catch (e) {
      console.error('[handleDecryptItem]', e);
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, decrypting: false } : it));
      setDecryptError(e.shortMessage || e.message || 'Decryption failed');
    }
  };

  // ── cUSDC decrypt ────────────────────────────────────────────────────────
  const handleDecryptCusdc = async () => {
    if (!cusdcHandle || !sdkReady) return;
    setCusdcError('');
    setCusdcDecrypting(true);
    try {
      const val = await decryptHandle(cusdcHandle, CUSDC_ADDRESS);
      setCusdcBalance(val);
    } catch (e) {
      setCusdcError(e.shortMessage || e.message || 'Decryption failed');
    } finally {
      setCusdcDecrypting(false);
    }
  };

  // ── Shield handler ────────────────────────────────────────────────────────
  const handleShield = async (amount) => {
    if (!amount || parseFloat(amount) <= 0) { setShieldError('Enter a valid amount'); return; }
    setShieldError(''); setShielding(true);
    try {
      const amt = parseUnits(amount, USDC_DECIMALS);
      setShieldMsg('Approve USDC…');
      const approveTx = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable',
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ name: '', type: 'bool' }] }],
        functionName: 'approve', args: [CUSDC_ADDRESS, amt],
      });
      setShieldMsg('Waiting for approval…');
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      setShieldMsg('Confirm shield…');
      const wrapTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_ABI,
        functionName: 'wrap', args: [address, amt],
      });
      setShieldMsg('Finalising…');
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });

      await refreshUsdcBalance();
      await refreshCusdcHandle();
      setShowShield(false);
    } catch (e) {
      setShieldError(e.shortMessage || e.message || 'Shield failed');
    } finally {
      setShielding(false); setShieldMsg('');
    }
  };

  // ── Pay handler ────────────────────────────────────────────────────────────
  const handlePay = async (itemIndex = 0) => {
    setPayError('');
    setPaying(itemIndex);
    try {
      setPayLoadingMsg('Authorizing router…');
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const opTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS, abi: CUSDC_ABI,
        functionName: 'setOperator',
        args: [ROUTER_ADDRESS, expiry],
        gas: 200_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: opTx });

      setPayLoadingMsg('Confirm payment in wallet…');
      const hash = await walletClient.writeContract({
        address: ROUTER_ADDRESS, abi: ROUTER_ABI,
        functionName: 'payItem',
        args: [activeId, BigInt(itemIndex)],
        gas: FHE_PAY_GAS,
      });

      setPayTxHash(hash);
      setPayLoadingMsg('Confirming on-chain…');
      await publicClient.waitForTransactionReceipt({ hash });

      if (isSingle) {
        setInvoice(inv => ({ ...inv, status: 1, paidItems: 1 }));
        setItems(prev => prev.map((it, i) => i === 0
          ? { ...it, paid: true, paidBy: address, paidAt: BigInt(Math.floor(Date.now()/1000)) }
          : it));
        setPaid(true);
      } else {
        setItems(prev => prev.map((it, i) => i === itemIndex
          ? { ...it, paid: true, paidBy: address, paidAt: BigInt(Math.floor(Date.now()/1000)) }
          : it));
        setInvoice(inv => {
          const newPaid = inv.paidItems + 1;
          const isAllPaid = newPaid === inv.itemCount;
          if (isAllPaid) setPaid(true);
          return { ...inv, paidItems: newPaid, status: isAllPaid ? 1 : 0 };
        });
      }
      // Refresh cUSDC after pay
      await refreshCusdcHandle();
    } catch (e) {
      const msg = e.shortMessage || e.message || 'Payment failed';
      console.error('[handlePay]', e);

      if (msg.includes('NotAuthorizedPayer')) {
        setPayError('Only the named recipient can pay this single invoice.');
      } else if (msg.includes('CannotPaySelf')) {
        setPayError('You cannot pay an invoice you created.');
      } else if (msg.includes('AlreadyPaid') || msg.includes('ItemAlreadyPaid')) {
        setPayError('This item has already been paid.');
      } else if (msg.includes('Expired')) {
        setPayError('This invoice has expired.');
      } else if (msg.includes('AlreadyCancelled')) {
        setPayError('This invoice was cancelled.');
      } else if (msg.includes('user rejected') || msg.includes('User rejected')) {
        setPayError('Transaction cancelled.');
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        setPayError('Insufficient cUSDC balance. Shield some USDC first.');
      } else if (msg.includes('JSON-RPC') || msg.includes('not supported')) {
        setPayError('RPC error. Check your wallet is on Sepolia.');
      } else {
        setPayError(msg);
      }
    } finally {
      setPaying(null);
      setPayLoadingMsg('');
    }
  };

  const invoiceStatus = invoice ? (INVOICE_STATUS[invoice.status] ?? 'Pending') : null;
  const invoiceType   = invoice ? (INVOICE_TYPE[invoice.kind]     ?? 'Single')  : null;

  // ────────────────────────────────────────────────────────────────────────
  // MODE A — Resolver
  // ────────────────────────────────────────────────────────────────────────
  if (!activeId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider
        selection:bg-sky-400 selection:text-zinc-950">
        <ShimmerStyle />

        {/* Hero */}
        <section className="relative pt-32 pb-20 px-4 overflow-hidden
          border-b border-zinc-900/60 text-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]
            bg-sky-500/5 blur-[120px] rounded-full pointer-events-none glow-pulse" />
          <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[400px] h-[200px]
            bg-blue-600/4 blur-[80px] rounded-full pointer-events-none" />
          <div className="absolute inset-0 opacity-[0.025] pointer-events-none
            bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute top-0 inset-x-0 h-px
            bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 h-24
            bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />

          <div className="max-w-4xl mx-auto relative z-10">
            <h1 className="text-4xl sm:text-6xl lg:text-5xl font-bold
              tracking-tighter text-white leading-[1.05] mb-6 uppercase">
              Pay <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400
                bg-clip-text text-transparent">Invoice</span>
            </h1>

            <p className="text-sm text-zinc-400 max-w-xl mx-auto
              leading-relaxed font-sans normal-case mb-10">
              Paste a payment link, enter an invoice ID, or upload a QR code image
              to view and pay any Zeroremit invoice confidentially.
            </p>

            {/* Resolver Card */}
            <div className="max-w-2xl mx-auto">
              <div className="bg-zinc-900/10 border border-zinc-800/40 p-6">
                <form onSubmit={handleResolveLink} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 mb-2 block uppercase
                      tracking-widest text-left">
                      Payment link or invoice ID
                    </label>
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4
                        text-zinc-500 pointer-events-none"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                      </svg>
                      <input type="text" value={linkInput}
                        onChange={e => { setLinkInput(e.target.value); setLinkError(''); }}
                        placeholder="https://zeroremit.app/pay/0x… or 0x…"
                        className="w-full h-12 pl-11 pr-4 bg-zinc-950/80 border border-zinc-800
                          text-sm text-zinc-200 placeholder-zinc-600 font-sans normal-case
                          focus:outline-none focus:border-sky-500/60 focus:ring-1
                          focus:ring-sky-500/30 transition-all"
                      />
                    </div>
                  </div>

                  {linkError && <ErrorBox message={linkError} />}

                  <input ref={fileInputRef} type="file" accept="image/*"
                    onChange={handleQRUpload} className="hidden"
                  />

                  {/* Buttons — grid layout so they stay equal width on mobile too */}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingQR}
                      className="h-12 px-3 sm:px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200
                        font-bold text-[10px] uppercase tracking-widest border border-zinc-700
                        transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      {uploadingQR ? (
                        <Spinner label="Reading…" />
                      ) : (
                        <>
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                          </svg>
                          <span className="whitespace-nowrap">Upload QR</span>
                        </>
                      )}
                    </button>
                    <button type="submit" disabled={resolving || !linkInput.trim()}
                      className="h-12 px-3 sm:px-5 bg-sky-500 hover:bg-sky-400 text-white font-bold
                        text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]
                        disabled:opacity-50 shadow-lg shadow-sky-500/20 whitespace-nowrap">
                      {resolving ? <Spinner label="Loading…" /> : 'Continue →'}
                    </button>
                  </div>

                  <p className="text-[10px] text-zinc-600 text-center font-mono uppercase tracking-wide pt-1">
                    Upload a screenshot or saved QR image from your gallery
                  </p>
                </form>
              </div>
            </div>

            <div className="text-center space-y-1 mt-8">
              <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wide">
                Need to create an invoice instead?
              </p>
              <a href="/create"
                className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors
                  font-mono uppercase tracking-widest font-bold">
                Create new invoice →
              </a>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 pt-8">
          <p className="text-center text-[10px] text-zinc-700 font-mono uppercase
            tracking-widest flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            All amounts encrypted with Zama FHE · Sepolia
          </p>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // MODE B — Checkout (Step-driven)
  // ────────────────────────────────────────────────────────────────────────

  // Effective step (after paid jump to step 3)
  const effectiveStep = paid ? 3 : checkoutStep;

  // Continue button gating
  const canContinueFromDetails = isConnected && canPay && invoiceStatus === 'Pending';
  const canContinueFromVerify  = isConnected && canPay && invoiceStatus === 'Pending' &&
    decryptedInvoiceTotal !== null && cusdcSufficient === true;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider
      selection:bg-sky-400 selection:text-zinc-950 relative overflow-hidden">
      <ShimmerStyle />

      {/* Background effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]
        bg-sky-500/5 blur-[120px] rounded-full pointer-events-none glow-pulse"/>
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none
        bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-0 inset-x-0 h-px
        bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />

      {showShield && (
        <ShieldModal usdcBalance={usdcBalance} onShield={handleShield}
          onClose={() => { setShowShield(false); setShieldError(''); }}
          loading={shielding} loadingMsg={shieldMsg} error={shieldError}
          suggestedAmount={decryptedInvoiceTotal}
        />
      )}

      {/* Sticky nav bar */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky mt-20 top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleClear}
              className="text-sky-400 hover:text-sky-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <h1 className="text-xs font-bold text-zinc-100 uppercase tracking-widest">
              Checkout
            </h1>
          </div>
          {invoice && <StatusBadge status={invoiceStatus} />}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 relative z-10">

        {/* Loading state */}
        {fetching && (
          <LoadingShell loading={true}>
            <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-20 text-center">
              <Spinner label="Loading invoice…" className="text-zinc-500" />
              <p className="text-[10px] text-zinc-700 mt-3 font-mono uppercase tracking-wide">
                {activeId?.slice(0, 18)}…
              </p>
            </div>
          </LoadingShell>
        )}

        {/* Error state */}
        {!fetching && fetchError && (
          <div className="bg-zinc-900/10 border border-zinc-800/40 px-5 py-16 text-center">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20
              flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h3 className="text-sm font-bold text-zinc-200 mb-1 uppercase tracking-wider">
              Invoice not found
            </h3>
            <p className="text-xs text-zinc-500 mb-6 font-sans normal-case">{fetchError}</p>
            <button onClick={handleClear}
              className="px-5 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-200
                font-bold text-[10px] uppercase tracking-widest border border-zinc-700
                transition-all">
              ← Try another link
            </button>
          </div>
        )}

        {/* Invoice loaded */}
        {!fetching && invoice && (
          <div className="bg-zinc-900/10 border border-zinc-800/40 p-6 sm:p-8">
            <StepIndicator currentStep={effectiveStep} />

            {/* ═══ STEP 1 — DETAILS ═══ */}
            {effectiveStep === 1 && (
              <div className="space-y-6">
                <div className="text-center pb-2">
                  <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-wider font-mono">
                    Invoice Details
                  </h2>
                  <p className="text-xs text-zinc-500 mt-2 font-sans normal-case max-w-md mx-auto">
                    Review the invoice details below. {canPay
                      ? 'Continue when you are ready to verify and pay.'
                      : isCreator ? 'You created this invoice.'
                      : 'Only the designated payer can settle this invoice.'}
                  </p>
                </div>

                {/* Invoice info card */}
                <div className="bg-zinc-950/40 border border-zinc-800/60 p-5 space-y-4">

                  <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                      Pay to (Creator)
                    </span>
                    <a href={`https://sepolia.etherscan.io/address/${invoice.creator}`}
                      target="_blank" rel="noreferrer"
                      className="font-mono text-xs text-zinc-300 hover:text-sky-300 transition-colors
                        bg-zinc-900 px-2.5 py-1 border border-zinc-800">
                      {shortAddr(invoice.creator)}
                    </a>
                  </div>

                  {isSingle && (
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                        Named Payer
                      </span>
                      <a href={`https://sepolia.etherscan.io/address/${invoice.recipient}`}
                        target="_blank" rel="noreferrer"
                        className="font-mono text-xs text-zinc-300 hover:text-sky-300 transition-colors
                          bg-zinc-900 px-2.5 py-1 border border-zinc-800">
                        {shortAddr(invoice.recipient)}
                      </a>
                    </div>
                  )}

                  {isMulti && (
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                        Payer
                      </span>
                      <span className="text-[10px] text-sky-300 bg-sky-500/10 border border-sky-500/20
                        px-2.5 py-1 font-bold font-mono uppercase tracking-widest">
                        Open · Anyone
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between pb-4 border-b border-zinc-800/60">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono pt-0.5">
                      Invoice Title
                    </span>
                    <span className="text-sm font-bold text-zinc-100 text-right max-w-[60%] font-mono">
                      {invoice.title}
                    </span>
                  </div>

                  {/* SINGLE amount — decrypt only if creator/recipient */}
                  {isSingle && (
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                        Amount
                      </span>
                      <EncryptedAmount
                        value={decryptedAmount}
                        canDecrypt={canDecrypt && sdkReady}
                        decrypting={decrypting}
                        onDecrypt={handleDecryptMain}
                        decryptError={decryptError}
                        isPublic={false}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                      Type
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 font-mono font-bold uppercase
                      tracking-widest border ${
                      invoice.kind === 0
                        ? 'bg-zinc-900/60 text-zinc-400 border-zinc-800/60'
                        : 'bg-sky-950/60 text-sky-400 border-sky-900/40'
                    }`}>
                      {invoiceType}
                    </span>
                  </div>

                  {invoice.dueAt && Number(invoice.dueAt) > 0 && (
                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800/60">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                        Due
                      </span>
                      <span className={`text-xs font-bold font-mono ${
                        Number(invoice.dueAt) < Date.now() / 1000 ? 'text-rose-400' : 'text-zinc-300'
                      }`}>{timeUntil(invoice.dueAt)}</span>
                    </div>
                  )}

                  {isMulti && (
                    <div className="pt-4 border-t border-zinc-800/60">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                          Progress
                        </span>
                        <span className="text-[10px] font-bold text-zinc-300 font-mono">
                          {invoice.paidItems} of {invoice.itemCount} settled
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-sky-500 transition-all duration-500"
                          style={{ width: `${(invoice.paidItems / invoice.itemCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {invoice.memo && (
                    <div className="pt-4 border-t border-zinc-800/60">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono mb-1.5">
                        Memo
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed font-sans normal-case">
                        {invoice.memo}
                      </p>
                    </div>
                  )}
                </div>

                {/* Multi line items — view only on step 1 (no pay buttons) */}
                {isMulti && items.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500
                      font-mono mb-2 px-1">
                      Line items
                    </div>
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <ItemRow key={i} item={item} index={i}
                          onPay={handlePay} paying={paying} invoiceStatus={invoiceStatus}
                          canDecrypt={sdkReady}
                          onDecryptItem={handleDecryptItem}
                          isPublic={true}
                          canPay={canPay}
                          showPayButton={false}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Connect wallet prompt */}
                {!isConnected && (
                  <div className="bg-zinc-950/40 border border-zinc-800/60 p-5 text-center space-y-3">
                    <p className="text-xs text-zinc-400 font-sans normal-case">
                      Connect your wallet to verify if you can pay this invoice.
                    </p>
                    <button onClick={() => open()}
                      className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-white
                        font-bold text-[10px] uppercase tracking-widest transition-all
                        active:scale-[0.98] shadow-lg shadow-sky-500/20">
                      Connect Wallet
                    </button>
                  </div>
                )}

                {/* Creator notice */}
                {isCreator && invoiceStatus === 'Pending' && (
                  <div className="px-4 py-4 bg-sky-500/5 border border-sky-500/20
                    text-xs text-sky-300 text-center font-sans normal-case">
                    You created this invoice. {isMulti
                      ? 'Anyone with the link can pay items.'
                      : 'Only the named recipient can pay it.'}
                  </div>
                )}

                {/* Can't pay notice */}
                {isConnected && !canPay && !isCreator && invoiceStatus === 'Pending' && isSingle && (
                  <div className="px-4 py-4 bg-amber-500/5 border border-amber-500/20
                    text-xs text-amber-300 text-center font-sans normal-case">
                    Only the named recipient can pay this invoice.
                    You can still view the details.
                  </div>
                )}

                {/* Status notices */}
                {invoiceStatus === 'Cancelled' && (
                  <div className="px-4 py-4 bg-zinc-950/40 border border-zinc-800/60
                    text-xs text-zinc-500 text-center font-mono uppercase tracking-wide">
                    This invoice was cancelled by the creator.
                  </div>
                )}
                {invoiceStatus === 'Expired' && (
                  <div className="px-4 py-4 bg-rose-950/20 border border-rose-900/30
                    text-xs text-rose-400 text-center font-mono uppercase tracking-wide">
                    This invoice has expired.
                  </div>
                )}
                {invoiceStatus === 'Paid' && (
                  <div className="px-4 py-4 bg-emerald-950/20 border border-emerald-900/30
                    text-xs text-emerald-400 text-center font-mono">
                    ✓ This invoice has already been fully settled.
                  </div>
                )}

                {/* Continue button — only for payers on pending invoices */}
                {canContinueFromDetails && (
                  <button onClick={() => setCheckoutStep(2)}
                    className="w-full h-14 bg-sky-500 hover:bg-sky-400 text-white font-bold
                      text-xs uppercase tracking-widest transition-all active:scale-[0.98]
                      shadow-xl shadow-sky-500/20 font-mono flex items-center
                      justify-center gap-2">
                    Continue to Verify
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* ═══ STEP 2 — VERIFY ═══ */}
            {effectiveStep === 2 && (
              <div className="space-y-6">
                <div className="text-center pb-2">
                  <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-wider font-mono">
                    Verify & Prepare
                  </h2>
                  <p className="text-xs text-zinc-500 mt-2 font-sans normal-case max-w-md mx-auto">
                    Decrypt the invoice amount and confirm you have sufficient cUSDC balance to pay.
                  </p>
                </div>

                {/* Connected wallet */}
                <div className="bg-zinc-950/40 border border-zinc-800/60 p-5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500
                    font-mono mb-3">
                    Connected Wallet
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse"/>
                      <span className="text-xs font-mono text-zinc-300">{shortAddr(address)}</span>
                    </div>
                    {isNamedRecipient && (
                      <span className="text-[10px] uppercase tracking-widest font-bold
                        text-emerald-300 bg-emerald-950/40 px-2 py-0.5 border border-emerald-900/30 font-mono">
                        Payer
                      </span>
                    )}
                    {isMulti && !isCreator && isConnected && !isNamedRecipient && (
                      <span className="text-[10px] uppercase tracking-widest font-bold
                        text-sky-300 bg-sky-950/40 px-2 py-0.5 border border-sky-900/30 font-mono">
                        Open Payer
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount verification */}
                <div className="bg-zinc-950/40 border border-zinc-800/60 p-5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500
                    font-mono mb-3">
                    Invoice Amount
                  </div>

                  {isSingle && (
                    <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800">
                      <span className="text-xs text-zinc-400 font-mono uppercase tracking-wide">
                        Total Due
                      </span>
                      <EncryptedAmount
                        value={decryptedAmount}
                        canDecrypt={canDecrypt && sdkReady}
                        decrypting={decrypting}
                        onDecrypt={handleDecryptMain}
                        decryptError={decryptError}
                        isPublic={false}
                      />
                    </div>
                  )}

                  {isMulti && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wide pb-2">
                        Decrypt each line item to see total due
                      </p>
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <ItemRow key={i} item={item} index={i}
                            onPay={handlePay} paying={paying} invoiceStatus={invoiceStatus}
                            canDecrypt={sdkReady}
                            onDecryptItem={handleDecryptItem}
                            isPublic={true}
                            canPay={canPay}
                            showPayButton={false}
                          />
                        ))}
                      </div>
                      {decryptedInvoiceTotal !== null && (
                        <div className="flex items-center justify-between p-3 bg-zinc-900
                          border border-emerald-900/30 mt-3">
                          <span className="text-xs text-zinc-300 font-mono uppercase tracking-wide font-bold">
                            Total Unpaid
                          </span>
                          <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
                            ${decryptedInvoiceTotal.toFixed(2)} cUSDC
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* cUSDC balance check */}
                <div className="bg-zinc-950/40 border border-zinc-800/60 p-5">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500
                    font-mono mb-3">
                    Your cUSDC Balance
                  </div>

                  {!cusdcHandle ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800">
                        <span className="text-xs text-zinc-400 font-mono uppercase tracking-wide">
                          Available
                        </span>
                        <span className="text-sm font-bold text-zinc-500 font-mono tabular-nums">
                          $0.00 cUSDC
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-400 font-mono uppercase tracking-wide">
                        ⚠ No shielded balance. Shield USDC to proceed.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800">
                        <span className="text-xs text-zinc-400 font-mono uppercase tracking-wide">
                          Available
                        </span>
                        {cusdcBalance !== null ? (
                          <span className={`text-sm font-bold font-mono tabular-nums ${
                            cusdcSufficient === false ? 'text-rose-400' : 'text-emerald-400'
                          }`}>
                            ${(Number(cusdcBalance) / 1e6).toFixed(2)} cUSDC
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-sky-300 italic tracking-wider">
                              ••••••
                            </span>
                            <button onClick={handleDecryptCusdc} disabled={cusdcDecrypting || !sdkReady}
                              className="h-8 px-2.5 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30
                                text-sky-300 transition-all disabled:opacity-50 flex items-center gap-1.5
                                font-mono text-[10px] font-bold uppercase tracking-widest">
                              {cusdcDecrypting ? (
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                              )}
                              {cusdcDecrypting ? 'Wait' : 'Decrypt'}
                            </button>
                          </div>
                        )}
                      </div>

                      {cusdcError && <ErrorBox message={cusdcError} />}

                      {cusdcBalance !== null && decryptedInvoiceTotal !== null && (
                        cusdcSufficient ? (
                          <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-wide
                            flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                            </svg>
                            Sufficient balance — ready to pay
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wide">
                              ⚠ Insufficient — need ${(decryptedInvoiceTotal - Number(cusdcBalance) / 1e6).toFixed(2)} more
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* USDC public balance */}
                  {usdcBalance !== null && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/40">
                      <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                        USDC (public)
                      </span>
                      <span className="text-xs text-zinc-400 font-mono tabular-nums">
                        ${(Number(usdcBalance) / 1e6).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Shield button — show if insufficient or no handle */}
                  {(cusdcSufficient === false || !cusdcHandle) && (
                    <button onClick={() => { setShieldError(''); setShowShield(true); }}
                      className="w-full mt-4 h-11 bg-sky-500 hover:bg-sky-400 text-white
                        font-bold text-[10px] uppercase tracking-widest border border-sky-400
                        transition-all flex items-center justify-center gap-2 font-mono
                        active:scale-[0.98] shadow-lg shadow-sky-500/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                      Shield USDC → cUSDC
                    </button>
                  )}
                </div>

                {sdkError && <ErrorBox message={`Zama SDK: ${sdkError}`} />}

                {/* Step nav buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setCheckoutStep(1)}
                    className="h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold
                      text-[10px] uppercase tracking-widest border border-zinc-700
                      transition-all flex items-center justify-center gap-2 font-mono">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 17l-5-5m0 0l5-5m-5 5h12"/>
                    </svg>
                    Back
                  </button>
                  <button onClick={() => setCheckoutStep(3)}
                    disabled={!canContinueFromVerify}
                    className="h-12 bg-sky-500 hover:bg-sky-400 text-white font-bold
                      text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]
                      disabled:opacity-40 disabled:cursor-not-allowed
                      shadow-lg shadow-sky-500/20 font-mono flex items-center justify-center gap-2">
                    Continue
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                    </svg>
                  </button>
                </div>

                {!canContinueFromVerify && (
                  <p className="text-[10px] text-zinc-600 text-center font-mono uppercase tracking-wide">
                    {decryptedInvoiceTotal === null
                      ? 'Decrypt the invoice amount to proceed'
                      : cusdcBalance === null
                      ? 'Decrypt your cUSDC balance to verify'
                      : !cusdcSufficient
                      ? 'Shield more USDC to continue'
                      : 'Complete verification to continue'}
                  </p>
                )}
              </div>
            )}

            {/* ═══ STEP 3 — PAY ═══ */}
            {effectiveStep === 3 && (
              <div className="space-y-6">
                <div className="text-center pb-2">
                  <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-wider font-mono">
                    {paid ? 'Payment Complete' : 'Confirm Payment'}
                  </h2>
                  {!paid && (
                    <p className="text-xs text-zinc-500 mt-2 font-sans normal-case max-w-md mx-auto">
                      Review and confirm. {isSingle
                        ? 'A single transaction will settle this invoice.'
                        : 'Pay each line item to settle the invoice.'}
                    </p>
                  )}
                </div>

                {!paid && (
                  <>
                    {/* Summary card */}
                    <div className="bg-zinc-950/40 border border-zinc-800/60 p-5 space-y-3">
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                          Paying to
                        </span>
                        <span className="text-xs font-mono text-zinc-300 bg-zinc-900 px-2 py-1 border border-zinc-800">
                          {shortAddr(invoice.creator)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                          Invoice
                        </span>
                        <span className="text-xs font-bold text-zinc-100 font-mono">
                          {invoice.title}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 font-mono">
                          Total
                        </span>
                        {decryptedInvoiceTotal !== null ? (
                          <span className="text-base font-bold text-emerald-400 font-mono tabular-nums">
                            ${decryptedInvoiceTotal.toFixed(2)} cUSDC
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-zinc-500 italic">encrypted</span>
                        )}
                      </div>
                    </div>

                    {/* Payer note */}
                    <div className="bg-zinc-950/40 border border-zinc-800/60 p-5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-500
                        font-mono mb-2 block">
                        Payer Note (optional)
                      </label>
                      <textarea rows={2} value={payerNote}
                        onChange={e => setPayerNote(e.target.value)}
                        placeholder="Private note for your records…"
                        className="w-full px-3 py-2.5 bg-transparent border border-zinc-800
                          text-sm text-zinc-200 placeholder-zinc-600 resize-none font-sans
                          normal-case focus:outline-none focus:border-sky-500/50 transition-all"
                      />
                      <p className="text-[10px] text-zinc-600 mt-1.5 font-mono uppercase tracking-wide">
                        Stored locally — kept private from the creator.
                      </p>
                    </div>

                    {/* Multi line items with pay buttons */}
                    {isMulti && items.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500
                          font-mono mb-2 px-1">
                          Pay each item
                        </div>
                        <div className="space-y-2">
                          {items.map((item, i) => (
                            <ItemRow key={i} item={item} index={i}
                              onPay={handlePay} paying={paying} invoiceStatus={invoiceStatus}
                              canDecrypt={sdkReady}
                              onDecryptItem={handleDecryptItem}
                              isPublic={true}
                              canPay={canPay}
                              showPayButton={true}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pay status */}
                    {payTxHash && (
                      <div className="flex items-start gap-2.5 p-3 bg-zinc-950/40 border border-zinc-800/60
                        text-xs text-zinc-400 font-mono">
                        <svg className="w-3.5 h-3.5 animate-spin text-sky-400 mt-0.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        <div className="flex-1">
                          <div className="text-zinc-300 font-bold mb-0.5 text-[10px] uppercase tracking-widest">
                            {payLoadingMsg || 'Confirming on-chain'}
                          </div>
                          <a href={`https://sepolia.etherscan.io/tx/${payTxHash}`}
                            target="_blank" rel="noreferrer"
                            className="text-[10px] text-sky-400 hover:text-sky-300 uppercase tracking-wide">
                            View on Etherscan ↗
                          </a>
                        </div>
                      </div>
                    )}

                    <ErrorBox message={payError} />

                    {/* Main pay CTA (single only) */}
                    {isSingle && (
                      <button onClick={() => handlePay(0)} disabled={paying !== null}
                        className="w-full h-14 bg-sky-500 hover:bg-sky-400 text-white font-bold
                          text-xs uppercase tracking-widest transition-all active:scale-[0.98]
                          disabled:opacity-50 shadow-xl shadow-sky-500/20 font-mono">
                        {paying !== null ? (
                          <Spinner label={payLoadingMsg || 'Processing…'} />
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                            </svg>
                            Confirm & Pay
                          </span>
                        )}
                      </button>
                    )}

                    {/* Back button */}
                    <button onClick={() => setCheckoutStep(2)} disabled={paying !== null}
                      className="w-full h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold
                        text-[10px] uppercase tracking-widest border border-zinc-700
                        transition-all flex items-center justify-center gap-2 font-mono
                        disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 17l-5-5m0 0l5-5m-5 5h12"/>
                      </svg>
                      Back to Verify
                    </button>
                  </>
                )}

                {paid && (
                  <div className="bg-emerald-950/20 border border-emerald-900/30 p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30
                      flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                    <h3 className="text-base font-bold text-emerald-300 mb-2 uppercase tracking-wider font-mono">
                      Payment complete
                    </h3>
                    <p className="text-xs text-zinc-500 mb-5 font-sans normal-case max-w-sm mx-auto">
                      cUSDC Transferred Successfully. The amount remains private onchain.
                    </p>
                    {payTxHash && (
                      <a href={`https://sepolia.etherscan.io/tx/${payTxHash}`}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400
                          hover:text-emerald-300 transition-colors font-mono uppercase tracking-widest">
                        View transaction ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer note */}
            <div className="flex items-start gap-2 px-3 py-2.5 bg-sky-500/5 border border-sky-500/10 mt-6">
              <svg className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <p className="text-[10px] text-sky-300/80 leading-relaxed font-mono">
                {isMulti
                  ? 'Amounts are publicly decryptable — anyone can verify prices via Zama FHE.'
                  : 'Amount can only be decrypted by the creator and named recipient via Zama FHE.'}
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-zinc-700 pt-6 font-mono uppercase tracking-widest">
          Secured by Zama FHE · Sepolia testnet
        </p>
      </div>
    </div>
  );
}