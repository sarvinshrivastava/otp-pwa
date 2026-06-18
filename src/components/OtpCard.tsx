import { useEffect, useState } from "react";

interface Props {
  otp: string;
}

/** Displays a decrypted OTP in monospace and auto-copies it to the clipboard. */
export default function OtpCard({ otp }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void copy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(otp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be blocked without a user gesture; the button still works
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border p-6">
      <span className="text-xs tracking-widest text-neutral-400 uppercase">
        Your OTP
      </span>
      <div className="font-mono text-4xl font-semibold tracking-[0.3em] select-all">
        {otp}
      </div>
      <button
        type="button"
        onClick={copy}
        className="border-border w-full rounded-lg border px-4 py-2 text-sm transition active:scale-[0.98]"
      >
        {copied ? "Copied ✓" : "Copy to clipboard"}
      </button>
    </div>
  );
}
