/**
 * Client-side password hashing for the shared `accounts` collection.
 *
 * There is no backend (Cloud Functions require the paid Blaze plan, which
 * this project intentionally avoids), so this is NOT a substitute for real
 * authentication — it exists purely so a stolen/misconfigured read of the
 * `accounts` collection exposes salted hashes instead of plaintext
 * passwords. The actual enforcement lives in Firestore rules, which reject
 * any account write that doesn't reproduce the correct hash exactly (see
 * firestore.rules in the foundry-planner repo — the shared source of truth
 * for this project's rules).
 *
 * The salt is derived deterministically from the username rather than
 * stored randomly: `accounts` reads are fully blocked (that's the whole
 * point), so the client can never read a stored salt back on a later login
 * attempt — it has to be able to reconstruct it from something it already
 * knows. A salt's job is uniqueness, not secrecy, and the username is
 * already effectively public (it's the Firestore document ID), so this
 * loses nothing versus a random-but-unreadable salt.
 *
 * IMPORTANT: these parameters must stay byte-for-byte identical across:
 *   - this file
 *   - foundry-planner's copy of the same file
 *   - the one-off Node migration script used to hash existing accounts
 * A mismatch means correct passwords will stop matching their stored hash.
 */

const PBKDF2_ITERATIONS = 100_000;
const HASH_BYTE_LENGTH   = 32; // 256-bit derived key
const SALT_PEPPER        = 'wos-wiki-salt:'; // fixed prefix, not a secret — just namespacing

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Deterministic per-account salt, hex-encoded, derived from the username. */
export async function deriveSaltHex(username: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT_PEPPER + username));
  return bytesToHex(new Uint8Array(digest)).slice(0, 32); // 16 bytes
}

/**
 * Firestore surfaces a permission-denied write rejection much slower than a
 * successful write resolves (observed: a correct-credential login settles
 * in ~1-2s; a wrong-credential one can hang 20s+ before the SDK reports the
 * rejection). Race the login write against a timeout so a wrong password
 * fails fast instead of leaving the UI stuck on a spinner indefinitely —
 * legitimate logins never come close to this, so it's safe to treat a
 * timeout the same as an explicit rejection.
 */
export function withLoginTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('login-timeout')), ms))
  ]);
}

/** PBKDF2-SHA256(password, salt, 100_000 iterations) → 32-byte hash, hex-encoded. */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_BYTE_LENGTH * 8
  );
  return bytesToHex(new Uint8Array(derivedBits));
}
