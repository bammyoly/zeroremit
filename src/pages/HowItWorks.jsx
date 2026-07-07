// src/pages/HowItWorks.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// ── Reveal hook ───────────────────────────────────────────────────────────────
function useReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

const reveal = (visible, delay = '') =>
  `transition-all duration-700 ease-out ${delay} ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
  }`;

// ── Shared atoms ──────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-3">
      // {children}
    </p>
  );
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-white uppercase mb-6 leading-snug">
      {children}
    </h2>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-zinc-900/10 border border-zinc-800/40 p-6 hover:border-sky-500/20 transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

function StepCard({ n, title, desc, bullets }) {
  return (
    <Card>
      <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-sky-400 font-mono mb-5">
        {n}
      </div>
      <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wide font-mono mb-2">
        {title}
      </h3>
      <p className="text-xs text-zinc-400 font-sans normal-case leading-relaxed mb-4">
        {desc}
      </p>
      {bullets && (
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 items-start px-3 py-2 bg-zinc-950/30 border border-zinc-900/60">
              <span className="text-sky-400 font-mono text-xs font-bold flex-shrink-0 mt-0.5">·</span>
              <span className="text-xs text-zinc-400 font-sans normal-case leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UserCard({ icon, title, desc, tags }) {
  return (
    <Card>
      <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wide font-mono mb-2">
        {title}
      </h3>
      <p className="text-xs text-zinc-400 font-sans normal-case leading-relaxed mb-4">
        {desc}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="text-[9px] font-mono font-bold px-2 py-0.5 border border-zinc-800 bg-zinc-950/60 text-zinc-500 uppercase tracking-wide">
            {t}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const Icons = {
  freelancer: (
    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>
  ),
  agency: (
    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
    </svg>
  ),
  dao: (
    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>
  ),
  merchant: (
    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
    </svg>
  ),
  charity: (
    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
    </svg>
  ),
  developer: (
    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
    </svg>
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
export default function HowItWorks() {
  const [heroRef,       heroVis]       = useReveal(0.05);
  const [problemRef,    problemVis]    = useReveal();
  const [whatRef,       whatVis]       = useReveal();
  const [whoRef,        whoVis]        = useReveal();
  const [stepsRef,      stepsVis]      = useReveal();
  const [confidRef,     confidVis]     = useReveal();
  const [ctaRef,        ctaVis]        = useReveal();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono tracking-wider selection:bg-sky-400 selection:text-zinc-950">

      {/* ── Background glow ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-sky-500/[0.03] blur-[140px] rounded-full" />
      </div>

      <div className="relative z-10">

        {/* ── HERO ── */}
        <section ref={heroRef} className="relative pt-36 pb-24 px-4 border-b border-zinc-900/60 text-center overflow-hidden">
          <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />

          <div className={`max-w-4xl mx-auto ${reveal(heroVis)}`}>
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-6">
              // How it works
            </p>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tighter text-white uppercase leading-[1.05] mb-6">
              Confidential Invoicing<br />
              <span className="bg-gradient-to-r from-zinc-100 via-zinc-400 to-sky-400 bg-clip-text text-transparent">
                On Ethereum
              </span>
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl mx-auto leading-relaxed font-sans normal-case mb-10">
              Zeroremit is a confidential invoicing protocol built on Ethereum, powered by
              Zama's Fully Homomorphic Encryption. Invoice amounts are encrypted before they
              ever touch the blockchain so only you and your payer can see what was charged.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { label: 'FHE Encrypted', color: 'text-sky-400 border-sky-500/20 bg-sky-500/5' },
                { label: 'On-chain', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
                { label: 'Non-custodial', color: 'text-violet-400 border-violet-500/20 bg-violet-500/5' },
                { label: 'Sepolia Testnet', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
              ].map(b => (
                <span key={b.label} className={`text-[10px] font-bold font-mono px-3 py-1 border uppercase tracking-widest ${b.color}`}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32 space-y-28 pt-20">

          {/* ── THE PROBLEM ── */}
          <section ref={problemRef} className={reveal(problemVis)}>
            <SectionLabel>The problem</SectionLabel>
            <SectionHeading>Public blockchains expose every payment.</SectionHeading>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="p-6 bg-rose-950/10 border border-rose-900/20 space-y-3">
                <p className="text-[10px] font-bold font-mono text-rose-400 uppercase tracking-widest mb-4">
                  Without Zeroremit
                </p>
                {[
                  ['Sender wallet',   'Permanently public on-chain'],
                  ['Recipient wallet','Permanently public on-chain'],
                  ['Invoice amount',  'Visible to anyone with a block explorer'],
                  ['Payment history', 'Indexed forever — traceable'],
                  ['Client list',     'Inferable from wallet interactions'],
                  ['Revenue total',   'Anyone can sum your inflows'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-1.5 border-b border-rose-900/10 last:border-0">
                    <span className="text-[11px] font-mono text-zinc-400">{k}</span>
                    <span className="text-[11px] font-mono text-rose-400 text-right">{v}</span>
                  </div>
                ))}
              </div>

              <div className="p-6 bg-emerald-950/10 border border-emerald-900/20 space-y-3">
                <p className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest mb-4">
                  With Zeroremit
                </p>
                {[
                  ['Sender wallet',   'Public — wallet connection required'],
                  ['Recipient wallet','Public — named in the invoice'],
                  ['Invoice amount',  'FHE ciphertext — unreadable on-chain'],
                  ['Payment history', 'On-chain but amount stays encrypted'],
                  ['Client list',     'Not inferable from encrypted payloads'],
                  ['Revenue total',   'Cannot be summed without decryption key'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-1.5 border-b border-emerald-900/10 last:border-0">
                    <span className="text-[11px] font-mono text-zinc-400">{k}</span>
                    <span className="text-[11px] font-mono text-emerald-400 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
              <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
                Wallet addresses are still public — Zeroremit does not anonymize who pays or who receives.
                What it protects is the <strong className="text-sky-300">amount</strong>. This is the key privacy
                guarantee: the financial detail most sensitive in a business context.
              </p>
            </div>
          </section>

          {/* ── WHAT IS ZEROREMIT ── */}
          <section ref={whatRef} className={reveal(whatVis)}>
            <SectionLabel>What is Zeroremit</SectionLabel>
            <SectionHeading>A confidential invoicing protocol on Ethereum.</SectionHeading>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <div className="space-y-4 text-sm text-zinc-400 font-sans normal-case leading-relaxed">
                <p>
                  Zeroremit is a web3 invoicing application built on Ethereum Sepolia.
                  It uses <span className="text-sky-400 font-mono">Zama's Fully Homomorphic Encryption (FHE)</span> to
                  encrypt invoice amounts directly in the user's browser before any transaction
                  is signed or broadcast to the network.
                </p>
                <p>
                  When you create an invoice, the amount is converted into an FHE
                  ciphertext using WebAssembly running locally on your device. Your wallet
                  signs the encrypted payload — not the raw number. The smart contract
                  stores only the ciphertext. No plaintext amount ever appears on-chain.
                </p>
                <p>
                  The protocol supports three invoice types: single-recipient invoices
                  with private amounts, itemized multi-payer invoices, and donation
                  pages with optional goals. Each has its own smart contract path.
                </p>
                <p>
                  Beyond invoice creation, Zeroremit includes a full automation layer —
                  burner wallets, API keys, outbound webhooks, Telegram bot integration,
                  and Zapier compatibility — so the entire invoicing workflow can run
                  without requiring manual wallet interaction every time.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title: 'Smart contracts',
                    desc:  'PaymentRouter handles all invoice types. DonationVault manages fundraising pages. ConfidentialUSDC (cUSDC) is the encrypted ERC-20 used for all payments.',
                    color: 'border-l-sky-500',
                  },
                  {
                    title: 'Zama FHE coprocessor',
                    desc:  'Amounts are encrypted using Zama\'s euint64 type. The coprocessor processes encrypted operations without decrypting them. Only wallet-authorized parties can request decryption.',
                    color: 'border-l-violet-500',
                  },
                  {
                    title: 'Non-custodial design',
                    desc:  'Zeroremit never holds your funds or private keys. All signing happens in your wallet. The backend only stores invoice metadata — never plaintext amounts.',
                    color: 'border-l-emerald-500',
                  },
                  {
                    title: 'Automation layer',
                    desc:  'Burner wallets can sign transactions server-side within user-defined caps. API keys scope what automation can do. Webhooks fire signed callbacks on every on-chain event.',
                    color: 'border-l-amber-500',
                  },
                ].map(item => (
                  <div key={item.title} className={`pl-4 border-l-2 ${item.color} py-1`}>
                    <p className="text-[10px] font-bold font-mono text-zinc-200 uppercase tracking-widest mb-1">
                      {item.title}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── WHO CAN USE IT ── */}
          <section ref={whoRef} className={reveal(whoVis)}>
            <SectionLabel>Who can use it</SectionLabel>
            <SectionHeading>Built for anyone billing on-chain.</SectionHeading>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <UserCard
                icon={Icons.freelancer}
                title="Freelancers"
                desc="Send private invoices to clients without broadcasting your rate to competitors. Your billing history stays between you and your client."
                tags={['Single invoices', 'Private amounts', 'Pay links']}
              />
              <UserCard
                icon={Icons.agency}
                title="Agencies & Studios"
                desc="Invoice multiple clients at different rates without leaking your pricing model on-chain. Use Zapier to automate invoice creation from your CRM."
                tags={['Automation', 'API keys', 'Zapier']}
              />
              <UserCard
                icon={Icons.dao}
                title="DAOs & Communities"
                desc="Pay contributors confidentially. Use itemized invoices for team expense splits. Keep treasury movements from being front-run or profiled."
                tags={['Multi-pay', 'Itemized', 'On-chain']}
              />
              <UserCard
                icon={Icons.merchant}
                title="Web3 Merchants"
                desc="Accept cUSDC payments for goods and services. Generate a QR code for in-person or remote payments. Get Telegram alerts when payments land."
                tags={['QR codes', 'Telegram', 'cUSDC']}
              />
              <UserCard
                icon={Icons.charity}
                title="Charities & Fundraisers"
                desc="Launch donation pages with goals and deadlines. Donors encrypt their own contributions. You track total progress without seeing individual amounts."
                tags={['Donation pages', 'FHE amounts', 'Goals']}
              />
              <UserCard
                icon={Icons.developer}
                title="Developers"
                desc="Build on top of Zeroremit using the public API, webhooks, and API keys. Trigger invoice creation from any external system via a simple POST request."
                tags={['REST API', 'Webhooks', 'HMAC signing']}
              />
            </div>
          </section>

          {/* ── HOW TO USE ── */}
          <section ref={stepsRef} className={reveal(stepsVis)}>
            <SectionLabel>How to use it</SectionLabel>
            <SectionHeading>From wallet connection to paid invoice.</SectionHeading>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StepCard
                n="01"
                title="Connect your wallet"
                desc="Connect any EVM-compatible wallet (MetaMask, WalletConnect). Your wallet address is your identity — no account or sign-up needed."
                bullets={[
                  'MetaMask, Coinbase Wallet, WalletConnect all supported',
                  'Wallet address used as your invoice creator identity',
                  'No email or password required',
                ]}
              />
              <StepCard
                n="02"
                title="Create an invoice"
                desc="Choose your invoice type, fill in the details, and confirm. The amount is encrypted in your browser before your wallet signs."
                bullets={[
                  'Single: one recipient, private amount',
                  'Multi: open to anyone with the link, visible amounts',
                  'Donation: goal-based fundraising page',
                ]}
              />
              <StepCard
                n="03"
                title="Share the pay link"
                desc="Every invoice gets a unique URL and QR code generated from its on-chain ID. Share it anywhere — email, Telegram, social, or in person."
                bullets={[
                  'No app install required for the payer',
                  'QR code works for in-person payments',
                  'Link is valid until the invoice expires or is cancelled',
                ]}
              />
              <StepCard
                n="04"
                title="Get paid in cUSDC"
                desc="The payer opens the link, connects their wallet, and pays in cUSDC. The invoice status updates on-chain. You receive a Telegram notification."
                bullets={[
                  'Payment settles on Ethereum Sepolia',
                  'Invoice status flips from Pending to Paid on-chain',
                  'Telegram bot fires an instant notification',
                ]}
              />
            </div>
          </section>

          {/* ── STEPS TO FULL CONFIDENTIALITY ── */}
          <section ref={confidRef} className={reveal(confidVis)}>
            <SectionLabel>Achieving full confidentiality</SectionLabel>
            <SectionHeading>The steps that keep your amounts private.</SectionHeading>

            <p className="text-sm text-zinc-400 font-sans normal-case leading-relaxed mb-10 max-w-2xl">
              Confidentiality in Zeroremit is not a toggle — it is the result of
              several steps working together. Here is exactly what happens at each
              stage of the lifecycle.
            </p>

            <div className="space-y-3">
              {[
                {
                  phase: 'Phase 1 — Amount entry',
                  color: 'bg-sky-950/40 border-sky-900/40',
                  label: 'text-sky-400',
                  steps: [
                    'You type a number (e.g. 500) into the invoice form.',
                    'The amount never leaves the browser as plaintext.',
                    'The Zama WASM SDK initializes in your browser via WebAssembly.',
                  ],
                },
                {
                  phase: 'Phase 2 — FHE encryption',
                  color: 'bg-violet-950/40 border-violet-900/40',
                  label: 'text-violet-400',
                  steps: [
                    'The SDK converts the amount to a euint64 FHE ciphertext.',
                    'An input proof is generated — a zero-knowledge proof confirming the ciphertext is valid without revealing the value.',
                    'The contract address and your wallet address are bound into the ciphertext handle — meaning only your wallet can authorize decryption.',
                  ],
                },
                {
                  phase: 'Phase 3 — On-chain submission',
                  color: 'bg-emerald-950/40 border-emerald-900/40',
                  label: 'text-emerald-400',
                  steps: [
                    'Your wallet signs a transaction containing only the ciphertext handle and input proof — not the amount.',
                    'The PaymentRouter smart contract receives and stores the encrypted handle.',
                    'The Zama coprocessor verifies the input proof on-chain without decrypting.',
                    'The block explorer shows a ciphertext blob — no readable number anywhere.',
                  ],
                },
                {
                  phase: 'Phase 4 — Payment',
                  color: 'bg-amber-950/40 border-amber-900/40',
                  label: 'text-amber-400',
                  steps: [
                    'The payer opens the pay link and connects their wallet.',
                    'The payer\'s browser fetches the encrypted amount handle from the contract.',
                    'The payer signs the payment transaction — the amount is transferred as an FHE-encrypted value between cUSDC balances.',
                    'No plaintext amount is ever visible during transfer.',
                  ],
                },
                {
                  phase: 'Phase 5 — Decryption (optional)',
                  color: 'bg-rose-950/40 border-rose-900/40',
                  label: 'text-rose-400',
                  steps: [
                    'Either the creator or the recipient can request decryption from the dashboard.',
                    'A wallet-signed decryption request is sent to the Zama gateway.',
                    'The gateway verifies the signature — confirming you are an authorized party.',
                    'The decrypted amount is returned only to your browser session and never stored on-chain or in the database.',
                  ],
                },
              ].map(item => (
                <div key={item.phase} className={`p-5 border ${item.color}`}>
                  <p className={`text-[10px] font-bold font-mono uppercase tracking-widest mb-3 ${item.label}`}>
                    {item.phase}
                  </p>
                  <div className="space-y-2">
                    {item.steps.map((s, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className={`text-[10px] font-mono font-bold flex-shrink-0 mt-0.5 ${item.label}`}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
                          {s}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/10">
              <svg className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <p className="text-[10px] font-mono text-sky-400/80 leading-relaxed">
                The private key to your wallet never touches Zeroremit servers at any point in this process.
                All encryption, signing, and decryption happens either in your browser or
                through the Zama coprocessor network — not through Zeroremit's backend.
              </p>
            </div>
          </section>

          {/* ── CTA ── */}
          <section ref={ctaRef} className={`text-center ${reveal(ctaVis)}`}>
            <div className="max-w-xl mx-auto">
              <SectionLabel>Get started</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-white uppercase mb-4">
                Ready to send your first private invoice?
              </h2>
              <p className="text-sm text-zinc-400 font-sans normal-case leading-relaxed mb-8">
                Connect your wallet, create an invoice, and share the link.
                The encryption happens automatically.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/create"
                  className="w-full sm:w-auto px-8 py-3.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs tracking-widest uppercase transition-all">
                  Create invoice
                </Link>
                <Link to="/docs"
                  className="w-full sm:w-auto px-8 py-3.5 bg-transparent hover:bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 font-bold border border-zinc-800 text-xs tracking-widest uppercase transition-colors">
                  Read the docs
                </Link>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}