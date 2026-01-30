"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
};

type ControlsLike = { stop: () => void };
type Facing = "environment" | "user";

export default function CameraScannerModal({ open, onClose, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const [err, setErr] = useState<string>("");
  const [starting, setStarting] = useState(false);

  // camera management
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");

  function stopCamera() {
    try {
      stopRef.current?.();
    } catch {}
    stopRef.current = null;
  }

  async function ensurePermission() {
    const tmpStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    tmpStream.getTracks().forEach((t) => t.stop());
  }

  async function refreshDevicesAndPickDefault() {
    const list = await BrowserMultiFormatReader.listVideoInputDevices();
    const simplified = list.map((d, idx) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${idx + 1}`,
    }));

    setDevices(simplified);

    // Choose a default (prefer back/environment)
    const preferred =
      simplified.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ||
      simplified[0]?.deviceId ||
      null;

    setDeviceId(preferred);
  }

  async function startWithDevice(targetDeviceId: string) {
    if (!videoRef.current) throw new Error("Video element missing");

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 400,
    });

    const controls: ControlsLike = await reader.decodeFromVideoDevice(
      targetDeviceId,
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
  }

  async function startWithFacingMode(targetFacing: Facing) {
    // Fallback when device list is unreliable (Safari labels empty)
    // We still need a deviceId for decodeFromVideoDevice, so we try:
    // - if we have >1 device, toggle between them
    // - else just use the single device
    if (devices.length >= 2) {
      const idx = devices.findIndex((d) => d.deviceId === deviceId);
      const next = devices[(idx + 1) % devices.length].deviceId;
      setDeviceId(next);
      await startWithDevice(next);
      return;
    }
    // If only 1 device, just start it
    if (devices.length === 1) {
      setDeviceId(devices[0].deviceId);
      await startWithDevice(devices[0].deviceId);
      return;
    }

    // If devices not loaded yet, refresh and retry
    await refreshDevicesAndPickDefault();
    if (devices.length === 0) throw new Error("No camera found");
  }

  // main start/stop lifecycle
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function boot() {
      setErr("");
      setStarting(true);

      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API not supported");

        // Force permission prompt
        await ensurePermission();
        if (cancelled) return;

        // Load devices + choose default
        await refreshDevicesAndPickDefault();
        if (cancelled) return;

        // Start camera
        const chosen = deviceId;
        // deviceId state updates async; compute from fresh list again:
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        const simplified = list.map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
        setDevices(simplified);

        const preferred =
          simplified.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ||
          simplified[0]?.deviceId ||
          null;

        if (!preferred) throw new Error("No camera found");

        setDeviceId(preferred);
        setFacing("environment");
        await startWithDevice(preferred);

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

    boot();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When user switches camera
  async function handleSwitchCamera() {
    try {
      setErr("");
      setStarting(true);
      stopCamera();

      // Prefer simple toggle between front/back concept
      const nextFacing: Facing = facing === "environment" ? "user" : "environment";
      setFacing(nextFacing);

      // If we have device list, cycle devices (most reliable)
      if (devices.length >= 2) {
        const idx = devices.findIndex((d) => d.deviceId === deviceId);
        const next = devices[(idx + 1) % devices.length].deviceId;
        setDeviceId(next);
        await startWithDevice(next);
        setStarting(false);
        return;
      }

      // Fallback
      await startWithFacingMode(nextFacing);
      setStarting(false);
    } catch (e: any) {
      setStarting(false);
      setErr(e?.message ?? "Failed to switch camera");
    }
  }

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

          <div className="flex gap-2">
            <button
                onClick={handleSwitchCamera}
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                title="Switch camera"
                aria-label="Switch camera"
                >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="opacity-90"
                >
                    <path
                    d="M20 10V8a2 2 0 0 0-2-2h-3l-1-1H10L9 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    />
                    <path
                    d="M16 14h6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    />
                    <path
                    d="M19 11l3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    />
                </svg>
                </button>

            <button
            onClick={onClose}
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
            title="Close"
            aria-label="Close"
            >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                />
            </svg>
            </button>
          </div>
        </div>

        <div className="mt-2 rounded-2xl border border-white/10 bg-black">
          <video ref={videoRef} className="h-[360px] w-full object-cover" muted playsInline />
        </div>

        {starting && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
            Menyalakan kamera...
          </div>
        )}

        {err && (
          <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {err}
          </div>
        )}

        {devices.length > 0 && (
          <div className="mt-3 px-2 text-xs text-zinc-400">
            Camera:{" "}
            <span className="text-zinc-200">
              {devices.find((d) => d.deviceId === deviceId)?.label ?? "-"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
