// src/pages/Integrations.jsx
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

// ── Integration Card ──────────────────────────────────────────────────────────
function IntegrationCard({ icon, name, status, desc, route, btnText, comingSoon, comingSoonNote }) {
  if (comingSoon) {
    return (
      <div className="group p-6 bg-zinc-900/10 border border-zinc-800/40 flex flex-col justify-between relative overflow-hidden">
        {/* Coming soon overlay tint */}
        <div className="absolute inset-0 bg-zinc-950/40 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-5">
            <div className="w-10 h-10 bg-zinc-900 border border-zinc-800/60 flex items-center justify-center opacity-60">
              {icon}
            </div>
            <span className="text-[9px] font-bold font-mono px-2 py-0.5 border tracking-wider uppercase text-amber-400 border-amber-500/20 bg-amber-500/5">
              Coming Soon
            </span>
          </div>

          <h3 className="text-sm font-bold font-mono tracking-wider text-zinc-400 mb-2 uppercase">
            {name}
          </h3>

          <p className="text-xs text-zinc-500 leading-relaxed font-sans normal-case mb-4">
            {desc}
          </p>

          {/* Feature bullets */}
          {comingSoonNote && (
            <div className="space-y-1.5 mb-6">
              {comingSoonNote.map((note, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400/60 text-[10px] font-mono flex-shrink-0 mt-0.5">→</span>
                  <span className="text-[10px] font-mono text-zinc-600 leading-relaxed">{note}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative z-10">
          <div className="w-full text-center py-2.5 bg-zinc-900/60 border border-zinc-800/60
            text-zinc-600 text-xs font-bold uppercase tracking-widest cursor-not-allowed select-none">
            Coming Soon
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group p-6 bg-zinc-900/10 border border-zinc-800/40
      hover:border-sky-500/30 hover:bg-zinc-900/40 transition-all duration-300 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-5">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800/60
            flex items-center justify-center group-hover:border-sky-500/20 transition-all duration-200">
            {icon}
          </div>
          <span className={`text-[9px] font-bold font-mono px-2 py-0.5 border tracking-wider uppercase
            ${status === 'Active'
              ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
              : 'text-zinc-500 border-zinc-800 bg-zinc-950/40'}`}>
            {status}
          </span>
        </div>
        <h3 className="text-sm font-bold font-mono tracking-wider text-zinc-200 mb-2 uppercase">
          {name}
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed font-sans normal-case mb-6">
          {desc}
        </p>
      </div>
      <Link
        to={route}
        className="w-full block text-center py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800
          hover:border-sky-500/20 text-zinc-400 hover:text-zinc-200 text-xs font-bold uppercase tracking-widest transition-all">
        {btnText || 'Configure Connection'}
      </Link>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const Icons = {
  telegram: (
    <svg className="w-5 h-5 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  zapier: (
    <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.44 17.89l-1.901-3.865-3.865 1.902.976-4.27-4.27-.976 3.864-1.902-1.901-3.864 4.27.976.976-4.27 1.902 3.864 3.864-1.901-.976 4.27 4.27.976-3.864 1.901 1.901 3.865-4.27-.976-.976 4.27z"/>
    </svg>
  ),
  card: (
    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/>
    </svg>
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
export default function Integrations() {
  const [headerRef, headerVis] = useReveal();
  const [gridRef,   gridVis]   = useReveal();
  const [cardRef,   cardVis]   = useReveal();
  const [infoRef,   infoVis]   = useReveal();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono selection:bg-sky-400 selection:text-zinc-950">

      {/* ── Background glow ── */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[750px] h-[400px] bg-sky-500/[0.03] blur-[140px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">

        {/* ── Header ── */}
        <header ref={headerRef} className={`mb-16 border-b border-zinc-900/80 pb-12 flex flex-col items-center text-center ${reveal(headerVis)}`}>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter uppercase mb-4 bg-gradient-to-r from-zinc-400 via-zinc-100 to-sky-400 bg-clip-text text-transparent">
            Application Integrations
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed font-sans normal-case">
            Connect Zeroremit to external notification spaces and inbound merchant pipelines.
            Automate real-time transaction flags or programmatic invoice handling using Zapier rulesets
            and native webhooks without exposing plaintext cryptographic ledger states.
          </p>
        </header>

        {/* ── Live integrations grid ── */}
        <section ref={gridRef} className={reveal(gridVis, 'delay-100')}>
          <div className="mb-4">
            <p className="text-[10px] font-bold font-mono text-sky-400 uppercase tracking-widest mb-1">// Live</p>
            <h2 className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-wide">Active Integrations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">

            <IntegrationCard
              icon={Icons.telegram}
              name="Telegram Bot API"
              status="Active"
              desc="Link web3 wallets directly to the native @ZeroRemitBot workspace. Instantly forward cUSDC payment notifications, localized milestone alerts, and custom receipt data straight to your private chat streams."
              route="/integrations/telegram-api"
              btnText="Configure Bot"
            />

            <IntegrationCard
              icon={Icons.zapier}
              name="Zapier & Webhooks"
              status="Active"
              desc="Register HTTPS endpoints that receive real-time HMAC-signed callbacks whenever invoices are created, paid, cancelled, or expired. Wire them to Zapier, Make.com, Slack, Discord, or any custom app."
              route="/integrations/zapier"
              btnText="Configure Webhooks"
            />

          </div>
        </section>

        {/* ── Coming soon ── */}
        <section ref={cardRef} className={reveal(cardVis, 'delay-150')}>
          <div className="mb-4">
            <p className="text-[10px] font-bold font-mono text-amber-400 uppercase tracking-widest mb-1">// Roadmap</p>
            <h2 className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-wide">Coming Soon</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <IntegrationCard
              icon={Icons.card}
              name="Zeroremit Card"
              comingSoon
              desc="A private card profile backed by encrypted key material. Accept payments without requiring the payer to connect a wallet at checkout time — powered by the Zama FHE relayer authorization flow."
              comingSoonNote={[
                'PIN + card secret local access — key material never leaves the device unencrypted',
                'Per-token spending caps and on-chain card profile records',
                'Card payment path works without payer wallet connection at checkout',
                'Top-up from main wallet, sweep back at any time',
                'Relayer-backed card authorization — no plaintext private key exposure',
                'Works on both direct pay route and hosted checkout pages',
              ]}
            />

            {/* Placeholder slot — future integrations */}
            <div className="p-6 bg-zinc-900/5 border border-zinc-800/20 border-dashed flex flex-col items-center justify-center text-center min-h-[280px]">
              <div className="w-10 h-10 bg-zinc-900/60 border border-zinc-800/40 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
              </div>
              <p className="text-[10px] font-bold font-mono text-zinc-700 uppercase tracking-widest mb-1">
                More coming
              </p>
              <p className="text-[10px] font-mono text-zinc-700 leading-relaxed max-w-[180px]">
                Additional integrations are in development
              </p>
            </div>

          </div>
        </section>

        {/* ── How Slack / Discord / Facebook work ── */}
        <section className="mt-12">
          <div className="p-6 bg-zinc-900/10 border border-zinc-800/40">
            <p className="text-[10px] font-bold font-mono text-sky-400 uppercase tracking-widest mb-1">
              // Via Zapier & Webhooks
            </p>
            <h3 className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-wide mb-4">
              Slack · Discord · Facebook Lead Ads
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed font-sans normal-case mb-5">
              Slack, Discord, and Facebook Lead Ads are all supported today through the
              Zapier & Webhooks integration. No separate connector needed.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              {[
                {
                  icon: (
                    <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 0 1-1.873-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.894.077.077 0 0 1-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                    </svg>
                  ),
                  label: 'Discord',
                  how: 'Your webhook → Zapier → Discord channel message',
                },
                {
                  icon: (
                    <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                  ),
                  label: 'Slack',
                  how: 'Your webhook → Zapier → Slack channel message',
                },
                {
                  icon: (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  ),
                  label: 'Facebook Lead Ads',
                  how: 'New lead → Zapier → POST /api/public/invoices → email pay link',
                },
              ].map(item => (
                <div key={item.label} className="px-4 py-3 bg-zinc-950/60 border border-zinc-800/60">
                  <div className="flex items-center gap-2 mb-2">
                    {item.icon}
                    <span className="text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-widest">
                      {item.label}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-600 leading-relaxed">{item.how}</p>
                </div>
              ))}
            </div>
            <Link
              to="/integrations/zapier"
              className="inline-flex items-center gap-2 text-[10px] font-bold font-mono text-sky-400 hover:text-sky-300 uppercase tracking-widest transition-colors">
              View setup guides →
            </Link>
          </div>
        </section>

        {/* ── Footer note ── */}
        <footer ref={infoRef} className={`mt-12 pt-10 border-t border-zinc-900/50 ${reveal(infoVis, 'delay-200')}`}>
          <div className="p-6 bg-zinc-950/40 border border-zinc-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold font-mono text-sky-400 uppercase tracking-widest">
                // Encryption Tunneling Protocol
              </p>
              <p className="text-xs text-zinc-400 font-sans normal-case leading-relaxed max-w-3xl">
                Third-party workflow nodes act solely as notification routers and structural triggers.
                FHE-protected values and sensitive account keys stay strictly encrypted inside secure runtime memory layers,
                preserving structural wallet anonymity across external network hubs.
              </p>
            </div>
            <div className="text-[11px] font-mono text-zinc-600 border border-zinc-900 px-3 py-2 bg-zinc-950/80 whitespace-nowrap">
              Secure Webhook Relay: Active
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}