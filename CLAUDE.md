# CLAUDE.md — otp-pwa

The **frontend** of a self-hosted, end-to-end encrypted OTP relay. One Vite +
React + TS PWA: `/` is the destination receiver (push → biometric gate → claim →
decrypt), `/dashboard` manages devices. Built to static files, served by the
shared VPS Nginx; all API calls are relative (`/api`, `/ws`).

> Personal project. Use the personal GitHub token. Companion repos
> `otp-relay-backend` (Go) and `otp-android` (Kotlin) live alongside — **do not
> edit them from here**. The backend owns the API/WS contract
> (`otp-relay-backend/docs/API.md`).

## Run locally

```bash
bun install
cp .env.example .env          # paste the relay's VAPID PUBLIC key (see below)
bun run dev                   # Vite dev server on :5173
```

`bun run dev` proxies `/api` and `/ws` to a relay on `http://localhost:8080`
(see `vite.config.ts`), so app code uses relative URLs in every environment.
Run the relay locally with `RELAY_ENV=development go run .` in `otp-relay-backend`.

```bash
bun run build       # tsc -b && vite build  → dist/  (+ service worker)
bun run typecheck   # types only
```

### Required config

Web Push needs the relay's **VAPID public key** (`VITE_VAPID_PUBLIC_KEY` in
`.env`). It is the public half — safe to embed; the private key stays on the
relay. Generate with `go run ./cmd/gen-vapid` in the backend. This is the only
env var this repo needs.

## Key files

| Path | Role |
|------|------|
| `src/routes/Receive.tsx`   | `/` — push → biometric gate → claim → WS result → decrypt |
| `src/routes/Onboard.tsx`   | Option A: register THIS device (logged in) as a destination |
| `src/routes/Dashboard.tsx` | Device list, revoke, create device (one-time token) |
| `src/routes/Login.tsx`     | TOTP entry → session cookie |
| `src/lib/crypto.ts`        | AES-256-GCM decrypt, key gen/import, ECDH/HKDF |
| `src/lib/ws.ts`            | WebSocket client — claim results arrive here |
| `src/lib/api.ts`           | Typed fetch wrappers for `/api/*` |
| `src/lib/push.ts`          | Web Push subscription (VAPID) |
| `src/lib/storage.ts`       | IndexedDB device credentials (non-extractable key) |
| `src/lib/biometric.ts`     | Local WebAuthn presence gate |
| `src/sw/sw.ts`             | Service worker: precache + push (signal-only) handler |

## How the claim flow really works (differs from first-draft assumptions)

`POST /api/otp/claim` returns **202** — it does NOT return the OTP. The result
(`otp_payload` / `otp_invalidated`) is delivered asynchronously over the
device's **WebSocket** (`/ws?token=<deviceToken>`) once the dual-claim window
resolves. So the Receive view holds a WS open and registers a waiter *before*
claiming. The push body carries only `{type:"otp_available", otpId}` — never the
payload.

## Crypto flow

End-to-end: the relay only ever sees ciphertext. The PWA decrypts client-side
with a non-extractable AES key, gated by a WebAuthn biometric/PIN check before
every claim. Full details — including the "Option A" onboarding and key
provisioning — are in [`docs/CRYPTO.md`](docs/CRYPTO.md).

## Deploy

`.github/workflows/deploy.yml` (push to `main`) mirrors the otp-relay-backend
template: it fetches `VPS_HOST` + `VPS_SSH_KEY` from the secrets-manager using
the `SM_READ_TOKEN` GitHub secret, SSHes into the VPS, clones/pulls this repo to
`/root/apps/otp-pwa`, and runs `vps-deploy otp-pwa`. The per-repo build (static
build → `dist/` → the `otp-pwa-dist` Nginx volume) lives in `vps-deploy` on the
VPS, so the build runs there, not in the runner.

VPS-side prerequisites: `vps-deploy` must handle a static PWA (build + publish
`dist/`), and `VITE_VAPID_PUBLIC_KEY` must be present in that build environment
(it's baked into the bundle at build time).
