// Web Push subscription registration. The relay sends only a *signal* (no OTP
// data) in the push; the service worker turns it into a notification. To
// subscribe we need the relay's VAPID PUBLIC key — the public half, safe to
// embed — supplied at build time via VITE_VAPID_PUBLIC_KEY.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Ensures notification permission, subscribes to Web Push via the active SW
 * registration, and returns the subscription JSON to register with the relay.
 * Throws with an actionable message if anything is missing.
 */
export async function subscribeToPush(): Promise<PushSubscriptionJSON> {
  if (!pushSupported()) {
    throw new Error("Web Push is not supported in this browser.");
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error(
      "VITE_VAPID_PUBLIC_KEY is not set — cannot subscribe to push.",
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  return sub.toJSON();
}
