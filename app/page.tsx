"use client";

import Script from "next/script";
import { useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import CameraScannerModal from "./components/CameraScannerModal";



declare global {
  interface Window {
    snap: any;
  }
}

type SizeKey = "4x6" | "strip";

const SIZE_OPTIONS: { key: SizeKey; label: string; desc: string; price: number }[] = [
  { key: "4x6", label: "4×6", desc: "Standard photo print", price: 10000 },
  { key: "strip", label: "2×6", desc: "Photo strip", price: 10000 },
];

function unitPrice(size: SizeKey) {
  return SIZE_OPTIONS.find((s) => s.key === size)?.price ?? 10000;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const SUCCESS_MODAL_AUTO_CLOSE_MS = 30000;

export default function KioskPage() {
  // Optional identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [queueNumber, setQueueNumber] = useState("");

  // Fotoshare + order
  const [input, setInput] = useState("");
  const [qty, setQty] = useState(0);
  const [size, setSize] = useState<SizeKey>("4x6");

  const [loading, setLoading] = useState(false);
  const [snapReady, setSnapReady] = useState(false);

  const [status, setStatus] = useState<
    { kind: "idle" | "info" | "ok" | "warn" | "err"; text: string } | undefined
  >({ kind: "info", text: "Scan QR code foto Anda, pilih jumlah cetak, lalu bayar dengan QRIS." });

  const [scanOpen, setScanOpen] = useState(false);

  // Success modal state
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    midtrans_order_id: string;
    amount: number;
    email: string | null;
    name: string | null;
    queueNumber: number | null;
  } | null>(null);

  // Keep timeout id so we can clear on manual close
  const successTimerRef = useRef<number | null>(null);

  const scanRef = useRef<HTMLInputElement | null>(null);
  const qrFileRef = useRef<HTMLInputElement | null>(null);
  const [decoding, setDecoding] = useState(false);

  const total = useMemo(() => unitPrice(size) * qty, [qty, size]);
  const currentSizeOption = SIZE_OPTIONS.find((s) => s.key === size)!;

  const snapScriptUrl =
    process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";

  function bumpQty(delta: number) {
    setQty((q) => Math.min(20, Math.max(0, q + delta)));
  }

  function clearSuccessTimer() {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }

  function resetForm() {
    setName("");
    setEmail("");
    setQueueNumber("");
    setInput("");
    setQty(0);
    setSize("4x6");
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  // Handle QR Upload - decode QR from image file
  async function handleQRUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"];
    const isAllowedType = allowedTypes.some(t => file.type.startsWith(t.split("/")[0])) ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif");

    if (!file.type.startsWith("image/") && !isAllowedType) {
      setStatus({ kind: "err", text: "Format file tidak didukung. Gunakan PNG, JPG, WebP, atau HEIC." });
      e.target.value = "";
      return;
    }

    setDecoding(true);

    const MAX_SIZE = 1 * 1024 * 1024; // 1MB
    const needsCompression = file.size > MAX_SIZE;
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

    if (needsCompression) {
      setStatus({ kind: "info", text: `Mengompres gambar (${fileSizeMB}MB)...` });
    } else {
      setStatus({ kind: "info", text: "Membaca QR code..." });
    }

    let objectUrl: string | null = null;

    try {
      // Create image element from file
      const img = document.createElement("img");
      objectUrl = URL.createObjectURL(file);

      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("load_failed"));
          img.src = objectUrl!;
        });
      } catch {
        throw new Error("image_load_failed");
      }

      // Check if image dimensions are valid
      if (img.width === 0 || img.height === 0) {
        throw new Error("image_invalid_dimensions");
      }

      // Check if image is too small for QR
      if (img.width < 50 || img.height < 50) {
        throw new Error("image_too_small");
      }

      let imageToScan: HTMLImageElement | HTMLCanvasElement = img;

      // Compress if needed
      if (needsCompression) {
        setStatus({ kind: "info", text: "Membaca QR code..." });

        // Calculate new dimensions (max 1500px on longest side for QR reading)
        const maxDim = 1500;
        let { width, height } = img;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        // Draw to canvas with reduced size
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("canvas_failed");
        }
        ctx.drawImage(img, 0, 0, width, height);
        imageToScan = canvas;
      }

      // Decode QR using ZXing
      const reader = new BrowserQRCodeReader();
      let result;
      try {
        result = imageToScan instanceof HTMLCanvasElement
          ? await reader.decodeFromCanvas(imageToScan)
          : await reader.decodeFromImageElement(imageToScan);
      } catch {
        throw new Error("qr_not_found");
      }

      const text = result?.getText?.();
      if (!text || text.trim().length === 0) {
        throw new Error("qr_empty");
      }

      // Success!
      setInput(text);
      setQty((q) => (q < 1 ? 1 : q));
      setStatus({
        kind: "ok",
        text: needsCompression
          ? "QR code berhasil dibaca! (gambar dikompres)"
          : "QR code berhasil dibaca!"
      });
      setTimeout(() => scanRef.current?.focus(), 50);

    } catch (err: any) {
      console.error("QR decode error:", err);

      // Specific error messages
      const errorCode = err?.message || "unknown";
      let errorMsg = "Terjadi kesalahan. Coba lagi.";

      switch (errorCode) {
        case "image_load_failed":
          errorMsg = "Gagal memuat gambar. Format mungkin tidak didukung oleh browser.";
          break;
        case "image_invalid_dimensions":
          errorMsg = "Gambar tidak valid atau rusak (dimensi 0).";
          break;
        case "image_too_small":
          errorMsg = "Gambar terlalu kecil. Gunakan gambar dengan resolusi lebih tinggi.";
          break;
        case "canvas_failed":
          errorMsg = "Gagal memproses gambar. Coba refresh halaman.";
          break;
        case "qr_not_found":
          errorMsg = "QR code tidak ditemukan dalam gambar. Pastikan gambar berisi QR code yang jelas.";
          break;
        case "qr_empty":
          errorMsg = "QR code kosong atau tidak berisi data.";
          break;
        default:
          errorMsg = "QR code tidak dapat dibaca. Coba gambar lain dengan QR yang lebih jelas.";
      }

      setStatus({ kind: "err", text: errorMsg });
    } finally {
      // Clean up object URL
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setDecoding(false);
      // Clear file input - file not saved
      e.target.value = "";
    }
  }

  function closeSuccessAndReset() {
    clearSuccessTimer();
    setSuccessOpen(false);
    resetForm();
  }

  const queueNum = parseInt(queueNumber, 10);
  const isValidQueueNumber = !isNaN(queueNum) && queueNum >= 1 && queueNum <= 999;

  const canPay =
    !loading &&
    snapReady &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    isValidEmail(email.trim()) &&
    isValidQueueNumber &&
    input.trim().length > 0 &&
    qty >= 1;

  async function pay() {
    if (!name.trim()) {
      setStatus({ kind: "warn", text: "Nama harus diisi." });
      return;
    }
    if (!email.trim()) {
      setStatus({ kind: "warn", text: "Email harus diisi." });
      return;
    }
    if (!isValidEmail(email.trim())) {
      setStatus({ kind: "warn", text: "Format email tidak valid." });
      return;
    }
    if (!input.trim()) {
      setStatus({ kind: "warn", text: "Link/token FotoShare masih kosong." });
      scanRef.current?.focus();
      return;
    }
    if (qty < 1) {
      setStatus({ kind: "warn", text: "Pilih jumlah print dulu (minimal 1)." });
      return;
    }
    if (!window.snap) {
      setStatus({ kind: "err", text: "Sistem pembayaran belum siap. Refresh halaman." });
      return;
    }
    if (!isValidQueueNumber) {
      setStatus({ kind: "warn", text: "Nomor urut harus diisi (1-999)." });
      return;
    }

    setLoading(true);
    setStatus({ kind: "info", text: "Membuat pesanan..." });

    try {
      const r = await fetch("/api/print-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotoshare_input: input,
          qty,
          size,
          queue_number: queueNum,
          customer_name: name,
          customer_email: email,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(j?.error ?? `Server error ${r.status}`);
      }

      const { snap_token, midtrans_order_id, order_id } = j as {
        snap_token: string;
        midtrans_order_id: string;
        order_id: string;
      };

      setStatus({ kind: "info", text: "Membuka halaman pembayaran..." });

      window.snap.pay(snap_token, {
        onSuccess(result: any) {
          console.log("Payment success:", result);
          setSuccessInfo({
            midtrans_order_id,
            amount: total,
            email: email.trim() || null,
            name: name.trim() || null,
            queueNumber: queueNum,
          });
          setSuccessOpen(true);

          clearSuccessTimer();
          successTimerRef.current = window.setTimeout(() => {
            closeSuccessAndReset();
          }, SUCCESS_MODAL_AUTO_CLOSE_MS);
        },
        onPending(result: any) {
          console.log("Payment pending:", result);
          setStatus({
            kind: "warn",
            text: `Pembayaran pending. Order ID: ${midtrans_order_id}. Selesaikan pembayaran atau tunggu konfirmasi.`,
          });
        },
        onError(result: any) {
          console.log("Payment error:", result);
          setStatus({ kind: "err", text: "Pembayaran gagal. Silakan coba lagi." });
        },
        onClose() {
          setStatus({ kind: "warn", text: "Popup pembayaran ditutup. Klik bayar untuk mencoba lagi." });
        },
      });
    } catch (e: any) {
      console.error("Pay error:", e);
      setStatus({ kind: "err", text: e?.message ?? "Error" });
    } finally {
      setLoading(false);
    }
  }

  const statusClasses =
    status?.kind === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status?.kind === "err"
        ? "border-red-200 bg-red-50 text-red-700"
        : status?.kind === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-pink-200 bg-pink-50 text-pink-700";

  return (
    <>
      <Script
        src={snapScriptUrl}
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        onLoad={() => setSnapReady(true)}
        onError={() => setSnapReady(false)}
      />

      {/* Success Modal */}
      {successOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeSuccessAndReset}
          />

          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl animate-[pop_180ms_ease-out]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Pembayaran Berhasil
                </div>
                <h3 className="mt-3 text-xl font-bold text-gray-900">Terima kasih! 🎉</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Foto Anda sedang diproses. Tunggu panggilan untuk pengambilan.
                </p>
              </div>

              <button
                onClick={closeSuccessAndReset}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Tutup
              </button>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl bg-gray-50 border border-gray-200 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Order ID</span>
                <span className="font-mono text-gray-900 font-medium">{successInfo?.midtrans_order_id ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Total</span>
                <span className="text-gray-900 font-semibold">Rp{formatIDR(successInfo?.amount ?? 0)}</span>
              </div>

              {successInfo?.name && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Nama</span>
                  <span className="text-gray-900">{successInfo.name}</span>
                </div>
              )}

              {successInfo?.queueNumber && (
                <div className="flex items-center justify-between gap-3 bg-pink-100 rounded-lg px-3 py-2 -mx-1">
                  <span className="text-pink-700 font-medium">🎫 Nomor Urut</span>
                  <span className="text-pink-700 font-bold text-lg">{successInfo.queueNumber}</span>
                </div>
              )}

              <div className="mt-1 rounded-xl bg-pink-50 border border-pink-100 p-3 text-xs text-pink-700">
                {successInfo?.email ? (
                  <>
                    📧 Receipt dikirim ke: <span className="font-semibold">{successInfo.email}</span>
                    <br />
                    Cek folder Inbox atau Spam jika belum menerima.
                  </>
                ) : (
                  <>
                    💡 Simpan <span className="font-semibold">Order ID</span> di atas sebagai bukti pesanan.
                  </>
                )}
              </div>
            </div>

            <style jsx>{`
              @keyframes pop {
                from {
                  transform: scale(0.96);
                  opacity: 0;
                }
                to {
                  transform: scale(1);
                  opacity: 1;
                }
              }
            `}</style>
          </div>
        </div>
      )}

      <CameraScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(text) => {
          setInput(text);
          setQty((q) => (q < 1 ? 1 : q));
          setTimeout(() => scanRef.current?.focus(), 50);
        }}
      />

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-pink-50">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
          {/* Header */}
          <div className="text-center">
            {/* Logo - ganti src dengan logo asli */}
            <div className="flex justify-center mb-4">
              <img
                src="/logo.png"
                alt="Spark Stage Print Logo"
                className="h-16 w-auto object-contain"
                onError={(e) => {
                  // Fallback jika logo belum ada
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-4 py-1.5 text-sm font-medium text-pink-700">
              <span className="h-2 w-2 rounded-full bg-[#ff4b86] animate-pulse" />
              Print Your Photo.
            </div>
            <h1 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
              Spark Stage Print
            </h1>
            <p className="mt-2 text-gray-600">
              Scan QR → Bayar → Ambil foto.
            </p>
          </div>

          {/* Total Card
          <div className="mt-6 flex justify-center">
            <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 text-center shadow-lg shadow-blue-500/20">
              <div className="text-sm text-blue-100">Total Pembayaran</div>
              <div className="text-3xl font-bold text-white">Rp{formatIDR(total)}</div>
            </div>
          </div> */}

          {/* Main Form */}
          <div className="mt-8">
            <div className="rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-gray-100 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900">📝 Isi Data Pesanan</h2>
              <p className="mt-1 text-sm text-gray-500">
                Scan atau upload QR code dari FotoShare untuk mencetak foto Anda.
              </p>

              {/* Name */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700">
                  Nama <span className="text-red-500 font-normal">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Rani / Budi"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all"
                />
              </div>

              {/* Email */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Contoh: rani@gmail.com"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all"
                />
                {!isValidEmail(email.trim()) && email.trim() && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <span>⚠️</span> Format email tidak valid.
                  </div>
                )}
              </div>

              {/* Queue Number */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Nomor Urut <span className="text-red-500 font-normal">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={queueNumber}
                  onChange={(e) => setQueueNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="Masukkan nomor urut Anda (1-100)"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all"
                />
                {queueNumber && !isValidQueueNumber && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <span>⚠️</span> Nomor urut harus antara 1-999
                  </div>
                )}
              </div>

              {/* Fotoshare */}
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Link FotoShare <span className="text-red-500">*</span>
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScanOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      📷 Scan
                    </button>

                    <button
                      type="button"
                      onClick={() => qrFileRef.current?.click()}
                      disabled={decoding}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {decoding ? "⏳ Membaca..." : "📁 Upload"}
                    </button>
                    <input
                      ref={qrFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,.heic,.heif"
                      onChange={handleQRUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                <input
                  ref={scanRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="https://fotoshare.co/i/xxxxx atau token xxxxx"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all font-mono text-sm"
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Size selection */}
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <div className="text-sm font-medium text-gray-700">📐 Pilih Ukuran</div>
                  <div className="mt-3 space-y-2">
                    {SIZE_OPTIONS.map((opt) => (
                      <label
                        key={opt.key}
                        className={[
                          "flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all",
                          size === opt.key
                            ? "border-[#ff4b86] bg-pink-50 shadow-sm"
                            : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="size"
                          value={opt.key}
                          checked={size === opt.key}
                          onChange={() => setSize(opt.key)}
                          className="h-4 w-4 text-[#ff4b86] accent-[#ff4b86]"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                          <div className="text-xs text-gray-500">{opt.desc}</div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900">
                          Rp{formatIDR(opt.price)}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Qty */}
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <div className="text-sm font-medium text-gray-700">🔢 Jumlah Cetak</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => bumpQty(-1)}
                      className="h-14 w-14 rounded-xl border-2 border-gray-300 bg-white text-2xl font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all shadow-sm"
                      aria-label="Kurangi jumlah"
                    >
                      −
                    </button>

                    <div className="min-w-[100px] text-center">
                      <div className="text-4xl font-bold text-gray-900">{qty}</div>
                      <div className="text-xs text-gray-500">maksimal 20</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => bumpQty(1)}
                      className="h-14 w-14 rounded-xl border-2 border-gray-300 bg-white text-2xl font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all shadow-sm"
                      aria-label="Tambah jumlah"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <span>💳 Metode bayar:</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    QRIS
                  </span>
                  {!snapReady && (
                    <span className="text-xs text-gray-400 animate-pulse">
                      (memuat pembayaran...)
                    </span>
                  )}
                </div>

                <button
                  onClick={pay}
                  disabled={!canPay}
                  className={[
                    "w-full sm:w-auto rounded-xl px-8 py-4 text-base font-bold transition-all shadow-lg",
                    "bg-[#ff4b86] text-white",
                    "hover:bg-[#e63d75] hover:shadow-xl hover:shadow-pink-500/25",
                    "active:scale-[0.98]",
                    "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none",
                  ].join(" ")}
                >
                  {loading ? "⏳ Memproses..." : `Bayar Rp${formatIDR(total)}`}
                </button>
              </div>
            </div>

            {/* Status */}
            <div className={`mt-4 rounded-2xl border p-4 ${statusClasses}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg">
                  {status?.kind === "ok" ? "✅" : status?.kind === "err" ? "❌" : status?.kind === "warn" ? "⚠️" : "ℹ️"}
                </span>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide opacity-80">Status</div>
                  <div className="mt-1 text-sm leading-relaxed">{status?.text ?? "-"}</div>
                </div>
              </div>
            </div>

            {/* Help Section */}
            <div className="mt-6 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 p-6">
              <h3 className="text-lg font-bold text-gray-900">❓ Cara Cetak Foto</h3>
              <ol className="mt-4 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff4b86] text-xs font-bold text-white shrink-0">1</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Scan atau Upload QR</span> — Gunakan tombol "Scan" untuk menggunakan kamera, atau "Upload" untuk memilih gambar QR dari galeri.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff4b86] text-xs font-bold text-white shrink-0">2</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Pilih ukuran & jumlah</span> — Tentukan ukuran cetak dan berapa banyak yang ingin dicetak.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff4b86] text-xs font-bold text-white shrink-0">3</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Bayar dengan QRIS</span> — Klik tombol bayar dan scan QRIS menggunakan e-wallet atau mobile banking.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shrink-0">4</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Tunggu panggilan</span> — Setelah pembayaran berhasil, tunggu foto Anda dicetak dan dipanggil untuk pengambilan.
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
