// src/lib/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Central API client for Zeroremit backend
// All backend communication goes through this file.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ── Internal fetch wrapper ────────────────────────────────────────────────────
// Handles base URL, headers, error parsing, and BigInt-safe JSON
async function apiFetch(path, options = {}) {
  const url = `${BACKEND_URL}/api${path}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  // Try to parse error body for a clean message
  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      // ignore parse error, use default message
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

// ── Custom error class ────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name  = 'ApiError';
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────

export async function apiHealth() {
  return apiFetch('/health');
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// GET /api/dashboard/:wallet
// Returns: { wallet, stats, created, received, donationsMade, donationsReceived }
// ─────────────────────────────────────────────────────────────────────────────

export async function apiGetDashboard(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch(`/dashboard/${wallet.toLowerCase()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/invoices
 * @param {object} params
 * @param {string}  [params.creator]
 * @param {string}  [params.recipient]
 * @param {number}  [params.status]   0=pending 1=paid 2=cancelled 3=expired
 * @param {number}  [params.kind]     0=single 1=multi
 * @param {number}  [params.limit]    default 50
 * @param {number}  [params.offset]   default 0
 */
export async function apiGetInvoices(params = {}) {
  const qs = new URLSearchParams();
  if (params.creator   != null) qs.set('creator',   params.creator.toLowerCase());
  if (params.recipient != null) qs.set('recipient', params.recipient.toLowerCase());
  if (params.status    != null) qs.set('status',    String(params.status));
  if (params.kind      != null) qs.set('kind',      String(params.kind));
  if (params.limit     != null) qs.set('limit',     String(params.limit));
  if (params.offset    != null) qs.set('offset',    String(params.offset));

  const query = qs.toString();
  return apiFetch(`/invoices${query ? `?${query}` : ''}`);
}

/**
 * GET /api/invoices/:id
 */
export async function apiGetInvoice(id) {
  if (!id) throw new Error('invoice id is required');
  return apiFetch(`/invoices/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DONATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/donations/pages
 * @param {object} params
 * @param {string}  [params.creator]
 * @param {number}  [params.limit]
 * @param {number}  [params.offset]
 */
export async function apiGetDonationPages(params = {}) {
  const qs = new URLSearchParams();
  if (params.creator != null) qs.set('creator', params.creator.toLowerCase());
  if (params.limit   != null) qs.set('limit',   String(params.limit));
  if (params.offset  != null) qs.set('offset',  String(params.offset));

  const query = qs.toString();
  return apiFetch(`/donations/pages${query ? `?${query}` : ''}`);
}

/**
 * GET /api/donations/pages/:id
 */
export async function apiGetDonationPage(id) {
  if (!id) throw new Error('page id is required');
  return apiFetch(`/donations/pages/${id}`);
}

/**
 * GET /api/donations
 * @param {object} params
 * @param {string}  [params.donor]
 * @param {string}  [params.pageId]
 * @param {number}  [params.limit]
 * @param {number}  [params.offset]
 */
export async function apiGetDonations(params = {}) {
  const qs = new URLSearchParams();
  if (params.donor  != null) qs.set('donor',  params.donor.toLowerCase());
  if (params.pageId != null) qs.set('pageId', params.pageId);
  if (params.limit  != null) qs.set('limit',  String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));

  const query = qs.toString();
  return apiFetch(`/donations${query ? `?${query}` : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/stats
 * Returns global protocol stats
 */
export async function apiGetStats() {
  return apiFetch('/stats');
}

/**
 * GET /api/stats/timeseries?range=1D|1W|1M
 * Returns time-bucketed invoice data for the graph
 */
export async function apiGetTimeseries(range = '1W') {
  return apiFetch(`/stats/timeseries?range=${range}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/telegram/link-code
 * Generates a one-time linking code tied to the wallet
 * @param {string} wallet - wallet address
 * @returns {{ code: string, expiresAt: string }}
 */
export async function apiGenerateLinkCode(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch('/telegram/link-code', {
    method: 'POST',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

/**
 * GET /api/telegram/status?wallet=0x...
 * Returns the Telegram link status for a wallet
 * @param {string} wallet
 * @returns {{ linked: boolean, chatId?, username?, firstName?, linkedAt?, prefs? }}
 */
export async function apiGetTelegramStatus(wallet) {
  if (!wallet) return { linked: false };
  return apiFetch(`/telegram/status?wallet=${wallet.toLowerCase()}`);
}

/**
 * POST /api/telegram/unlink
 * Removes the Telegram link for a wallet
 * @param {string} wallet
 */
export async function apiUnlinkTelegram(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch('/telegram/unlink', {
    method: 'POST',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

/**
 * POST /api/telegram/prefs
 * Updates notification preferences for a linked wallet
 * @param {string} wallet
 * @param {object} prefs  - partial prefs object e.g. { invoicePaid: true }
 */
export async function apiUpdateTelegramPrefs(wallet, prefs) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch('/telegram/prefs', {
    method: 'POST',
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      prefs,
    }),
  });
}