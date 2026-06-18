import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

interface Props {
  /** Fired with the decoded QR text. The parent decides what to do with it. */
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}

/**
 * Camera-based QR scanner (used during onboarding to import a provisioning
 * bundle from another device). Streams the rear camera into a <video> and
 * decodes continuously until the first successful read.
 */
export default function QRScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    (async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result) => {
            if (result && !cancelled) {
              cancelled = true;
              controls?.stop();
              setActive(false);
              onResult(result.getText());
            }
          },
        );
      } catch (e) {
        onError?.(
          e instanceof Error ? e.message : "Could not access the camera.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border-border overflow-hidden rounded-xl border bg-black">
      <video
        ref={videoRef}
        className="aspect-square w-full object-cover"
        muted
        playsInline
      />
      {!active && (
        <p className="p-2 text-center text-xs text-neutral-400">Scanned ✓</p>
      )}
    </div>
  );
}
