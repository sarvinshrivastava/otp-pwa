# otp-pwa

Frontend for a self-hosted, **end-to-end encrypted OTP relay**. A single Vite +
React + TypeScript PWA:

- **`/`** — destination receiver. Gets a Web Push *signal*, gates the fetch
  behind a biometric/PIN check, claims the OTP, receives the result over a
  WebSocket, and decrypts it client-side.
- **`/dashboard`** — device management (TOTP login, list/revoke devices, mint
  device tokens). `/onboard` provisions the current browser as a receiver.

The relay never sees plaintext or the AES key. See [`docs/CRYPTO.md`](docs/CRYPTO.md).

## Quick start

```bash
bun install
cp .env.example .env     # paste the relay's VAPID PUBLIC key
bun run dev              # http://localhost:5173  (proxies /api + /ws to :8080)
```

You also need the Go relay running locally (`otp-relay-backend`, `:8080`).

```bash
bun run build            # → dist/ (static files + service worker)
bun run preview          # serve the production build locally
```

## Architecture notes

- **No backend in this repo.** Vite builds static files; all calls are relative
  (`/api`, `/ws`) and resolved by Nginx in prod / the Vite proxy in dev.
- **Claims are async.** `POST /api/otp/claim` returns `202`; the payload arrives
  over the WebSocket after the relay's dual-claim window resolves.
- **PWA.** Installable, with a service worker that handles signal-only Web Push.
- **Crypto.** AES-256-GCM via Web Crypto; non-extractable keys in IndexedDB;
  WebAuthn presence gate before every claim.

## Stack

Vite · React 19 · React Router 7 · Tailwind v4 · `vite-plugin-pwa` (Workbox) ·
`@zxing/browser` (scan) · `qrcode.react` (display) · Web Crypto · native `fetch`.

See [`CLAUDE.md`](CLAUDE.md) for the file map and the full local-dev/deploy notes.
