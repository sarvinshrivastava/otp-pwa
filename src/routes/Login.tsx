import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, login } from "../lib/api";

/** TOTP entry for the dashboard session. Sets the session cookie on success. */
export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") ?? "/dashboard";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(code);
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Invalid code. Try again."
          : "Login failed. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-lg font-semibold">Dashboard login</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          autoFocus
          className="border-border bg-surface rounded-lg border px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="bg-accent rounded-lg px-5 py-3 font-medium text-black transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Log in"}
        </button>
        {error && <p className="text-danger text-center text-sm">{error}</p>}
      </form>
    </main>
  );
}
