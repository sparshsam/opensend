/**
 * OpenSend v0.8.0 — Optional End-to-End Encryption
 *
 * Provides an optional app-level encryption layer on top of WebRTC's
 * built-in DTLS encryption. Uses AES-256-GCM with a key derived from
 * the transfer secret via PBKDF2.
 *
 * This is OPTIONAL — the sender can choose to enable it. If enabled,
 * every chunk is encrypted before being sent over the DataChannel,
 * and decrypted on the receiver side.
 *
 * Even without this layer, WebRTC DataChannels are encrypted by DTLS
 * at the transport level. This provides defense-in-depth.
 */

const SALT = 'OpenSend-v0.8-E2EE';
const ITERATIONS = 600000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // AES-GCM standard

/**
 * Derive an AES-256-GCM key from a shared secret (transfer_secret).
 * Both sender and receiver must use the same secret.
 */
export async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt data using AES-256-GCM.
 * Returns the IV prepended to the ciphertext (for transport).
 */
export async function encryptChunk(
  key: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data as unknown as BufferSource,
  );
  // Prepend IV to ciphertext
  const result = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), IV_LENGTH);
  return result;
}

/**
 * Decrypt data that was encrypted with encryptChunk.
 * Expects IV (12 bytes) prepended to ciphertext.
 */
export async function decryptChunk(
  key: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array> {
  if (data.length < IV_LENGTH + 1) {
    throw new Error('Encrypted data too short');
  }
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new Uint8Array(decrypted);
}

/**
 * Check if the Web Crypto API supports AES-GCM (required for E2EE).
 */
export function isE2EESupported(): boolean {
  return typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt !== 'undefined';
}
