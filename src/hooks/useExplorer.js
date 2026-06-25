// src/hooks/useExplorer.js
// ─────────────────────────────────────────────────────────────────────────────
// Replaces all getLogs, useWatchContractEvent, and getBlock calls in Explorer
// Returns the exact same data shape Explorer UI already expects
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGetInvoices, apiGetDonations, apiGetDonationPages, apiGetStats } from '../lib/api.js';

const POLL_INTERVAL = 15_000; // backend indexer polls every 15s so match it

// ── Normalize backend invoice into the shape Explorer UI expects
function normalizeInvoice(inv) {
  return {
    source:      'invoice',
    txHash:      inv.createdTxHash,
    blockNumber: BigInt(inv.createdAtBlock),
    invoiceId:   inv.id,
    kind:        inv.kind,    // 0 = single, 1 = multi
    from:        inv.creator,
    to:          inv.recipient ?? null,
    itemCount:   inv.itemCount ?? 1,
    status:      inv.status,  // 0 pending, 1 paid, 2 cancelled, 3 expired
    timestamp:   inv.createdAt ? Number(inv.createdAt) : null,
  };
}

// ── Normalize backend donation into the shape Explorer UI expects
function normalizeDonation(don, pageCreatorMap) {
  return {
    source:      'donation',
    txHash:      don.txHash,
    blockNumber: BigInt(don.blockNumber),
    pageId:      don.pageId,
    from:        don.donor,
    to:          pageCreatorMap[don.pageId] ?? null,
    status:      99,
    timestamp:   don.timestamp ? Number(don.timestamp) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────
export function useExplorer() {
  const [events,     setEvents]     = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');

  const abortRef = useRef(null);

  // ── Build the unified event list from invoices + donations ─────────────────
  const buildEvents = useCallback(async () => {
    // Fetch invoices and donations in parallel
    const [invoiceRes, donationRes, pageRes] = await Promise.all([
      apiGetInvoices({ limit: 200, offset: 0 }),
      apiGetDonations({ limit: 200, offset: 0 }),
      apiGetDonationPages({ limit: 200, offset: 0 }),
    ]);

    // Build a pageId → creator map for donation normalization
    const pageCreatorMap = {};
    (pageRes?.items ?? []).forEach(p => {
      pageCreatorMap[p.id] = p.creator;
    });

    const invoiceEvents  = (invoiceRes?.items  ?? []).map(normalizeInvoice);
    const donationEvents = (donationRes?.items ?? []).map(
      don => normalizeDonation(don, pageCreatorMap)
    );

    // Merge and sort newest first
    const all = [...invoiceEvents, ...donationEvents]
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    return all;
  }, []);

  // ── Full fetch (initial load + manual refresh) ─────────────────────────────
  const fetchEvents = useCallback(async () => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setFetchError('');

    try {
      const [unified, statsData] = await Promise.all([
        buildEvents(),
        apiGetStats(),
      ]);

      setEvents(unified);
      setStats(statsData);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[useExplorer] fetch failed:', err);
      setFetchError(err.message || 'Failed to load explorer data');
    } finally {
      setLoading(false);
    }
  }, [buildEvents]);

  // ── Silent background poll ─────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const [unified, statsData] = await Promise.all([
        buildEvents(),
        apiGetStats(),
      ]);
      setEvents(unified);
      setStats(statsData);
    } catch (err) {
      // Silent — don't disrupt the UI on poll failure
      console.warn('[useExplorer] poll failed:', err.message);
    }
  }, [buildEvents]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEvents();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchEvents]);

  // ── Polling interval (replaces useWatchContractEvent) ─────────────────────
  useEffect(() => {
    if (loading) return;
    const t = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [loading, poll]);

  // ── Derived stats in the shape Explorer UI expects ─────────────────────────
  // We blend backend stats (global counts) with local event array
  // for tab counts and graph data which need the full event list
  const derivedStats = (() => {
    const inv  = events.filter(e => e.source === 'invoice');
    const don  = events.filter(e => e.source === 'donation');
    const paid = inv.filter(e => e.status === 1);
    const pend = inv.filter(e => e.status === 0);
    const canc = inv.filter(e => e.status === 2);
    const exp  = inv.filter(e => e.status === 3);

    // Use backend global totals for the stat cards if available
    // Fall back to local counts if not yet loaded
    const totalInvoices = stats?.invoices?.total  ?? inv.length;
    const totalPaid     = stats?.invoices?.paid    ?? paid.length;
    const totalPending  = stats?.invoices?.pending ?? pend.length;
    const totalWallets  = stats?.uniqueWallets     ?? new Set(events.map(e => e.from).filter(Boolean)).size;

    return {
      invoices:    totalInvoices,
      donations:   don.length,
      single:      inv.filter(e => e.kind === 0).length,
      multi:       inv.filter(e => e.kind === 1).length,
      paid:        totalPaid,
      pending:     totalPending,
      cancelled:   canc.length,
      expired:     exp.length,
      creators:    totalWallets,
      successRate: totalInvoices > 0
        ? ((totalPaid / totalInvoices) * 100).toFixed(1)
        : '—',
    };
  })();

  return {
    // Data
    events,
    stats: derivedStats,

    // State flags — same names Explorer UI already uses
    loading,
    fetchError,

    // Actions
    fetchEvents, // manual refresh button still works
  };
}