import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import BiometricGate from "../components/BiometricGate";
import OtpCard from "../components/OtpCard";
import { claimOtp } from "../lib/api";
import { decryptOTP } from "../lib/crypto";
import { getDeviceCredentials } from "../lib/storage";
import { OtpSocket, type WsStatus } from "../lib/ws";
import type { DeviceCredentials } from "../types";

type Phase =
  | { kind: "loading" }
  | { kind: "unregistered" }
  | { kind: "idle" } // registered, no OTP pending
  | { kind: "ready"; otpId: string } // OTP pending, awaiting biometric
  | { kind: "fetching" } // gate passed, claiming + awaiting WS result
  | { kind: "shown"; otp: string }
  | { kind: "invalidated"; reason: string }
  | { kind: "error"; message: string };

export default function Receive() {
  const [params] = useSearchParams();
  const [creds, setCreds] = useState<DeviceCredentials | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const socketRef = useRef<OtpSocket | null>(null);

  // Load credentials + open the WS the claim result will arrive on.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const c = await getDeviceCredentials();
      if (disposed) return;
      if (!c) {
        setPhase({ kind: "unregistered" });
        return;
      }
      setCreds(c);
      const sock = new OtpSocket(c.deviceToken, { onStatus: setWsStatus });
      socketRef.current = sock;
      sock.connect();

      const urlOtpId = params.get("otpId");
      setPhase(
        urlOtpId ? { kind: "ready", otpId: urlOtpId } : { kind: "idle" },
      );
    })();
    return () => {
      disposed = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A foreground push (tab already open) arrives as an SW postMessage.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data as { type?: string; otpId?: string };
      if (data?.type === "otp_available" && data.otpId) {
        setPhase((p) =>
          p.kind === "fetching" || p.kind === "shown"
            ? p
            : { kind: "ready", otpId: data.otpId! },
        );
      }
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  async function fetchOtp(otpId: string) {
    const sock = socketRef.current;
    if (!creds || !sock) return;
    setPhase({ kind: "fetching" });
    try {
      // Register the waiter BEFORE claiming so we can't miss the result.
      const resultPromise = sock.waitForResult(otpId);
      await claimOtp(otpId, creds.deviceToken);
      const result = await resultPromise;

      if (result.kind === "payload") {
        const otp = await decryptOTP(result.ciphertext, result.iv, creds.key);
        setPhase({ kind: "shown", otp });
      } else if (result.kind === "invalidated") {
        setPhase({ kind: "invalidated", reason: result.reason });
      } else {
        setPhase({ kind: "error", message: result.error });
      }
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to fetch OTP.",
      });
    }
  }

  if (phase.kind === "unregistered") return <Navigate to="/onboard" replace />;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">OTP Relay</h1>
        <span
          className="text-xs text-neutral-500"
          title={`WebSocket: ${wsStatus}`}
        >
          {wsStatus === "open" ? "● live" : "○ offline"}
        </span>
      </header>

      {phase.kind === "loading" && (
        <p className="text-center text-neutral-400">Loading…</p>
      )}

      {phase.kind === "idle" && (
        <div className="border-border bg-surface rounded-2xl border p-6 text-center">
          <p className="text-neutral-300">Waiting for an OTP.</p>
          <p className="mt-2 text-sm text-neutral-500">
            You&apos;ll get a notification when one arrives. Tap it to fetch
            securely.
          </p>
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-neutral-300">
            An OTP is waiting. Verify to fetch it.
          </p>
          <BiometricGate onUnlock={() => fetchOtp(phase.otpId)} />
        </div>
      )}

      {phase.kind === "fetching" && (
        <p className="text-center text-neutral-400">Fetching securely…</p>
      )}

      {phase.kind === "shown" && <OtpCard otp={phase.otp} />}

      {phase.kind === "invalidated" && (
        <div className="border-danger/40 bg-surface rounded-2xl border p-6 text-center">
          <p className="text-danger font-medium">Claim conflict</p>
          <p className="mt-2 text-sm text-neutral-400">
            This OTP was invalidated ({phase.reason}). A second claim was
            detected — for safety it can no longer be used.
          </p>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="border-danger/40 bg-surface rounded-2xl border p-6 text-center">
          <p className="text-danger font-medium">Something went wrong</p>
          <p className="mt-2 text-sm text-neutral-400">{phase.message}</p>
        </div>
      )}

      <footer className="text-center text-xs text-neutral-600">
        <Link to="/dashboard" className="hover:text-neutral-400">
          Manage devices
        </Link>
      </footer>
    </main>
  );
}
