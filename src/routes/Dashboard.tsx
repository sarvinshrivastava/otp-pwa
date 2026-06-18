import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeviceList from "../components/DeviceList";
import QRDisplay from "../components/QRDisplay";
import {
  ApiError,
  createDevice,
  deleteDevice,
  listDevices,
  logout,
} from "../lib/api";
import type { CreateDeviceResponse, DeviceType, DeviceView } from "../types";

export default function Dashboard() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [type, setType] = useState<DeviceType>("source");
  const [created, setCreated] = useState<CreateDeviceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setDevices(await listDevices());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate("/dashboard/login?redirect=/dashboard", { replace: true });
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load devices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const device = await createDevice({ name: name.trim(), type });
      setCreated(device);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create device.");
    }
  }

  async function revoke(id: string) {
    await deleteDevice(id);
    await refresh();
  }

  async function signOut() {
    try {
      await logout();
    } finally {
      navigate("/dashboard/login", { replace: true });
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Devices</h1>
        <button
          type="button"
          onClick={signOut}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          Sign out
        </button>
      </header>

      {loading ? (
        <p className="text-neutral-400">Loading…</p>
      ) : (
        <DeviceList devices={devices} onRevoke={revoke} />
      )}

      <section className="border-border flex flex-col gap-3 border-t pt-6">
        <h2 className="font-medium">Add a device</h2>
        <form onSubmit={add} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Device name"
            className="border-border bg-surface rounded-lg border px-4 py-3 outline-none focus:border-neutral-500"
          />
          <div className="flex gap-2 text-sm">
            {(["source", "destination"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg border px-3 py-2 transition ${
                  type === t
                    ? "border-accent text-accent"
                    : "border-border text-neutral-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="bg-accent rounded-lg px-5 py-3 font-medium text-black transition active:scale-[0.98] disabled:opacity-50"
          >
            Create device
          </button>
        </form>
        {error && <p className="text-danger text-sm">{error}</p>}
      </section>

      {created && (
        <section className="border-accent/40 bg-surface flex flex-col items-center gap-3 rounded-2xl border p-6">
          <p className="text-center text-sm text-neutral-300">
            Device token for <strong>{created.name}</strong>. Shown{" "}
            <strong>once</strong> — copy or scan it into the device now.
          </p>
          <QRDisplay
            value={created.deviceToken}
            caption="Scan on the device, or copy below."
          />
          <code className="border-border w-full rounded-lg border p-3 font-mono text-xs break-all">
            {created.deviceToken}
          </code>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="border-border w-full rounded-lg border px-4 py-2 text-sm"
          >
            Done
          </button>
        </section>
      )}
    </main>
  );
}
