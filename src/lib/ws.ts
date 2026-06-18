// WebSocket client for claim results. The relay delivers otp_payload /
// otp_invalidated over /ws?token=<deviceToken> AFTER the claim window resolves
// (POST /api/otp/claim only returns 202). So the Receive view must hold this
// socket open, then await the result for the otpId it claimed.

import type { ClaimResult, WsIncoming } from "../types";

export type WsStatus = "connecting" | "open" | "closed";

interface OtpSocketHandlers {
  onResult?: (result: ClaimResult) => void;
  onStatus?: (status: WsStatus) => void;
}

function wsUrl(token: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`;
}

export class OtpSocket {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private reconnectDelay = 1000;
  private readonly maxDelay = 15000;
  private waiters = new Map<
    string,
    { resolve: (r: ClaimResult) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly token: string,
    private readonly handlers: OtpSocketHandlers = {},
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.handlers.onStatus?.("connecting");
    const ws = new WebSocket(wsUrl(this.token));
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.handlers.onStatus?.("open");
    };

    ws.onmessage = (ev) => this.handleMessage(ev.data);

    ws.onclose = () => {
      this.handlers.onStatus?.("closed");
      if (!this.closedByUser) this.scheduleReconnect();
    };

    ws.onerror = () => ws.close();
  }

  /** Optional: claim directly over the socket instead of via REST. */
  claim(otpId: string): void {
    this.send({ type: "otp_claim", otpId });
  }

  /**
   * Resolves with the claim result for `otpId` once it arrives over the socket,
   * or rejects after `timeoutMs`. Register this BEFORE issuing the claim.
   */
  waitForResult(otpId: string, timeoutMs = 30000): Promise<ClaimResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(otpId);
        reject(new Error("Timed out waiting for the claim result."));
      }, timeoutMs);
      this.waiters.set(otpId, { resolve, timer });
    });
  }

  close(): void {
    this.closedByUser = true;
    for (const { timer } of this.waiters.values()) clearTimeout(timer);
    this.waiters.clear();
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let msg: WsIncoming;
    try {
      msg = JSON.parse(raw) as WsIncoming;
    } catch {
      return;
    }

    switch (msg.type) {
      case "ping":
        this.send({ type: "pong" });
        return;
      case "pong":
        return;
      case "otp_payload":
        this.deliver(msg.otpId, {
          kind: "payload",
          otpId: msg.otpId,
          ciphertext: msg.ciphertext,
          iv: msg.iv,
        });
        return;
      case "otp_invalidated":
        this.deliver(msg.otpId, {
          kind: "invalidated",
          otpId: msg.otpId,
          reason: msg.reason,
        });
        return;
      case "error":
        this.deliver(msg.otpId, {
          kind: "error",
          otpId: msg.otpId,
          error: msg.error,
        });
        return;
    }
  }

  private deliver(otpId: string | undefined, result: ClaimResult): void {
    this.handlers.onResult?.(result);
    if (!otpId) return;
    const waiter = this.waiters.get(otpId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.waiters.delete(otpId);
      waiter.resolve(result);
    }
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, this.maxDelay);
    setTimeout(() => {
      if (!this.closedByUser) this.connect();
    }, delay);
  }
}
