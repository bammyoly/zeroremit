import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits } from 'viem';
import { useZamaEncrypt } from '../hooks/useZamaEncrypt';

import DonationVaultArtifact    from '../contracts/DonationVault.json';
import ConfidentialUSDCArtifact from '../contracts/ConfidentialUSDC.json';
import addresses                from '../contracts/addresses.json';

const VAULT_ADDRESS = addresses.DonationVault;
const CUSDC_ADDRESS = addresses.cUSDC;
const USDC_ADDRESS  = addresses.USDC;
const VAULT_ABI     = DonationVaultArtifact.abi;
const CUSDC_ABI     = ConfidentialUSDCArtifact.abi;
const USDC_DECIMALS = 6;

// Get base API URL from env or fallback to localhost
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export default function DonationPage() {
  const { pageId } = useParams();
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { sdkReady } = useZamaEncrypt();

  // State
  const [page, setPage] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');
  
  const [amount, setAmount] = useState('');
  const [donating, setDonating] = useState(false);
  const [donateError, setDonateError] = useState('');
  const [successTx, setSuccessTx] = useState('');

  // Fetch Page Metadata from Backend
  useEffect(() => {
    async function loadPage() {
      try {
        setFetching(true);
        const res = await fetch(`${API_URL}/donations/pages/${pageId}`);
        if (!res.ok) throw new Error('Page not found');
        const data = await res.json();
        setPage(data);
      } catch (e) {
        setFetchError(e.message);
      } finally {
        setFetching(false);
      }
    }
    if (pageId) loadPage();
  }, [pageId]);

  const handleDonate = async () => {
    if (!amount || parseFloat(amount) <= 0) return setDonateError('Enter amount');
    setDonating(true);
    setDonateError('');

    try {
      const rawAmt = parseUnits(amount, USDC_DECIMALS);
      
      // 1. Authorize Vault on cUSDC
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const authTx = await walletClient.writeContract({
        address: CUSDC_ADDRESS,
        abi: CUSDC_ABI,
        functionName: 'setOperator',
        args: [VAULT_ADDRESS, expiry],
      });
      await publicClient.waitForTransactionReceipt({ hash: authTx });

      // 2. Perform FHE Donation
      // NOTE: This assumes your Vault uses einput for privacy. 
      // Replace with your specific contract logic if different.
      const { useZamaEncrypt: _useZama } = await import('../hooks/useZamaEncrypt');
      // Logic here would follow your specific FHE input pattern
      
      // SIMPLIFIED CALL FOR ON-CHAIN INTERACTION
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'donate', // Ensure this matches your DonationVault.sol
        args: [pageId, rawAmt], // This might need FHE handles depending on your SDK setup
        gas: 5_000_000n
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setSuccessTx(hash);
    } catch (e) {
      setDonateError(e.shortMessage || e.message);
    } finally {
      setDonating(false);
    }
  };

  if (fetching) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-mono">Loading Donation Page...</div>;
  if (fetchError) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-red-400 font-mono">Error: {fetchError}</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono p-4 sm:p-8">
      <div className="max-w-xl mx-auto mt-20 bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-white uppercase tracking-tighter mb-2">Donate to Campaign</h2>
        <p className="text-xs text-zinc-500 mb-6 break-all">ID: {pageId}</p>

        <div className="bg-zinc-950/60 p-4 border border-zinc-800/60 mb-6">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Creator</div>
          <div className="text-sm text-zinc-200">{page?.creator}</div>
          {page?.goal && (
            <div className="mt-4">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Goal / Description</div>
              <div className="text-sm text-zinc-300 font-sans">{page.goal}</div>
            </div>
          )}
        </div>

        {successTx ? (
          <div className="bg-emerald-950/20 border border-emerald-900/30 p-6 text-center">
            <div className="text-emerald-400 font-bold mb-2">Donation Successful!</div>
            <a href={`https://sepolia.etherscan.io/tx/${successTx}`} target="_blank" className="text-[10px] text-sky-400 underline uppercase">View Transaction</a>
            <button onClick={() => setSuccessTx('')} className="block w-full mt-4 text-[10px] text-zinc-500 uppercase">Donate More</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">Amount (cUSDC)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-14 bg-zinc-950 border border-zinc-800 pl-10 pr-4 text-white focus:outline-none focus:border-sky-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            {donateError && <div className="text-xs text-red-400 bg-red-950/20 p-2 border border-red-900/30">{donateError}</div>}

            {!isConnected ? (
              <button onClick={() => open()} className="w-full h-14 bg-sky-600 text-white font-bold uppercase tracking-widest">Connect Wallet</button>
            ) : (
              <button 
                onClick={handleDonate}
                disabled={donating}
                className="w-full h-14 bg-sky-500 hover:bg-sky-400 text-white font-bold uppercase tracking-widest disabled:opacity-50 transition-all"
              >
                {donating ? 'Processing...' : 'Send Confidential Donation'}
              </button>
            )}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-zinc-800 text-[10px] text-zinc-600 text-center uppercase tracking-widest">
          Powered by Zama FHE & Zeroremit
        </div>
      </div>
    </div>
  );
}