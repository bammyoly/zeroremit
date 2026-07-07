// frontend/src/lib/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Central API client for Zeroremit backend
// All backend communication goes through this file.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ── Internal fetch wrapper ────────────────────────────────────────────────────
// Handles base URL, headers, error parsing, and BigInt-safe JSON
async function apiFetch(path, options = {}) {
  const url = `${BACKEND_URL}/api${path}`;

  // Extract headers separately so ...options doesn't overwrite them
  const { headers: optHeaders, ...rest } = options;

  const res = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...optHeaders,
    },
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {}
    throw new ApiError(res.status, message);
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// BURNER WALLET
// Server-side signing for Telegram & Zapier automation.
// Uses dual-key encryption: encryptedKey_user (client-side, password) +
// encryptedKey_server (server-side, wrapping key).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/burner?wallet=0x...
 * Returns burner metadata. Never returns either encrypted blob.
 * @param {string} wallet
 * @returns {{ exists: boolean, wallet?, burnerAddress?, automationEnabled?, createdAt? }}
 */
export async function apiGetBurner(wallet) {
  if (!wallet) return { exists: false };
  return apiFetch(`/burner?wallet=${wallet.toLowerCase()}`);
}

/**
 * POST /api/burner/create
 * Client encrypts the raw private key with the user's password (client-side),
 * then sends the ciphertext AND the raw key. Server encrypts the raw key with
 * its wrapping key for automation, then discards the plaintext.
 * @param {object} p
 * @param {string} p.wallet            - main wallet (owner)
 * @param {string} p.burnerAddress     - address derived from the private key
 * @param {string} p.encryptedKey_user - base64 AES-GCM blob from the browser
 * @param {string} p.rawPrivateKey     - 0x-prefixed hex, sent once
 * @returns {{ wallet, burnerAddress, automationEnabled, createdAt }}
 */
export async function apiCreateBurner({ wallet, burnerAddress, encryptedKey_user, rawPrivateKey }) {
  if (!wallet)            throw new Error('wallet is required');
  if (!burnerAddress)     throw new Error('burnerAddress is required');
  if (!encryptedKey_user) throw new Error('encryptedKey_user is required');
  if (!rawPrivateKey)     throw new Error('rawPrivateKey is required');

  return apiFetch('/burner/create', {
    method: 'POST',
    body: JSON.stringify({
      wallet:            wallet.toLowerCase(),
      burnerAddress,
      encryptedKey_user,
      rawPrivateKey,
    }),
  });
}

/**
 * GET /api/burner/export?wallet=0x...
 * Returns encryptedKey_user so the client can decrypt it in-browser
 * for recovery. Server never sees the plaintext.
 * @param {string} wallet
 * @returns {{ burnerAddress, encryptedKey_user }}
 */
export async function apiExportBurner(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch(`/burner/export?wallet=${wallet.toLowerCase()}`);
}

/**
 * POST /api/burner/disable-automation
 * Deletes encryptedKey_server so the server can no longer sign.
 * The user-encrypted blob is preserved for manual recovery.
 * @param {string} wallet
 */
export async function apiDisableAutomation(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch('/burner/disable-automation', {
    method: 'POST',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

/**
 * POST /api/burner/enable-automation
 * User must decrypt their burner in-browser first (using their password
 * against encryptedKey_user), then POST the raw key here so the server
 * can re-encrypt it with the wrapping key.
 * @param {string} wallet
 * @param {string} rawPrivateKey - 0x-prefixed hex
 */
export async function apiEnableAutomation(wallet, rawPrivateKey) {
  if (!wallet)        throw new Error('wallet is required');
  if (!rawPrivateKey) throw new Error('rawPrivateKey is required');

  return apiFetch('/burner/enable-automation', {
    method: 'POST',
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      rawPrivateKey,
    }),
  });
}

/**
 * DELETE /api/burner
 * Fully removes the burner and revokes all API keys for this wallet.
 * @param {string} wallet
 */
export async function apiDeleteBurner(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch('/burner', {
    method: 'DELETE',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEYS
// Scoped tokens for Zapier, Telegram bot, and external integrations.
// Requires a burner wallet to exist first.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/burner/keys
 * Generates a new API key. The plaintext key is returned ONCE — never again.
 * @param {object} p
 * @param {string} p.wallet
 * @param {string} [p.label]
 * @param {number} [p.maxAmountUsdc]   default 500
 * @param {number} [p.dailyLimitUsdc]  default 2000
 * @returns {{ id, key, label, maxAmountUsdc, dailyLimitUsdc, createdAt }}
 */
export async function apiCreateApiKey({ wallet, label, maxAmountUsdc, dailyLimitUsdc }) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch('/burner/keys', {
    method: 'POST',
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      ...(label          !== undefined && { label }),
      ...(maxAmountUsdc  !== undefined && { maxAmountUsdc }),
      ...(dailyLimitUsdc !== undefined && { dailyLimitUsdc }),
    }),
  });
}

/**
 * GET /api/burner/keys?wallet=...
 * Lists all keys for the wallet. Never returns plaintext or hashes.
 */
export async function apiListApiKeys(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch(`/burner/keys?wallet=${wallet.toLowerCase()}`);
}

/**
 * DELETE /api/burner/keys/:id
 * Soft-delete: sets revokedAt. Key immediately stops working.
 */
export async function apiRevokeApiKey(wallet, id) {
  if (!wallet) throw new Error('wallet is required');
  if (!id)     throw new Error('id is required');
  return apiFetch(`/burner/keys/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOKS
// Outbound HTTP callbacks fired when invoice/donation events occur on-chain.
// Requires a registered WebhookEndpoint per wallet.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks
 * Register a new webhook endpoint. Returns secret ONCE — never again.
 * @param {object} p
 * @param {string}   p.wallet
 * @param {string}   p.url        must be https:// (or http://localhost)
 * @param {string[]} p.events     array of event names
 * @returns {{ id, wallet, url, events, active, createdAt, secret }}
 */
export async function apiCreateWebhook({ wallet, url, events }) {
  if (!wallet) throw new Error('wallet is required');
  if (!url)    throw new Error('url is required');
  if (!events) throw new Error('events is required');
  return apiFetch('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      url,
      events,
    }),
  });
}

/**
 * GET /api/webhooks?wallet=0x...
 * List all webhook endpoints for a wallet. Secret never returned.
 * @param {string} wallet
 * @returns {Array<{ id, url, events, active, failCount, lastFiredAt, createdAt }>}
 */
export async function apiListWebhooks(wallet) {
  if (!wallet) throw new Error('wallet is required');
  return apiFetch(`/webhooks?wallet=${wallet.toLowerCase()}`);
}

/**
 * PATCH /api/webhooks/:id
 * Update url, events, or active status.
 * @param {string} wallet
 * @param {string} id
 * @param {object} updates  { url?, events?, active? }
 */
export async function apiPatchWebhook(wallet, id, updates) {
  if (!wallet) throw new Error('wallet is required');
  if (!id)     throw new Error('id is required');
  return apiFetch(`/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ wallet: wallet.toLowerCase(), ...updates }),
  });
}

/**
 * DELETE /api/webhooks/:id
 * Soft-delete endpoint. Pending deliveries are marked dead.
 * @param {string} wallet
 * @param {string} id
 */
export async function apiDeleteWebhook(wallet, id) {
  if (!wallet) throw new Error('wallet is required');
  if (!id)     throw new Error('id is required');
  return apiFetch(`/webhooks/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

/**
 * POST /api/webhooks/:id/test
 * Enqueue a dummy payload through the full worker pipeline.
 * @param {string} wallet
 * @param {string} id
 */
export async function apiTestWebhook(wallet, id) {
  if (!wallet) throw new Error('wallet is required');
  if (!id)     throw new Error('id is required');
  return apiFetch(`/webhooks/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({ wallet: wallet.toLowerCase() }),
  });
}

/**
 * GET /api/webhooks/:id/deliveries?wallet=0x...
 * Last 20 delivery attempts for one endpoint.
 * @param {string} wallet
 * @param {string} id
 * @returns {Array<{ id, event, status, httpStatus, responseBody, attempts, deliveredAt, createdAt }>}
 */
export async function apiGetWebhookDeliveries(wallet, id) {
  if (!wallet) throw new Error('wallet is required');
  if (!id)     throw new Error('id is required');
  return apiFetch(`/webhooks/${id}/deliveries?wallet=${wallet.toLowerCase()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BURNER OPERATIONS (via Bearer API key)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/public/burner/decrypt-cusdc
 * Returns the plaintext cUSDC balance of the burner.
 * Called from the main wallet UI to show the burner's balance.
 */
export async function apiDecryptBurnerCusdc(apiKey) {
  if (!apiKey) throw new Error('API key required');
  return apiFetch('/public/burner/decrypt-cusdc', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body:    JSON.stringify({}),
  });
}

/**
 * POST /api/public/burner/sweep-cusdc
 * Server signs confidentialTransfer from burner → target using burner key.
 */
export async function apiSweepBurnerCusdc(apiKey, targetAddress) {
  if (!apiKey)        throw new Error('API key required');
  if (!targetAddress) throw new Error('targetAddress required');
  return apiFetch('/public/burner/sweep-cusdc', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body:    JSON.stringify({ targetAddress: targetAddress.toLowerCase() }),
  });
}

/**
 * Get an API key for the given wallet.
 * Checks localStorage first (from ApiKeyRevealModal save), then falls back
 * to prompting the user to paste it since raw keys aren't retrievable from backend.
 */
export async function getStoredApiKey(wallet) {
  if (!wallet) return null;
  const walletLower = wallet.toLowerCase();

  // 1. Check localStorage (set by ApiKeyRevealModal on new key creation)
  const stored = localStorage.getItem(`zeroremit_api_key_${walletLower}`);
  if (stored) return stored;

  // 2. Fallback: check if user has ANY active keys registered
  //    (we can't retrieve raw keys from backend — only hashes are stored)
  try {
    const keys = await apiListApiKeys(walletLower);
    const activeKeys = keys.filter(k => !k.revokedAt);

    if (activeKeys.length === 0) {
      throw new Error('No active API keys. Generate one in the Automation tab first.');
    }

    // We have keys but no plaintext locally. Prompt user to paste one.
    const pasted = window.prompt(
      `We found ${activeKeys.length} active API key(s) for this wallet, but the raw key isn't cached locally.\n\n` +
      `API keys are only shown once when created for security. Please paste one of your keys:`
    );

    if (!pasted || !pasted.trim().startsWith('zr_live_')) {
      throw new Error('Invalid API key format. Must start with zr_live_');
    }

    // Save for future use
    localStorage.setItem(`zeroremit_api_key_${walletLower}`, pasted.trim());
    return pasted.trim();
  } catch (e) {
    throw new Error(`API key required: ${e.message}`);
  }
}