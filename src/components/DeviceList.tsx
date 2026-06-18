import { useState } from "react";
import type { DeviceView } from "../types";

interface Props {
  devices: DeviceView[];
  onRevoke: (id: string) => Promise<void>;
}

/** Lists registered devices with a revoke action per row. */
export default function DeviceList({ devices, onRevoke }: Props) {
  const [revoking, setRevoking] = useState<string | null>(null);

  if (devices.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No devices registered yet. Add one below.
      </p>
    );
  }

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await onRevoke(id);
    } finally {
      setRevoking(null);
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {devices.map((d) => (
        <li
          key={d.id}
          className="border-border bg-surface flex items-center justify-between rounded-lg border p-3"
        >
          <div className="flex flex-col">
            <span className="font-medium">{d.name}</span>
            <span className="text-xs text-neutral-400">
              {d.type}
              {d.hasPush ? " · push" : ""}
              {d.revoked ? " · revoked" : ""}
            </span>
          </div>
          {!d.revoked && (
            <button
              type="button"
              onClick={() => revoke(d.id)}
              disabled={revoking === d.id}
              className="text-danger border-danger/40 rounded-md border px-3 py-1 text-sm transition active:scale-95 disabled:opacity-50"
            >
              {revoking === d.id ? "Revoking…" : "Revoke"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
