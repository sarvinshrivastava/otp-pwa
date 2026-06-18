import { useState } from "react";
import { biometricSupported, runBiometricGate } from "../lib/biometric";

interface Props {
  /** Called once the biometric/PIN gate passes. */
  onUnlock: () => void;
  label?: string;
}

/**
 * Renders an "unlock" button that forces a biometric/PIN prompt before allowing
 * the OTP fetch. No claim happens until onUnlock fires.
 */
export default function BiometricGate({
  onUnlock,
  label = "Unlock to fetch OTP",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!biometricSupported()) {
    return (
      <p className="text-danger text-sm">
        This browser doesn&apos;t support biometric/PIN unlock (WebAuthn). Use a
        device that does — the OTP fetch is gated behind it by design.
      </p>
    );
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      await runBiometricGate();
      onUnlock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={unlock}
        disabled={busy}
        className="bg-accent w-full rounded-lg px-5 py-3 font-medium text-black transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Verifying…" : label}
      </button>
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
