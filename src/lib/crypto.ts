// Client-side crypto via the Web Crypto API. The relay NEVER receives plaintext
// or the AES key — payloads arrive as AES-256-GCM ciphertext and are decrypted
// here, in the destination browser. See docs/CRYPTO.md for the full flow.

const HKDF_INFO = "otp-relay/aes-256-gcm/v1";

// --- base64 <-> ArrayBuffer ---------------------------------------------------

export function base64ToBuffer(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// --- decrypt ------------------------------------------------------------------

/**
 * Decrypts an AES-256-GCM OTP payload. `key` is the non-extractable CryptoKey
 * provisioned at onboarding (stored in IndexedDB). The GCM auth tag is expected
 * to be appended to the ciphertext, which is the Web Crypto default.
 */
export async function decryptOTP(
  ciphertextB64: string,
  ivB64: string,
  key: CryptoKey,
): Promise<string> {
  const ciphertext = base64ToBuffer(ciphertextB64);
  const iv = base64ToBuffer(ivB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// --- key provisioning ---------------------------------------------------------

/**
 * Imports a raw 32-byte (base64) AES key as a non-extractable CryptoKey suitable
 * for IndexedDB storage. Used when the shared E2E key is delivered directly
 * (e.g. enrolled out-of-band with the Android source).
 */
export async function importRawAesKey(
  rawB64: string,
  extractable = false,
): Promise<CryptoKey> {
  const raw = base64ToBuffer(rawB64);
  if (raw.length !== 32) {
    throw new Error(`expected a 32-byte AES-256 key, got ${raw.length} bytes`);
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, extractable, [
    "decrypt",
  ]);
}

/**
 * Generates a fresh AES-256 key and returns BOTH a non-extractable handle (to
 * persist) and its raw base64 (to display/QR exactly once so it can be enrolled
 * on the source device). The raw form is produced from a throwaway extractable
 * key and never persisted.
 */
export async function generateAesKey(): Promise<{
  key: CryptoKey;
  rawB64: string;
}> {
  const extractable = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = await crypto.subtle.exportKey("raw", extractable);
  const rawB64 = bufferToBase64(raw);
  const key = await importRawAesKey(rawB64, false);
  return { key, rawB64 };
}

// --- ECDH key agreement (documented onboarding path) --------------------------

/** Generates an ECDH P-256 keypair. The private key stays in the browser. */
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
}

/** Exports an ECDH public key as base64 (raw/SPKI-less raw point) for the QR/invite. */
export async function exportPublicKeyB64(
  publicKey: CryptoKey,
): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return bufferToBase64(raw);
}

/**
 * Derives the shared AES-256-GCM key from our ECDH private key and the peer's
 * public key (base64 raw point), via HKDF-SHA256. Result is non-extractable.
 */
export async function deriveSharedAesKey(
  privateKey: CryptoKey,
  peerPublicKeyB64: string,
): Promise<CryptoKey> {
  const peerPublic = await crypto.subtle.importKey(
    "raw",
    base64ToBuffer(peerPublicKeyB64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH -> raw shared secret -> HKDF -> AES key. We go through deriveBits +
  // importKey('HKDF') because deriveKey can't chain ECDH directly into HKDF.
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublic },
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new Uint8Array(new TextEncoder().encode(HKDF_INFO)),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["decrypt"],
  );
}
