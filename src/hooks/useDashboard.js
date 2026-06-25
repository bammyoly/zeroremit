// src/hooks/useDashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// Replaces all getLogs / getBlock RPC calls in Dashboard.jsx
// Returns the exact same data shape the Dashboard UI already expects
// so zero UI changes are needed.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGetDashboard } from '../lib/api.js';

const POLL_INTERVAL = 30_000; // match original dashboard poll rate

// ── Normalize one invoice row from the backend into the event shape
// the Dashboard UI already understands
function normalizeInvoice(inv, walletLower) {
  const isCreator   = inv.creator   === walletLower;
  const isRecipient = inv.recipient === walletLower;

  return {
    source:      'invoice',
    txHash:      inv.createdTxHash,
    blockNumber: BigInt(inv.createdAtBlock),
    invoiceId:   inv.id,
    kind:        inv.kind,           // 0 = single, 1 = multi
    from:        inv.creator,
    to:          inv.recipient ?? 'open',
    status:      inv.status,         // 0 pending, 1 paid, 2 cancelled, 3 expired
    direction:   isRecipient ? 'received' : 'sent',
    // createdAt comes back as a string (BigInt serialized)
    // Dashboard timeAgo() expects Unix seconds as a number
    timestamp:   inv.createdAt ? Number(inv.createdAt) : null,
  };
}

// ── Normalize one donation row
function normalizeDonation(don, walletLower, allPages) {
  // Find the page creator so we can set direction correctly
  const pageCreator = allPages.find(p => p.id === don.pageId)?.creator ?? null;
  const isDonor     = don.donor === walletLower;

  return {
    source:      'donation',
    txHash:      don.txHash,
    blockNumber: BigInt(don.blockNumber),
    pageId:      don.pageId,
    from:        don.donor,
    to:          pageCreator ?? don.pageId,
    status:      3,                  // donations have no status — use 3 like original
    direction:   isDonor ? 'sent' : 'received',
    timestamp:   don.timestamp ? Number(don.timestamp) : null,
  };
}

// ── Build the flat unified events array the Dashboard UI expects
function buildEvents(data, walletLower) {
  if (!data) return [];

  const { created = [], received = [], donationsMade = [], donationsReceived = [] } = data;

  // Collect all donation pages for creator lookup
  const allPages = donationsReceived;

  // Deduplicate invoices — an invoice can appear in both created and received
  // (e.g. creator === recipient edge case). Use invoiceId as the key.
  const invoiceMap = new Map();

  created.forEach(inv => {
    invoiceMap.set(inv.id, normalizeInvoice(inv, walletLower));
  });

  received.forEach(inv => {
    // Only add if not already added from created
    if (!invoiceMap.has(inv.id)) {
      invoiceMap.set(inv.id, normalizeInvoice(inv, walletLower));
    }
  });

  // Donations made by this wallet
  const donationMadeEvents = donationsMade.map(don =>
    normalizeDonation(don, walletLower, allPages)
  );

  // Donations received on this wallet's pages
  const donationReceivedEvents = donationsReceived.flatMap(page =>
    (page.donations || []).map(don =>
      normalizeDonation(don, walletLower, allPages)
    )
  );

  // Merge everything into one flat array, sort newest first
  const all = [
    ...invoiceMap.values(),
    ...donationMadeEvents,
    ...donationReceivedEvents,
  ].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────
export function useDashboard(address) {
  const [events,      setEvents]      = useState([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [fetchError,  setFetchError]  = useState('');
  const [lastFetched, setLastFetched] = useState(null);

  const walletLower  = address?.toLowerCase() ?? null;
  const abortRef     = useRef(null);

  // ── Main fetch ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!walletLower) {
      setEvents([]);
      setEventsReady(true);
      return;
    }

    // Cancel any in-flight fetch
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setFetchError('');

    try {
      const data = await apiGetDashboard(walletLower);
      const unified = buildEvents(data, walletLower);
      setEvents(unified);
      setLastFetched(Date.now());
    } catch (err) {
      // Ignore abort errors — these are intentional
      if (err.name === 'AbortError') return;
      console.error('[useDashboard] fetch failed:', err);
      setFetchError(err.message || 'Failed to load dashboard');
    } finally {
      setEventsReady(true);
    }
  }, [walletLower]);

  // ── Poll for updates (replaces the old chain poller) ──────────────────────
  const poll = useCallback(async () => {
    if (!walletLower) return;
    try {
      const data     = await apiGetDashboard(walletLower);
      const unified  = buildEvents(data, walletLower);
      setEvents(unified);
      setLastFetched(Date.now());
    } catch (err) {
      // Polling errors are silent — don't disrupt the UI
      console.warn('[useDashboard] poll failed:', err.message);
    }
  }, [walletLower]);

  // ── Initial load when address changes ─────────────────────────────────────
  useEffect(() => {
    setEventsReady(false);
    setEvents([]);
    setFetchError('');
    fetchAll();

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchAll]);

  // ── Polling interval ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventsReady || !walletLower) return;
    const t = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [eventsReady, walletLower, poll]);

  // ── Derived stats (same computation as original Dashboard) ─────────────────
  const stats = (() => {
    const inv  = events.filter(e => e.source === 'invoice');
    const don  = events.filter(e => e.source === 'donation');
    const paid = inv.filter(e => e.status === 1);
    const pend = inv.filter(e => e.status === 0);
    const canc = inv.filter(e => e.status === 2);
    const mine = inv.filter(e => e.direction === 'sent');
    const settled = mine.filter(e => e.status === 1);

    return {
      invoices:  inv.length,
      donations: don.length,
      paid:      paid.length,
      pending:   pend.length,
      cancelled: canc.length,
      sent:      events.filter(e => e.direction === 'sent').length,
      received:  events.filter(e => e.direction === 'received').length,
      recvPaid:  events.filter(
        e => e.source === 'invoice' && e.direction === 'received' && e.status === 1
      ).length,
      rate: mine.length
        ? ((settled.length / mine.length) * 100).toFixed(1)
        : '0.0',
    };
  })();

  return {
    // Data
    events,
    stats,

    // State flags — same names as original Dashboard used
    eventsReady,
    fetchError,
    lastFetched,

    // Actions
    fetchAll,  // manual refresh button still works
  };
}