// Shared types mirroring the Go relay's API contract (see otp-relay-backend/docs/API.md).

export type DeviceType = "source" | "destination";

/** Dashboard-facing device shape. Note: device tokens are NEVER in this view. */
export interface DeviceView {
  id: string;
  name: string;
  type: DeviceType;
  hasPush: boolean;
  createdAt: number;
  revoked: boolean;
}

/** Returned EXACTLY ONCE by POST /api/devices — capture deviceToken immediately. */
export interface CreateDeviceResponse extends DeviceView {
  deviceToken: string;
}

export interface CreateDeviceRequest {
  name: string;
  type: DeviceType;
  /** Web Push subscription JSON (stringified). Optional; destinations attach one. */
  pushSub?: string;
}

export interface InviteResponse {
  token: string;
  url: string;
  expiresAt: number;
}

// --- WebSocket envelopes (/ws?token=<deviceToken>) ---------------------------
// Every frame is a JSON object discriminated by `type`.

export type WsOutgoing =
  | { type: "otp_claim"; otpId: string }
  | { type: "ping" }
  | { type: "pong" };

export type WsIncoming =
  | { type: "otp_payload"; otpId: string; ciphertext: string; iv: string }
  | { type: "otp_invalidated"; otpId: string; reason: string }
  | { type: "error"; otpId?: string; error: string }
  | { type: "ping" }
  | { type: "pong" };

/** Result surfaced to the Receive view once a claim window resolves. */
export type ClaimResult =
  | { kind: "payload"; otpId: string; ciphertext: string; iv: string }
  | { kind: "invalidated"; otpId: string; reason: string }
  | { kind: "error"; otpId?: string; error: string };

// --- Local device provisioning (IndexedDB, Option A onboarding) --------------

/**
 * The credentials a provisioned destination device holds locally. The AES key is
 * a non-extractable CryptoKey (the relay never sees it); the deviceToken is the
 * bearer secret for REST claims + the WS connection.
 */
export interface DeviceCredentials {
  deviceId: string;
  deviceToken: string;
  name: string;
  type: DeviceType;
  createdAt: number;
  /** Non-extractable AES-256-GCM key used to decrypt OTP payloads. */
  key: CryptoKey;
  /** The Web Push subscription registered for this device, if any. */
  pushSubscription?: PushSubscriptionJSON;
}
