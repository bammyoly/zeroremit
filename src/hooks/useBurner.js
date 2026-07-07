// frontend/src/hooks/useBurner.js
import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import {
  apiGetBurner,
  apiCreateBurner,
  apiExportBurner,
  apiDisableAutomation,
  apiEnableAutomation,
  apiDeleteBurner,
} from '../lib/api.js';
import {
  newBurnerKeyPair,
  encryptWithPassword,
  decryptWithPassword,
  deriveAddressFromKey,
} from '../lib/burnerCrypto.js';

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL;

// ── ABIs used by sweep ────────────────────────────────────────────────────────

const USDC_BALANCE_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}];

const USDC_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}];

const CUSDC_HANDLE_ABI = [{
  name: 'confidentialBalanceOf', type: 'function', stateMutability: 'view',
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'bytes32' }],
}];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read API key from localStorage without any prompt fallback.
 * Returns null if not found — caller decides what to do.
 */
function getLocalApiKey(wallet) {
  if (!wallet) return null;
  try {
    return localStorage.getItem(`zeroremit_api_key_${wallet.toLowerCase()}`) || null;
  } catch {
    return null;
  }
}

/**
 * Build a read-only public client for Sepolia.
 */
function makePublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL, { timeout: 60_000, retryCount: 3 }),
  });
}

/**
 * Build a signing wallet client for a given account.
 */
function makeWalletClient(account) {
  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL, { timeout: 60_000, retryCount: 3 }),
  });
}

/**
 * Decrypt the burner private key from the user-encrypted blob.
 * Returns { account, rawPrivateKey } or throws on wrong password.
 */
async function decryptBurnerKey(mainWallet, expectedBurnerAddress, password) {
  const { encryptedKey_user } = await apiExportBurner(mainWallet);
  const rawPrivateKey = await decryptWithPassword(encryptedKey_user, password);

  const account = privateKeyToAccount(rawPrivateKey);
  if (account.address.toLowerCase() !== expectedBurnerAddress.toLowerCase()) {
    throw new Error('Decrypted key does not match burner address');
  }

  return { account, rawPrivateKey };
}

/**
 * Turn viem's verbose errors into user-friendly messages.
 */
function friendlyError(e) {
  const raw = e?.shortMessage || e?.details || e?.message || 'Operation failed';
  if (raw.includes('insufficient funds') || raw.includes('total cost')) {
    return 'Not enough ETH to cover gas. Fund the burner with a bit more ETH.';
  }
  if (raw.includes('wrong password') || raw.includes('corrupted')) {
    return 'Wrong password.';
  }
  if (raw.includes('rejected') || raw.includes('User rejected')) {
    return 'Transaction cancelled.';
  }
  if (raw.length > 200) {
    return raw.split('\n')[0].slice(0, 200);
  }
  return raw;
}

// ═════════════════════════════════════════════════════════════════════════════
// HOOK
// ═════════════════════════════════════════════════════════════════════════════

/**
 * useBurner(address)
 *
 * Manages the burner wallet lifecycle for a given main wallet.
 * Eagerly fetches burner metadata on mount / address change (backend only,
 * no RPC calls until the tab is actually opened).
 *
 * Returns:
 *   burner              — { burnerAddress, automationEnabled, createdAt } | null
 *   loading             — initial fetch in progress
 *   error               — last operation error message
 *   refresh()           — re-fetch metadata
 *   create(password)    — generate + encrypt + POST; returns raw key for backup
 *   importKey(pk, pw)   — import an existing key
 *   disableAutomation() — server key deleted
 *   enableAutomation(password) — decrypts locally, re-uploads raw key
 *   remove()            — full delete
 *   sweep(password)     — sweep ETH only
 *   sweepAll(password, callbacks) — sweep cUSDC + USDC + ETH sequentially
 *   clearError()        — reset error state
 */
export function useBurner(address) {
  const [burner,  setBurner]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── Fetch metadata ──────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!address) { setBurner(null); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiGetBurner(address);
      if (res?.exists) {
        setBurner({
          burnerAddress:     res.burnerAddress,
          automationEnabled: res.automationEnabled,
          createdAt:         Number(res.createdAt),
        });
      } else {
        setBurner(null);
      }
    } catch (e) {
      setError(e.message);
      setBurner(null);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Create new burner ───────────────────────────────────────────────────

  const create = useCallback(async (password) => {
    if (!address) throw new Error('Connect a wallet first');
    setError('');
    try {
      const { privateKey, address: burnerAddress } = newBurnerKeyPair();
      const encryptedKey_user = await encryptWithPassword(privateKey, password);

      await apiCreateBurner({
        wallet: address,
        burnerAddress,
        encryptedKey_user,
        rawPrivateKey: privateKey,
      });

      await refresh();
      return { privateKey, burnerAddress };
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [address, refresh]);

  // ── Import existing key ────────────────────────────────────────────────

  const importKey = useCallback(async (rawPrivateKey, password) => {
    if (!address) throw new Error('Connect a wallet first');
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawPrivateKey)) {
      throw new Error('Invalid private key format');
    }
    setError('');
    try {
      const burnerAddress = deriveAddressFromKey(rawPrivateKey);
      const encryptedKey_user = await encryptWithPassword(rawPrivateKey, password);

      await apiCreateBurner({
        wallet: address,
        burnerAddress,
        encryptedKey_user,
        rawPrivateKey,
      });

      await refresh();
      return { privateKey: rawPrivateKey, burnerAddress };
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [address, refresh]);

  // ── Disable automation ─────────────────────────────────────────────────

  const disableAutomation = useCallback(async () => {
    if (!address) return;
    setError('');
    try {
      await apiDisableAutomation(address);
      await refresh();
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [address, refresh]);

  // ── Re-enable automation ───────────────────────────────────────────────

  const enableAutomation = useCallback(async (password) => {
    if (!address) return;
    setError('');
    try {
      const { encryptedKey_user } = await apiExportBurner(address);
      const rawPrivateKey = await decryptWithPassword(encryptedKey_user, password);
      await apiEnableAutomation(address, rawPrivateKey);
      await refresh();
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [address, refresh]);

  // ── Remove burner entirely ─────────────────────────────────────────────

  const remove = useCallback(async () => {
    if (!address) return;
    setError('');
    try {
      await apiDeleteBurner(address);
      setBurner(null);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, [address]);

  // ── Sweep ETH only ─────────────────────────────────────────────────────

  const sweep = useCallback(async (password) => {
    if (!address) throw new Error('Connect a wallet first');
    if (!burner)  throw new Error('No burner to sweep from');
    setError('');

    try {
      const { account } = await decryptBurnerKey(address, burner.burnerAddress, password);
      const publicClient = makePublicClient();
      const walletClient = makeWalletClient(account);

      const [balance, block] = await Promise.all([
        publicClient.getBalance({ address: account.address }),
        publicClient.getBlock({ blockTag: 'latest' }),
      ]);

      if (balance === 0n) throw new Error('Burner has zero ETH — nothing to sweep');

      const baseFee     = block.baseFeePerGas ?? 1_500_000_000n;
      const priorityFee = 1_500_000_000n;
      const maxFeePerGas = baseFee * 3n + priorityFee;
      const gasLimit     = 21_000n;
      const maxTxCost    = gasLimit * maxFeePerGas;

      if (balance <= maxTxCost) {
        throw new Error('Burner balance too low to cover gas');
      }

      const value = balance - maxTxCost;

      const hash = await walletClient.sendTransaction({
        to: address,
        value,
        gas: gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas: priorityFee,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error('Sweep transaction reverted on-chain');
      }

      return { hash, value };
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      throw new Error(msg);
    }
  }, [address, burner]);

  // ── sweepAll — cUSDC (backend) → USDC → ETH sequentially ──────────────

  const sweepAll = useCallback(async (password, callbacks = {}) => {
    const {
      onCusdcStart, onCusdcDone, onCusdcSkip,
      onUsdcStart,  onUsdcDone,  onUsdcSkip,
      onEthStart,   onEthDone,   onEthSkip,
    } = callbacks;

    setError('');
    if (!burner)  throw new Error('No burner wallet');
    if (!address) throw new Error('No main wallet connected');

    // ── Step A: Decrypt burner key ─────────────────────────────────────────
    const { account } = await decryptBurnerKey(address, burner.burnerAddress, password);

    const publicClient = makePublicClient();
    const walletClient = makeWalletClient(account);

    const addresses = (await import('../contracts/addresses.json')).default;
    const USDC_ADDRESS  = addresses.USDC;
    const CUSDC_ADDRESS = addresses.cUSDC;

    // ── Step 1: Sweep cUSDC via backend ────────────────────────────────────
    // Uses the server-side sweep endpoint which decrypts the balance,
    // re-encrypts it, and signs the confidentialTransfer with the burner key.
    // Requires an API key stored in localStorage.
    try {
      // Check if burner actually has cUSDC before calling backend
      const handle = await publicClient.readContract({
        address:      CUSDC_ADDRESS,
        abi:          CUSDC_HANDLE_ABI,
        functionName: 'confidentialBalanceOf',
        args:         [account.address],
      });

      if (BigInt(handle) === 0n) {
        onCusdcSkip?.();
      } else {
        onCusdcStart?.();

        // Get API key from localStorage — no prompt fallback
        const apiKey = getLocalApiKey(address);

        if (!apiKey) {
          throw new Error(
            'No API key cached locally. Go to Automation → API Keys, ' +
            'generate a key, then try again.'
          );
        }

        const { apiSweepBurnerCusdc } = await import('../lib/api.js');
        const result = await apiSweepBurnerCusdc(apiKey, address);

        if (result.empty) {
          onCusdcSkip?.();
        } else if (result.txHash) {
          onCusdcDone?.(result.txHash);
        } else {
          onCusdcSkip?.();
        }
      }
    } catch (e) {
      console.error('[sweepAll] cUSDC step failed:', e.message);
      onCusdcSkip?.();
      // Don't throw — continue to USDC and ETH steps
    }

    // ── Step 2: Sweep USDC ─────────────────────────────────────────────────
    try {
      const usdcBal = await publicClient.readContract({
        address:      USDC_ADDRESS,
        abi:          USDC_BALANCE_ABI,
        functionName: 'balanceOf',
        args:         [account.address],
      });

      if (usdcBal === 0n) {
        onUsdcSkip?.();
      } else {
        onUsdcStart?.();

        const tx = await walletClient.writeContract({
          address:      USDC_ADDRESS,
          abi:          USDC_TRANSFER_ABI,
          functionName: 'transfer',
          args:         [address, usdcBal],
          gas:          100_000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        onUsdcDone?.(tx);
      }
    } catch (e) {
      console.error('[sweepAll] USDC step failed:', e.message);
      onUsdcSkip?.();
    }

    // ── Step 3: Sweep ETH last ─────────────────────────────────────────────
    // Done last because previous steps consume gas from the ETH balance.
    try {
      const [ethBal, block] = await Promise.all([
        publicClient.getBalance({ address: account.address }),
        publicClient.getBlock({ blockTag: 'latest' }),
      ]);

      if (ethBal === 0n) {
        onEthSkip?.();
      } else {
        onEthStart?.();

        const baseFee      = block.baseFeePerGas ?? 1_500_000_000n;
        const priorityFee  = 1_500_000_000n;
        const maxFeePerGas = baseFee * 3n + priorityFee;
        const gasLimit     = 21_000n;
        const maxTxCost    = gasLimit * maxFeePerGas;

        if (ethBal <= maxTxCost) {
          // Not enough to cover gas — skip instead of throwing
          onEthSkip?.();
        } else {
          const value = ethBal - maxTxCost;

          const tx = await walletClient.sendTransaction({
            to: address,
            value,
            gas: gasLimit,
            maxFeePerGas,
            maxPriorityFeePerGas: priorityFee,
          });
          await publicClient.waitForTransactionReceipt({ hash: tx });
          onEthDone?.(tx);
        }
      }
    } catch (e) {
      console.error('[sweepAll] ETH step failed:', e.message);
      onEthSkip?.();
    }
  }, [burner, address]);

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    burner,
    loading,
    error,
    refresh,
    create,
    importKey,
    disableAutomation,
    enableAutomation,
    remove,
    sweep,
    sweepAll,
    clearError: () => setError(''),
  };
}