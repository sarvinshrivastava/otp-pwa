# Client-side crypto

The relay is a blind courier: it stores and forwards **ciphertext only**. All
encryption/decryption happens on the end devices (Android *source* → PWA
*destination*). This document describes the PWA side, implemented in
[`src/lib/crypto.ts`](../src/lib/crypto.ts).

## Threat model in one line

A fully compromised relay (or push provider) learns *that* an OTP exists and
*when*, but never its contents — because it never holds the AES key or plaintext.

## Primitives

| Concern        | Choice                                  |
|----------------|-----------------------------------------|
| Symmetric enc. | AES-256-GCM (Web Crypto `subtle`)       |
| Key agreement  | ECDH P-256 → HKDF-SHA256 (optional path)|
| Key storage    | Non-extractable `CryptoKey` in IndexedDB|
| Presence gate  | WebAuthn platform authenticator         |

### Why non-extractable keys

The AES key is imported with `extractable: false`. The browser will *use* it to
decrypt but will never return its raw bytes to JavaScript — so even script
injected via XSS cannot exfiltrate the key. The live `CryptoKey` object is
persisted directly in IndexedDB (it is structured-cloneable).

## Decrypt path (the common case)

1. Push signal arrives → notification → user taps → biometric/PIN gate passes.
2. PWA `POST /api/otp/claim {otpId}` (202) and waits on its WebSocket.
3. Relay returns `otp_payload {ciphertext, iv}` over the WS once the claim
   window resolves.
4. `decryptOTP(ciphertext, iv, key)` → AES-256-GCM decrypt → plaintext OTP.

The GCM auth tag is expected appended to the ciphertext (Web Crypto default),
so a tampered payload fails to decrypt rather than yielding garbage.

## Key provisioning (onboarding — "Option A")

Because the backend only mints a `deviceToken` from a **logged-in dashboard
session** (`POST /api/devices`, token returned once) and captures the push
subscription at create-time, a destination is provisioned **on the device
itself** while logged in. See [`src/routes/Onboard.tsx`](../src/routes/Onboard.tsx).

Onboarding establishes the shared AES key one of two ways:

- **Generate** (default): the PWA generates a fresh AES-256 key, stores a
  non-extractable copy, and displays the raw key **once** (QR + text) so it can
  be enrolled on the Android source out-of-band. The relay never sees it.
- **Import**: the PWA scans an existing key (base64 raw, 32 bytes) from the
  source via the camera and imports it non-extractable.

> The ECDH P-256 → HKDF helpers (`generateEcdhKeyPair`, `deriveSharedAesKey`)
> implement the key-agreement path described in the original handoff. They are
> ready for a future onboarding that exchanges public keys instead of a raw
> shared key, but the working Option A flow uses the raw-key generate/import
> paths above, since cross-device key agreement with the Android source is owned
> by that repo, not this one.

## The biometric gate

Implemented in [`src/lib/biometric.ts`](../src/lib/biometric.ts). The relay has
no WebAuthn verification endpoint, so this is a **local presence check**: a
platform credential is enrolled once, and each claim does an assertion with
`userVerification: 'required'`. We don't trust the signature — we rely on the OS
forcing a biometric/PIN prompt before the claim proceeds. Stored credentials
prove *the device* is authorized; the gate proves *a human is present now*.
