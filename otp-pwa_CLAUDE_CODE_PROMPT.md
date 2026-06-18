# Claude Code Handoff — `otp-pwa`

> Read this entire file before writing any code. Use Plan Mode for initial breakdown.

---

## 1. What this repo is

The **frontend** of a self-hosted OTP relay system. A single Vite + React + TypeScript
app that serves two purposes via React Router:

- `/` — **Receive view**: destination client PWA. Gets Web Push notifications,
  gates fetch behind biometric/PIN, decrypts OTP, writes to clipboard.
- `/dashboard` — **Dashboard UI**: device management, QR onboarding, TOTP login.
  Talks to the Go relay's REST API at `/api`.

Built dist is deployed to the VPS and served as static files by Nginx.
There is **no Node.js backend in this repo** — all API calls go directly to
`otp.vps.sarvinshrivastava.space/api`.

**Companion repos (do not touch):**
- `otp-relay` — Go backend (owns all API + WS logic)
- `otp-android` — Kotlin Android source client

---

## 2. Non-negotiable requirements

- **No backend in this repo.** Vite builds to static files only.
- **All API calls go to `/api/*`** — use a relative base URL so it works
  behind Nginx without hardcoding the domain.
- **Crypto happens client-side.** AES-256-GCM decrypt using Web Crypto API
  (`window.crypto.subtle`). The relay never receives plaintext.
- **Biometric gate before any OTP fetch.** Use Web Authentication API
  (`navigator.credentials`) for biometric/PIN. Only call `/api/otp/claim`
  after gate passes.
- **PWA requirements:** must have a `manifest.webmanifest`, a service worker,
  and be installable on Android Chrome + desktop Chrome/Edge.
- **Service worker handles Web Push.** Background push notifications must work
  even when the tab is closed.

---

## 3. Tech stack

| Concern | Library |
|---|---|
| Build | Vite 5 |
| UI | React 19 + TypeScript |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 (standalone CLI, not Play CDN) |
| Crypto | Web Crypto API (built-in, no library) |
| PWA | `vite-plugin-pwa` (Workbox) |
| QR scanning (onboarding) | `@zxing/browser` |
| QR display (dashboard) | `qrcode.react` |
| HTTP client | `fetch` (native, no axios) |
| State | `useState` / `useReducer` + React Context (no Redux) |

Do not introduce: Next.js, Electron, Capacitor, Expo, any CSS-in-JS library,
or any state management library beyond React built-ins.

---

## 4. Repo structure

```
otp-pwa/
├── CLAUDE.md
├── README.md
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts        # Tailwind v4 config
├── index.html
├── public/
│   ├── manifest.webmanifest
│   ├── icons/                # PWA icons (192, 512)
│   └── favicon.ico
├── src/
│   ├── main.tsx              # React root, router setup
│   ├── App.tsx               # Route definitions
│   ├── routes/
│   │   ├── Receive.tsx       # `/` — OTP receive + biometric gate
│   │   ├── Dashboard.tsx     # `/dashboard` — device list, onboarding
│   │   └── Login.tsx         # `/dashboard/login` — TOTP entry
│   ├── components/
│   │   ├── OtpCard.tsx       # Displays decrypted OTP with copy button
│   │   ├── DeviceList.tsx    # Lists registered devices
│   │   ├── QRScanner.tsx     # Camera-based QR scanner for onboarding
│   │   ├── QRDisplay.tsx     # Shows invite QR from dashboard
│   │   └── BiometricGate.tsx # Biometric/PIN prompt wrapper
│   ├── lib/
│   │   ├── crypto.ts         # AES-256-GCM decrypt via Web Crypto API
│   │   ├── api.ts            # Typed fetch wrappers for /api/* endpoints
│   │   ├── push.ts           # Web Push subscription registration
│   │   └── storage.ts        # IndexedDB helpers (device key, push sub)
│   ├── sw/
│   │   └── sw.ts             # Service worker — push event handler
│   └── types/
│       └── index.ts          # Shared TS types (OTP, Device, etc.)
└── docs/
    └── CRYPTO.md             # Documents the client-side crypto flow
```

---

## 5. Route behaviours

### `/` — Receive view
1. On load: check if device is registered (key in IndexedDB). If not → redirect to onboarding.
2. Service worker receives Web Push → shows notification: "OTP ready — tap to fetch"
3. User taps notification → app opens at `/`
4. `BiometricGate` prompts for biometric/PIN via `navigator.credentials.get()`
5. On pass → call `POST /api/otp/claim` with device token
6. On success → receive `{ ciphertext, iv }` → decrypt via `lib/crypto.ts`
7. Display decrypted OTP in `OtpCard`, auto-copy to clipboard
8. On `otp_invalidated` response → show "Claim conflict — OTP invalidated" message

### `/dashboard` — Device management (requires TOTP session)
- Redirect to `/dashboard/login` if no valid session cookie
- Shows: list of registered devices, revoke buttons, invite QR generator
- "Add Device" flow: call `POST /api/onboard/invite` → fetch QR from `GET /api/onboard/qr` → display via `QRDisplay`

### `/dashboard/login` — TOTP entry
- Single 6-digit input
- `POST /api/auth/login` with TOTP code
- On success → redirect to `/dashboard`

---

## 6. Crypto (`lib/crypto.ts`)

```typescript
// AES-256-GCM decrypt
// Key is stored in IndexedDB as a CryptoKey (non-extractable after import)
// Provisioned during device onboarding via ECDH key exchange

export async function decryptOTP(
  ciphertextB64: string,
  ivB64: string,
  key: CryptoKey
): Promise<string> {
  const ciphertext = base64ToBuffer(ciphertextB64);
  const iv = base64ToBuffer(ivB64);
  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
```

Key provisioning (onboarding flow):
1. PWA generates ECDH P-256 keypair (`window.crypto.subtle.generateKey`)
2. Scans invite QR from dashboard (contains relay's ephemeral ECDH public key)
3. Derives shared secret via ECDH, then derives AES-256 key via HKDF-SHA256
4. Stores derived key in IndexedDB (non-extractable)
5. Registers device with relay: `POST /api/devices` with push subscription + public key

---

## 7. Service worker (`src/sw/sw.ts`)

Managed by `vite-plugin-pwa` (Workbox). Custom push handler:

```typescript
self.addEventListener('push', (event) => {
  // Payload is just a signal — no OTP data in the push
  event.waitUntil(
    self.registration.showNotification('OTP Ready', {
      body: 'Tap to fetch securely',
      icon: '/icons/icon-192.png',
      tag: 'otp-ready',
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
```

---

## 8. Styling notes

- Dark theme default, no light mode toggle needed
- Minimal UI — this is a utility app, not a portfolio
- Tailwind v4 utility classes only
- No component library (no shadcn, no MUI)
- Font: system monospace for OTP display, system sans for everything else

---

## 9. CI / Deploy

GitHub Actions workflow:
1. `npm run build` → produces `dist/`
2. SSH into VPS (`72.61.233.71`)
3. Copy `dist/` contents to VPS path that maps to the `otp-pwa-dist` Docker volume
   used by `otp-relay`'s Nginx container
4. No container restart needed — Nginx serves files directly from the volume

`.env` not needed — no backend. API base URL is always relative (`/api`).

---

## 10. CLAUDE.md (you write this)

Write a `CLAUDE.md` at repo root covering:
- Repo purpose (2 lines)
- How to run locally (`npm run dev` — API calls proxy to relay via vite proxy config)
- Vite proxy config needed for local dev (proxy `/api` and `/ws` to `http://localhost:8080`)
- Key files map
- Crypto flow summary (point to `docs/CRYPTO.md`)
