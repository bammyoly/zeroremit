# Zeroremit Frontend

The React app powering Zeroremit — a confidential invoicing and payments protocol on
Ethereum. Handles wallet connection, client-side FHE encryption, invoice creation and
payment, donation pages, dashboard analytics, and in-app documentation.

Live: **zeroremit.vercel.app**

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Running the Project](#running-the-project)
- [Pages](#pages)
- [Design System](#design-system)
- [FHE Integration](#fhe-integration)
- [Wallet Integration](#wallet-integration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

The frontend is where FHE encryption actually happens. Every invoice amount is
encrypted in the browser using Zama's WASM SDK before a wallet ever signs a
transaction — the plaintext number never leaves the client and never touches
the chain.

The app talks to two things:

1. **Ethereum Sepolia** directly, via wagmi/viem, for all contract reads and writes
   (`PaymentRouter`, `DonationVault`, `ConfidentialUSDC`).
2. **The Zeroremit backend REST API**, for indexed data (invoice/donation history,
   dashboard stats, protocol-wide numbers) so the UI doesn't have to re-scan the
   chain on every page load.

---

## Tech Stack

| Layer            | Technology                                  |
|-------------------|----------------------------------------------|
| Framework          | React 18 + Vite                              |
| Styling            | Tailwind CSS                                  |
| Routing            | React Router v6                               |
| Wallet connection  | Reown AppKit                                  |
| Chain interaction  | wagmi + viem                                  |
| Encryption         | Zama Relayer SDK (web / WASM)                 |
| Deployment         | Vercel                                        |

---

## Features

- **Private invoicing** — single-recipient invoices with FHE-encrypted amounts,
  decryptable only by creator and recipient.
- **Itemized invoices** — multi-payer invoices with intentionally public line-item
  prices (e.g. group purchases, shared bills).
- **Donation pages** — campaigns with optional goals and end dates; individual
  donation amounts are encrypted, only the page creator can decrypt the total.
- **Explorer** — search any invoice or donation by transaction hash or invoice ID.
- **Dashboard** — per-wallet stats (invoice counts by status, settlement rate,
  burner wallet balances, automation controls) plus protocol-wide activity charts.
- **Integrations hub** — configure Telegram bot linking, Zapier/webhook endpoints,
  and (soon) the Zeroremit Card, all from the Integrations tab.
- **In-app docs** — a full documentation site (`/docs`) covering contracts, backend
  architecture, the Zama SDK, integrations, and the REST API — no need to leave
  the app to look something up.

---

## Prerequisites

- **Node.js** 18+
- A browser wallet (MetaMask or any WalletConnect-compatible wallet) with Sepolia
  configured
- Sepolia test ETH and test USDC for the connected wallet
- The Zeroremit backend running locally or a deployed backend URL to point at

---

## Environment Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
VITE_BACKEND_URL=http://localhost:3001
VITE_REOWN_PROJECT_ID=your-reown-project-id
VITE_CHAIN_ID=11155111
VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

Copy the latest deployed contract addresses into `src/contracts/addresses.json`
after any contract deployment (see the contracts repo README).

---

## Running the Project

### Development

```bash
npm run dev
```

Starts the Vite dev server, typically at `http://localhost:5173`.

### Production build

```bash
npm run build
npm run preview
```

---

## Pages

| Page              | Route            | Purpose                                                        |
|--------------------|------------------|------------------------------------------------------------------|
| Home               | `/`              | Landing page, protocol pitch, quick stats                       |
| Explorer           | `/explorer`      | Search invoices/donations, protocol-wide activity chart          |
| Create Invoice     | `/create`        | Single payment, itemized, or donation page creation               |
| Pay Invoice        | `/pay/:id`       | Recipient/payer view — connect wallet, decrypt, pay               |
| Dashboard          | `/dashboard`     | Wallet stats, transactions, burner wallet & API key automation    |
| Integrations       | `/integrations`  | Telegram bot linking, Zapier/webhooks setup, Zeroremit Card (soon) |
| Docs               | `/docs`          | Full in-app documentation, tabbed with per-section navigation     |

---

## Design System

Zeroremit's UI follows a consistent, code-editor-inspired visual language:

- **Typography** — `font-mono tracking-wider` throughout; most labels and headers
  are uppercase.
- **Eyebrow labels** — section headers are preceded by a `//` comment-style prefix
  (e.g. `// INTEGRATIONS`), colored sky-400 by default, violet-400 on the Dashboard.
- **Sharp corners** — no rounded corners; borders are 1px zinc-800/zinc-900 at low
  opacity for a dense, technical feel.
- **Hero gradients** — large page titles use a zinc-to-sky gradient
  (`from-zinc-400 via-zinc-100 to-sky-400`).
- **Encrypted values** — anywhere an FHE-encrypted amount would be shown, use
  `[encrypted]` or `[fhe]` in italic monospace rather than a placeholder number.
- **Scroll animations** — `useReveal` (fade-in) and `useSlideIn` (slide-in) hooks
  drive on-scroll entrance animations across marketing and content pages.
- **Tab rails** — multi-tab sections (e.g. Create Invoice's Single/Itemized/Donation
  tabs, Docs' section tabs) use a bottom-border active-state indicator rather than
  filled/pill tabs.

---

## FHE Integration

Encryption happens entirely client-side, before any wallet signature:

```
1. User enters an amount in the UI
2. Zama WASM SDK initializes (createInstance with Sepolia config)
3. instance.createEncryptedInput(contractAddress, userAddress)
4. input.add64(amount in 6-decimal USDC units)
5. const { handles, inputProof } = await input.encrypt()
6. handles[0] and inputProof are passed to the contract call
   — the plaintext amount never leaves the browser
```

Decryption is on-demand only: the user explicitly requests it (e.g. from the
Dashboard), signs a message to prove authorization, and the Zama gateway returns
the value re-encrypted under the user's session key — decrypted locally, never
stored.

See the in-app [Docs → Zama SDK](https://zeroremit.vercel.app/docs) tab for the
full encryption/decryption flow and current limits (Sepolia-only, WASM load time,
euint64 bounds).

---

## Wallet Integration

- Wallet connection and session management is handled by **Reown AppKit**.
- Chain reads/writes go through **wagmi** hooks backed by **viem**.
- No account or email is required — connecting a wallet is the only "sign up" step.
- Users can optionally create a **burner wallet** (see Dashboard → Automation) to
  allow server-side automation (Telegram bot, Zapier) to sign transactions without
  requiring a wallet popup every time.

---

## Deployment

The frontend deploys to **Vercel**.

### Vercel environment variables

Set these in the Vercel project dashboard under **Settings → Environment Variables**:

```
VITE_BACKEND_URL       = https://your-backend.onrender.com
VITE_REOWN_PROJECT_ID  = your-reown-project-id
VITE_CHAIN_ID          = 11155111
VITE_RPC_URL           = https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Build settings

```
Build command:  npm run build
Output directory: dist
```

### Post-deploy checklist

```
[ ] Confirm VITE_BACKEND_URL points to the live backend (not localhost)
[ ] Confirm contract addresses.json matches the current deployment
[ ] Confirm Reown project ID is set and wallet connect modal opens
[ ] Test a full invoice creation + payment flow on Sepolia
[ ] Confirm /docs renders and all tab sections load correctly
```

---

## Troubleshooting

### FHE SDK fails to initialize

Confirm your deployment sets the correct COOP/COEP headers — the Zama WASM SDK
requires cross-origin isolation to run. On Vercel this is typically configured
via `vercel.json` headers.

### Wallet won't connect

1. Confirm `VITE_REOWN_PROJECT_ID` is set correctly.
2. Confirm the wallet is on Sepolia (Chain ID `11155111`) — Reown AppKit will
   prompt a network switch if not.

### Invoice created but not showing in Explorer/Dashboard

The backend indexer picks up new invoices within ~15 seconds. If it's been longer,
check that `VITE_BACKEND_URL` matches a backend instance that's actually running
and indexing the same contract addresses this frontend is using.

### Decrypt button does nothing / hangs

1. Confirm a live connection to the Zama relayer (`relayer.testnet.zama.org`) —
   decrypt requests fail silently if the relayer is unreachable.
2. Confirm the connected wallet is either the invoice creator or recipient —
   decryption will be rejected by the ACL for any other address.

---

## License

ISC
