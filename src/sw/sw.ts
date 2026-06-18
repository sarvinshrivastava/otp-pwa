/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa injectManifest strategy). Two jobs:
//   1. Precache the app shell so the Receive view opens instantly when tapped.
//   2. Handle Web Push — the payload is a SIGNAL ONLY (never OTP data); we show
//      a notification, and tapping it opens the app at `/` to run the biometric
//      gate + claim. The OTP itself is fetched in the page, not here.

import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa at build time with the precache manifest.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The relay's push body is a signal only: {"type":"otp_available","otpId":"…"}.
interface OtpSignal {
  type: "otp_available";
  otpId: string;
}

function parseSignal(event: PushEvent): OtpSignal | null {
  try {
    const data = event.data?.json() as OtpSignal | undefined;
    if (data?.type === "otp_available" && typeof data.otpId === "string") {
      return data;
    }
  } catch {
    /* malformed / empty push body */
  }
  return null;
}

self.addEventListener("push", (event) => {
  const signal = parseSignal(event);
  const otpId = signal?.otpId ?? "";

  event.waitUntil(
    (async () => {
      // If a tab is already open, hand it the otpId so it can claim live.
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "otp_available", otpId });
      }

      await self.registration.showNotification("OTP Ready", {
        body: "Tap to fetch securely",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "otp-ready",
        requireInteraction: true,
        data: { otpId },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const otpId = (event.notification.data as { otpId?: string } | null)?.otpId;
  const target = otpId ? `/?otpId=${encodeURIComponent(otpId)}` : "/";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab on `/`, telling it which otpId to claim.
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.pathname === "/" && "focus" in client) {
          client.postMessage({ type: "otp_available", otpId });
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
