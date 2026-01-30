"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
};

type ControlsLike = { stop: () => void };

export default function CameraScannerModal({ open, onClose, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const [err, setErr] = useState<string>("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function start() {
      setErr("");
      setStarting(true);

      try {
        if (!videoRef.current) throw new Error("Video element missing");
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API not supported");

        // 1) FORCE permission prompt (this triggers the Allow popup)
        const tmpStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        // stop immediately; we only need it to trigger permission
        tmpStream.getTracks().forEach((t) => t.stop());

        if (cancelled) return;

        // 2) Now enumerate devices AFTER permission is granted
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const preferred =
          devices.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ||
          devices[0]?.deviceId;

        if (!preferred) throw new Error("No camera found");

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 400,
        });

        // 3) Decode continuously from chosen device
        const controls: ControlsLike = await reader.decodeFromVideoDevice(
          preferred,
          videoRef.current,
          (result: any, _error: any, controls: ControlsLike) => {
            stopRef.current = () => controls.stop();

            const text = result?.getText?.();
            if (text) {
              controls.stop();
              onResult(String(text));
              onClose();
            }
          }
        );

        stopRef.current = () => controls.stop();
        if (!cancelled) setStarting(false);
      } catch (e: any) {
        if (!cancelled) {
          setStarting(false);
          const name = String(e?.name ?? "");
          const msg =
            name === "NotAllowedError"
              ? "Camera permission blocked. Allow camera for this site."
              : name === "NotFoundError"
              ? "No camera device found on this device."
              : e?.message ?? "Failed to start camera";
          setErr(msg);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      try {
        stopRef.current?.();
      } catch {}
      stopRef.current = null;
    };
  }, [open, onClose, onResult]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div>
            <div className="text-sm font-semibold">Scan Barcode / QR</div>
            <div className="text-xs text-zinc-400">Arahkan kamera ke barcode customer.</div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
          >
            Tutup
          </button>
        </div>

        <div className="mt-2 rounded-2xl border border-white/10 bg-black">
          <video ref={videoRef} className="h-[360px] w-full object-cover" muted playsInline />
        </div>

        {starting && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
            Menyalakan kamera... (kalau diminta izin, klik Allow)
          </div>
        )}

        {err && (
          <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {err}
            <div className="mt-2 text-red-200/80">
              Mac: System Settings → Privacy & Security → Camera → allow Chrome/Safari.
              <br />
              Chrome: lock icon → Site settings → Camera → Allow.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
