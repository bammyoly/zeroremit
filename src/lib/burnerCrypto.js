// frontend/src/lib/burnerCrypto.js
// Client-side AES-256-GCM encryption for burner private keys.
// The user's password never leaves the browser.
//
// Blob format (base64): salt(16) || iv(12) || tag(16) || ciphertext
// Note: Web Crypto's AES-GCM output is ciphertext||tag concatenated,
// so on decrypt we pass the whole tail (iv comes first, then tag+ct).

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const PBKDF2_ITERATIONS = 600_000;
const SALT_LEN = 16;
const IV_LEN   = 12;

// ── Key generation ────────────────────────────────────────────────────────
export function newBurnerKeyPair() {
  const privateKey = generatePrivateKey();          // 0x + 64 hex chars
  const address    = privateKeyToAccount(privateKey).address;
  return { privateKey, address };
}

export function deriveAddressFromKey(privateKey) {
  return privateKeyToAccount(privateKey).address;
}

// ── PBKDF2 key derivation ─────────────────────────────────────────────────
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────
/**
 * Encrypt a burner private key with the user's password.
 * @param {string} privateKey  0x-prefixed hex private key
 * @param {string} password
 * @returns {Promise<string>}  base64 blob (salt || iv || ct+tag)
 */
export async function encryptWithPassword(privateKey, password) {
  if (typeof privateKey !== 'string' || !privateKey.startsWith('0x')) {
    throw new Error('encryptWithPassword: expected 0x-prefixed hex string');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }

  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv   = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key  = await deriveKey(password, salt);

  const ctBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(privateKey)
  );
  const ct = new Uint8Array(ctBuffer);

  // Pack salt || iv || ciphertext(+tag)
  const packed = new Uint8Array(salt.length + iv.length + ct.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(ct, salt.length + iv.length);

  return btoa(String.fromCharCode(...packed));
}

/**
 * Decrypt a password-encrypted burner private key blob.
 * @param {string} blob      base64 output of encryptWithPassword()
 * @param {string} password
 * @returns {Promise<string>}  0x-prefixed hex private key
 */
export async function decryptWithPassword(blob, password) {
  let raw;
  try {
    raw = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
  } catch {
    throw new Error('invalid blob format');
  }
  if (raw.length < SALT_LEN + IV_LEN + 16 + 1) {
    throw new Error('blob too short');
  }

  const salt = raw.slice(0, SALT_LEN);
  const iv   = raw.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ct   = raw.slice(SALT_LEN + IV_LEN);
  const key  = await deriveKey(password, salt);

  let plaintextBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    // Web Crypto throws OperationError on wrong password or tampered blob
    throw new Error('wrong password or corrupted key');
  }
  return new TextDecoder().decode(plaintextBuffer);
}