import React from 'react'

const Footer = () => {
  return (
    <div>
              {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900/60 px-4 py-8 bg-zinc-950">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center
          justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 tracking-wider">
              ZEROREMIT //
            </span>
            <span className="text-xs text-zinc-600 uppercase">
              Confidential invoicing on Ethereum
            </span>
          </div>
          <div className="flex items-center gap-5 text-[10px] tracking-wider
            text-zinc-500 uppercase">
            <a href="/explorer"  className="hover:text-sky-400 transition-colors">Explorer</a>
            <a href="https://docs.zama.org" target='_blank' className="hover:text-sky-400 transition-colors">Zama Docs</a>
            <span className="text-emerald-400 font-bold">Sepolia · Live</span>
          </div>
        </div>
      </footer>

    </div>
  )
}

export default Footer