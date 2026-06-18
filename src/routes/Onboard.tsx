import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QRDisplay from "../components/QRDisplay";
import QRScanner from "../components/QRScanner";
import { ApiError, createDevice } from "../lib/api";
import { enrolBiometric } from "../lib/biometric";
import { generateAesKey, importRawAesKey } from "../lib/crypto";
import { subscribeToPush } from "../lib/push";
import {
  requestPersistentStorage,
  saveDeviceCredentials,
} from "../lib/storage";

type KeyMode = "generate" | "import";
type Step =
  | { kind: "form" }
  | { kind: "scan" } // import mode: scanning the source's key
  | { kind: "working"; note: string }
  | { kind: "needs-login" }
  | { kind: "key-handoff"; rawB64: string } // generate mode: show key once
  | { kind: "error"; message: string };

/**
 * Option A onboarding: provision THIS browser as a destination device while
 * logged into the dashboard. Generates the push subscription + AES key locally,
 * registers via POST /api/devices, and stores the credentials in IndexedDB.
 */
export default function Onboard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<KeyMode>("generate");
  const [step, setStep] = useState<Step>({ kind: "form" });

  async function register(key: CryptoKey, rawB64: string | null) {
    try {
      setStep({ kind: "working", note: "Requesting notification permission…" });
      const pushSub = await subscribeToPush();

      setStep({ kind: "working", note: "Registering device…" });
      const device = await createDevice({
        name: name.trim(),
        type: "destination",
        pushSub: JSON.stringify(pushSub),
      });

      setStep({ kind: "working", note: "Setting up biometric unlock…" });
      await enrolBiometric();

      await saveDeviceCredentials({
        deviceId: device.id,
        deviceToken: device.deviceToken,
        name: device.name,
        type: "destination",
        createdAt: device.createdAt,
        key,
        pushSubscription: pushSub,
      });
      await requestPersistentStorage();

      if (rawB64) {
        setStep({ kind: "key-handoff", rawB64 });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setStep({ kind: "needs-login" });
        return;
      }
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : "Onboarding failed.",
      });
    }
  }

  async function start() {
    if (!name.trim()) return;
    if (mode === "import") {
      setStep({ kind: "scan" });
      return;
    }
    const { key, rawB64 } = await generateAesKey();
    await register(key, rawB64);
  }

  async function onScanned(text: string) {
    try {
      const key = await importRawAesKey(text.trim(), false);
      await register(key, null);
    } catch (e) {
      setStep({
        kind: "error",
        message:
          e instanceof Error
            ? `Invalid key QR: ${e.message}`
            : "Invalid key QR.",
      });
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-lg font-semibold">Set up this device</h1>

      {step.kind === "form" && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-neutral-400">
            This registers the current browser as a destination that receives
            OTPs. You must be logged into the dashboard on this device.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Device name (e.g. My Pixel)"
            className="border-border bg-surface rounded-lg border px-4 py-3 outline-none focus:border-neutral-500"
          />
          <fieldset className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="keymode"
                checked={mode === "generate"}
                onChange={() => setMode("generate")}
              />
              Generate a new key (enrol it on the source device)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="keymode"
                checked={mode === "import"}
                onChange={() => setMode("import")}
              />
              Import an existing key (scan from the source device)
            </label>
          </fieldset>
          <button
            type="button"
            onClick={start}
            disabled={!name.trim()}
            className="bg-accent rounded-lg px-5 py-3 font-medium text-black transition active:scale-[0.98] disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step.kind === "scan" && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-neutral-400">
            Scan the AES key QR shown on the source device.
          </p>
          <QRScanner
            onResult={onScanned}
            onError={(message) => setStep({ kind: "error", message })}
          />
        </div>
      )}

      {step.kind === "working" && (
        <p className="text-center text-neutral-400">{step.note}</p>
      )}

      {step.kind === "needs-login" && (
        <div className="border-border bg-surface rounded-2xl border p-6 text-center">
          <p className="text-neutral-300">
            You need a dashboard session first.
          </p>
          <Link
            to="/dashboard/login?redirect=/onboard"
            className="text-accent mt-3 inline-block underline"
          >
            Log in, then come back here
          </Link>
        </div>
      )}

      {step.kind === "key-handoff" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-neutral-300">
            Enrol this key on the source device. It is shown{" "}
            <strong>once</strong> — the relay never sees it.
          </p>
          <QRDisplay
            value={step.rawB64}
            caption="Scan on the source device, or copy the key below."
          />
          <code className="border-border bg-surface w-full rounded-lg border p-3 font-mono text-xs break-all">
            {step.rawB64}
          </code>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="bg-accent w-full rounded-lg px-5 py-3 font-medium text-black transition active:scale-[0.98]"
          >
            I&apos;ve saved it — go to receive
          </button>
        </div>
      )}

      {step.kind === "error" && (
        <div className="border-danger/40 bg-surface rounded-2xl border p-6 text-center">
          <p className="text-danger font-medium">Onboarding failed</p>
          <p className="mt-2 text-sm text-neutral-400">{step.message}</p>
          <button
            type="button"
            onClick={() => setStep({ kind: "form" })}
            className="border-border mt-4 rounded-lg border px-4 py-2 text-sm"
          >
            Start over
          </button>
        </div>
      )}
    </main>
  );
}
