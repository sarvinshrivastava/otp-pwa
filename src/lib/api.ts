// Typed fetch wrappers for the relay's REST surface. Base URL is always relative
// (`/api`) so the same build works behind Nginx in prod and the Vite proxy in
// dev. Dashboard endpoints ride the session cookie (credentials: 'include');
// device endpoints carry the bearer deviceToken.

import type {
  CreateDeviceRequest,
  CreateDeviceResponse,
  DeviceView,
  InviteResponse,
} from "../types";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include", // session cookie for dashboard endpoints
    headers:
      init.body != null
        ? { "Content-Type": "application/json", ...init.headers }
        : init.headers,
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- auth (dashboard) ---------------------------------------------------------

export function login(code: string): Promise<{ ok: true }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request("/auth/logout", { method: "POST" });
}

// --- devices (dashboard) ------------------------------------------------------

export async function listDevices(): Promise<DeviceView[]> {
  const { devices } = await request<{ devices: DeviceView[] }>("/devices");
  return devices;
}

export function createDevice(
  body: CreateDeviceRequest,
): Promise<CreateDeviceResponse> {
  return request("/devices", { method: "POST", body: JSON.stringify(body) });
}

export function deleteDevice(id: string): Promise<{ ok: true }> {
  return request(`/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- onboarding (dashboard) ---------------------------------------------------

export function createInvite(): Promise<InviteResponse> {
  return request("/onboard/invite", { method: "POST" });
}

/** URL of the latest invite's QR PNG (served by the relay). */
export function inviteQrUrl(): string {
  return `${API_BASE}/onboard/qr`;
}

// --- otp claim (device token) -------------------------------------------------

/**
 * Registers a claim. Returns 202 — the actual result (otp_payload /
 * otp_invalidated) arrives over the device's WebSocket connection, NOT here.
 */
export function claimOtp(
  otpId: string,
  deviceToken: string,
): Promise<{ status: string }> {
  return request("/otp/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ otpId }),
  });
}
