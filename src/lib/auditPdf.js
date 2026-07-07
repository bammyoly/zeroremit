// src/lib/auditPdf.js
// Client-side PDF generation for audit reports.
// Respects the section toggles from AuditReportModal.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatUnits } from 'viem';

const USDC_DECIMALS = 6;

const COLORS = {
  sky:     [56, 189, 248],
  zinc900: [24, 24, 27],
  zinc700: [63, 63, 70],
  zinc500: [113, 113, 122],
  zinc300: [212, 212, 216],
  amber:   [245, 158, 11],
  emerald: [16, 185, 129],
  rose:    [244, 63, 94],
};

const INVOICE_STATUS = ['Pending', 'Paid', 'Cancelled', 'Expired'];
const INVOICE_TYPE   = ['Single', 'Multi'];

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toISOString().split('T')[0];
}

function fmtUsdc(bn) {
  if (bn === null || bn === undefined) return '—';
  try {
    return Number(formatUnits(bn, USDC_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  } catch { return '—'; }
}

function fmtEth(bn) {
  if (bn === null || bn === undefined) return '—';
  try {
    return Number(formatUnits(bn, 18)).toLocaleString(undefined, {
      minimumFractionDigits: 4, maximumFractionDigits: 4,
    });
  } catch { return '—'; }
}

/**
 * Generate a PDF audit report from the given config and data.
 */
export function generateAuditPdf(config, data) {
  const { filename, perspective, sections } = config;
  const { wallet, stats, events, mainBalances, burnerInfo, contracts } = data;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  // Helper — safely mutates and returns updated 'y' after managing page breaks
  function checkPageBreak(currentY, neededSpace) {
    if (currentY + neededSpace > pageHeight - 20) {
      pdf.addPage();
      return 20; // Reset back to top margin of the fresh page
    }
    return currentY;
  }

  let y = 20;

  // ── HEADER ────────────────────────────────────────────────────────────────
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.sky);
  pdf.text('ZEROREMIT AUDIT REPORT', 20, y);
  y += 10;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.zinc500);
  pdf.text(`Generated: ${new Date().toISOString()}`, 20, y);
  y += 5;
  pdf.text(`Wallet: ${wallet}`, 20, y);
  y += 5;
  pdf.text(`Perspective: ${perspective.toUpperCase()}`, 20, y);
  y += 5;
  pdf.text(`Network: Ethereum Sepolia (Chain ID: ${contracts.chainId})`, 20, y);
  y += 10;

  // Separator line
  pdf.setDrawColor(...COLORS.sky);
  pdf.setLineWidth(0.5);
  pdf.line(20, y, pageWidth - 20, y);
  y += 8;

  // ── SUMMARY SECTION ──────────────────────────────────────────────────────
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.zinc900);
  pdf.text('Summary', 20, y);
  y += 6;

  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: {
      fillColor: COLORS.sky,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right' },
    },
    head: [['Metric', 'Value']],
    body: [
      ['Total Invoices',         String(stats.invoices)],
      ['Settled',                String(stats.paid)],
      ['Pending',                String(stats.pending)],
      ['Cancelled',              String(stats.cancelled)],
      ['Donations Received',     String(stats.donations)],
      ['Settlement Rate',        `${stats.rate}%`],
      ['Sent',                   String(stats.sent)],
      ['Received',               String(stats.received)],
    ],
  });
  y = pdf.lastAutoTable.finalY + 10;

  // ── BALANCE SNAPSHOT ─────────────────────────────────────────────────────
  if (sections.balanceSnapshot) {
    y = checkPageBreak(y, 40);

    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.zinc900);
    pdf.text('Balance Snapshot', 20, y);
    y += 6;

    const balanceRows = [];

    if (sections.mainAddress) {
      balanceRows.push(['Main Wallet · ETH',   fmtEth(mainBalances.eth)]);
      balanceRows.push(['Main Wallet · USDC',  fmtUsdc(mainBalances.usdc)]);
      balanceRows.push(['Main Wallet · cUSDC', mainBalances.cusdc !== null ? fmtUsdc(mainBalances.cusdc) : '[encrypted]']);
    }

    if (sections.burnerAddress && burnerInfo) {
      balanceRows.push(['Burner · Address',    burnerInfo.address]);
      balanceRows.push(['Burner · ETH',        fmtEth(burnerInfo.eth)]);
      balanceRows.push(['Burner · USDC',       fmtUsdc(burnerInfo.usdc)]);
      balanceRows.push(['Burner · cUSDC',      burnerInfo.cusdc !== null ? fmtUsdc(burnerInfo.cusdc) : '[encrypted]']);
    }

    autoTable(pdf, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: COLORS.zinc700,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' },
      },
      head: [['Asset', 'Balance']],
      body: balanceRows,
    });
    y = pdf.lastAutoTable.finalY + 10;
  }

  // ── FILTER EVENTS BY PERSPECTIVE + SECTIONS ──────────────────────────────
  let filteredEvents = events;
  if (perspective === 'merchant') {
    filteredEvents = events.filter(e => e.direction === 'sent');
  } else if (perspective === 'payer') {
    filteredEvents = events.filter(e => e.direction === 'received');
  }

  // Apply receipt toggles
  filteredEvents = filteredEvents.filter(ev => {
    if (ev.direction === 'received' && !sections.incomingReceipts) return false;
    if (ev.direction === 'sent'     && !sections.outgoingReceipts) return false;
    return true;
  });

  // ── INVOICES / EVENTS TABLE ──────────────────────────────────────────────
  y = checkPageBreak(y, 30);

  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.zinc900);
  pdf.text(`Transactions (${filteredEvents.length})`, 20, y);
  y += 6;

  if (filteredEvents.length === 0) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(...COLORS.zinc500);
    pdf.text('No transactions match the selected filters.', 20, y);
    y += 10;
  } else {
    const eventRows = filteredEvents.slice(0, 200).map((ev, i) => {
      const cols = [
        String(i + 1),
        (ev.source === 'invoice' ? INVOICE_TYPE[Number(ev.kind)] || '?' : 'Donation'),
        ev.source === 'invoice' ? (INVOICE_STATUS[ev.status] ?? '?') : 'Received',
        (ev.direction === 'sent' ? 'Sent' : 'Received'),
        ev.from ? `${ev.from.slice(0, 8)}…` : '—',
        ev.to && ev.to !== 'open' ? `${ev.to.slice(0, 8)}…` : (ev.to === 'open' ? 'Open' : '—'),
        '[FHE]',
        fmtDate(ev.timestamp),
      ];
      return cols;
    });

    autoTable(pdf, {
      startY: y,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: {
        fillColor: COLORS.sky,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [['#', 'Type', 'Status', 'Direction', 'From', 'To', 'Amount', 'Date']],
      body: eventRows,
    });
    y = pdf.lastAutoTable.finalY + 6;

    if (filteredEvents.length > 200) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(...COLORS.zinc500);
      pdf.text(`Showing 200 of ${filteredEvents.length} transactions.`, 20, y);
      y += 6;
    }
  }

  // ── APPENDIX: TX HASHES ───────────────────────────────────────────────────
  if (sections.invoiceAppendices && filteredEvents.length > 0) {
    y = checkPageBreak(y, 30);

    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.zinc900);
    pdf.text('Transaction Appendix', 20, y);
    y += 4;

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.zinc500);
    pdf.text('Full transaction hashes and Etherscan links for verification.', 20, y);
    y += 6;

    const appendixRows = filteredEvents.slice(0, 100).map((ev, i) => [
      String(i + 1),
      ev.txHash ? `${ev.txHash.slice(0, 20)}…${ev.txHash.slice(-6)}` : '—',
      ev.txHash ? `https://sepolia.etherscan.io/tx/${ev.txHash}` : '',
    ]);

    autoTable(pdf, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fontStyle: 'bold', textColor: COLORS.zinc900 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { fontStyle: 'italic' },
      },
      head: [['#', 'Tx Hash', 'Explorer Link']],
      body: appendixRows,
    });
    y = pdf.lastAutoTable.finalY + 6;
  }

  // ── MEMOS SECTION ────────────────────────────────────────────────────────
  if (sections.invoiceMemos) {
    const withMemos = filteredEvents.filter(e => e.memo);
    if (withMemos.length > 0) {
      y = checkPageBreak(y, 30);

      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.zinc900);
      pdf.text('Invoice Memos', 20, y);
      y += 6;

      autoTable(pdf, {
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: COLORS.zinc700, textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
        head: [['Invoice ID', 'Memo']],
        body: withMemos.slice(0, 100).map(ev => [
          ev.invoiceId ? `${ev.invoiceId.slice(0, 10)}…` : '—',
          ev.memo || '',
        ]),
      });
      y = pdf.lastAutoTable.finalY + 10;
    }
  }

  // ── CONTRACT INFO FOOTER ─────────────────────────────────────────────────
  y = checkPageBreak(y, 30);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.zinc900);
  pdf.text('Contract References', 20, y);
  y += 6;

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.zinc500);
  pdf.text(`cUSDC:         ${contracts.cUSDC || 'N/A'}`, 20, y); y += 4;
  pdf.text(`PaymentRouter: ${contracts.paymentRouter || 'N/A'}`, 20, y); y += 4;
  pdf.text(`DonationVault: ${contracts.donationVault || 'N/A'}`, 20, y); y += 8;

  // ── PAGE FOOTER on every page ────────────────────────────────────────────
  const totalPages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.zinc500);
    pdf.text(
      `Zeroremit · Confidential invoice audit · Page ${i} of ${totalPages}`,
      pageWidth / 2, pageHeight - 8,
      { align: 'center' }
    );
    pdf.text(
      'Amounts marked [FHE] are FHE-encrypted on-chain and readable only by authorized parties.',
      pageWidth / 2, pageHeight - 4,
      { align: 'center' }
    );
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const name = filename ||
    `zeroremit-audit-${wallet.slice(0, 6)}-${new Date().toISOString().split('T')[0]}`;
  pdf.save(`${name}.pdf`);
}