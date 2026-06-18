import { QRCodeSVG } from "qrcode.react";

interface Props {
  /** The string to encode (e.g. a provisioning bundle for the source device). */
  value: string;
  size?: number;
  caption?: string;
}

/** Renders a QR code for onboarding/provisioning hand-off between devices. */
export default function QRDisplay({ value, size = 224, caption }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG value={value} size={size} level="M" />
      </div>
      {caption && (
        <p className="max-w-xs text-center text-xs text-neutral-400">
          {caption}
        </p>
      )}
    </div>
  );
}
