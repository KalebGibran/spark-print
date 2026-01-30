"use client";

import Script from "next/script";
import { useMemo, useRef, useState } from "react";
import CameraScannerModal from "./components/CameraScannerModal";



declare global {
  interface Window {
    snap: any;
  }
}

type SizeKey = "4x6";

function unitPrice(_size: SizeKey) {
  return 10000; // 4x6 fixed
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

  // Fotoshare + order
  const [input, setInput] = useState("");
  const [qty, setQty] = useState(0);
  const size: SizeKey = "4x6";

  const [loading, setLoading] = useState(false);
  const [snapReady, setSnapReady] = useState(false);

  const [status, setStatus] = useState<
    { kind: "idle" | "info" | "ok" | "warn" | "err"; text: string } | undefined
  >({ kind: "info", text: "Scan barcode / tempel link FotoShare, atur jumlah, lalu bayar QRIS." });

  const [scanOpen, setScanOpen] = useState(false);

  // Success modal state
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    midtrans_order_id: string;
    amount: number;
    email: string | null;
    name: string | null;
  } | null>(null);

  // Keep timeout id so we can clear on manual close
  const successTimerRef = useRef<number | null>(null);

  const scanRef = useRef<HTMLInputElement | null>(null);

  const total = useMemo(() => unitPrice(size) * qty, [qty, size]);

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
    setInput("");
    setQty(0);
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  function closeSuccessAndReset() {
    clearSuccessTimer();
    setSuccessOpen(false);
    resetForm();
  }

  const canPay =
    !loading &&
    snapReady &&
    input.trim().length > 0 &&
    qty >= 1 &&
    isValidEmail(email.trim());

  async function pay() {
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
      setStatus({ kind: "err", text: "Snap.js belum ter-load. Refresh halaman." });
      return;
    }
    if (!isValidEmail(email.trim())) {
      setStatus({ kind: "warn", text: "Format email tidak valid." });
      return;
    }

    setLoading(true);
    setStatus({ kind: "info", text: "Membuat order..." });

    try {
      const r = await fetch("/api/print-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotoshare_input: input,
          qty,
          size,
          customer_name: name,
          customer_email: email,
        }),
      });

      const text = await r.text();
      if (!r.ok) {
        setStatus({ kind: "err", text: `Gagal membuat order.\n${text}` });
        return;
      }

      const j = JSON.parse(text) as { snap_token: string; midtrans_order_id: string };

      // info for modal
      setSuccessInfo({
        midtrans_order_id: j.midtrans_order_id ?? "-",
        amount: total,
        email: email.trim() ? email.trim() : null,
        name: name.trim() ? name.trim() : null,
      });

      setStatus({ kind: "info", text: "Menampilkan QRIS..." });

      window.snap.pay(j.snap_token, {
        gopayMode: "qr",

        // UX: show progress while waiting confirmation
        onPending: () =>
          setStatus({ kind: "info", text: "Menunggu konfirmasi pembayaran... (scan QRIS)" }),

        onSuccess: () => {
          setStatus({
            kind: "ok",
            text: "Pembayaran sukses. Silakan cek email dan pickup di kasir.",
          });

          setSuccessOpen(true);

          // IMPORTANT: reset AFTER modal closes (feels smoother)
          clearSuccessTimer();
          successTimerRef.current = window.setTimeout(() => {
            setSuccessOpen(false);
            resetForm();
            successTimerRef.current = null;
          }, SUCCESS_MODAL_AUTO_CLOSE_MS);
        },

        onError: () => setStatus({ kind: "err", text: "Pembayaran gagal. Coba ulang." }),
        onClose: () => setStatus({ kind: "warn", text: "Popup pembayaran ditutup. Kamu bisa coba lagi." }),
      });
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message ?? "Error" });
    } finally {
      setLoading(false);
    }
  }

  const statusClasses =
    status?.kind === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : status?.kind === "err"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : status?.kind === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-sky-500/30 bg-sky-500/10 text-sky-100";

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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeSuccessAndReset}
          />

          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-2xl animate-[pop_180ms_ease-out]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Payment Success
                </div>
                <h3 className="mt-3 text-xl font-semibold">Pembayaran berhasil</h3>
                <p className="mt-1 text-sm text-zinc-300">
                  Silakan pickup di kasir dengan menunjukkan receipt/bukti bayar.
                </p>
              </div>

              <button
                onClick={closeSuccessAndReset}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
              >
                Tutup
              </button>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-400">Order ID</span>
                <span className="font-mono text-zinc-100">{successInfo?.midtrans_order_id ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-400">Total</span>
                <span className="text-zinc-100">Rp{formatIDR(successInfo?.amount ?? 0)}</span>
              </div>

              {successInfo?.name && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400">Nama</span>
                  <span className="text-zinc-100">{successInfo.name}</span>
                </div>
              )}

              <div className="mt-1 rounded-xl border border-white/10 bg-zinc-950/40 p-3 text-xs text-zinc-300">
                {successInfo?.email ? (
                  <>
                    Receipt dikirim ke: <span className="font-semibold">{successInfo.email}</span>
                    <br />
                    Jika email belum masuk, tunggu 1–2 menit lalu cek Spam/Promotions.
                  </>
                ) : (
                  <>
                    Kamu belum mengisi email. Untuk receipt email, isi email pada transaksi berikutnya.
                    <br />
                    Untuk pickup, tunjukkan <span className="font-semibold">Order ID</span> di atas ke kasir.
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

      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Kiosk Mode
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Spark Stage Print
              </h1>
              <p className="mt-1 text-sm text-zinc-400">Scan QR → bayar → operator print.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs text-zinc-400">Total</div>
              <div className="text-2xl font-semibold">Rp{formatIDR(total)}</div>
            </div>
          </div>
          
          {/* Layout */}
          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            {/* Left */}
            <section className="lg:col-span-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
                <h2 className="text-lg font-semibold">Input</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Scan barcode ke input FotoShare (scanner USB) atau tempel link.
                </p>

                {/* Name */}
                <div className="mt-4">
                  <label className="text-xs text-zinc-400">Nama (opsional)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="contoh: Rani / Budi"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-4 text-base outline-none placeholder:text-zinc-600 focus:border-white/20"
                  />
                </div>

                {/* Email */}
                <div className="mt-4">
                  <label className="text-xs text-zinc-400">Email (opsional, untuk receipt)</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contoh: rani@gmail.com"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-4 text-base outline-none placeholder:text-zinc-600 focus:border-white/20"
                  />
                  {!isValidEmail(email.trim()) && email.trim() && (
                    <div className="mt-2 text-xs text-amber-200">Format email tidak valid.</div>
                  )}
                </div>

                {/* Fotoshare */}
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs text-zinc-400">FotoShare link / token</label>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setScanOpen(true)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                      >
                        Scan Camera
                      </button>

                      <button
                        type="button"
                        onClick={() => scanRef.current?.focus()}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                      >
                        Focus Scan
                      </button>
                    </div>
                  </div>

                  <input
                    ref={scanRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="https://fotoshare.co/i/xxxxx atau xxxxx"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-4 text-base outline-none placeholder:text-zinc-600 focus:border-white/20"
                  />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {/* Size info */}
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="text-xs text-zinc-400">Ukuran</div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <div className="text-sm font-semibold">4×6</div>
                      <div className="mt-1 text-xs text-zinc-400">Standard photo print</div>
                    </div>
                    <div className="mt-3 text-xs text-zinc-400">
                      Harga/lembar: <span className="text-zinc-200">Rp{formatIDR(unitPrice("4x6"))}</span>
                    </div>
                  </div>

                  {/* Qty */}
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="text-xs text-zinc-400">Jumlah</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => bumpQty(-1)}
                        className="h-14 w-14 rounded-2xl border border-white/10 bg-white/5 text-2xl hover:bg-white/10"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>

                      <div className="min-w-[120px] text-center">
                        <div className="text-4xl font-semibold">{qty}</div>
                        <div className="text-xs text-zinc-400">maks 20</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => bumpQty(1)}
                        className="h-14 w-14 rounded-2xl border border-white/10 bg-white/5 text-2xl hover:bg-white/10"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <div className="mt-4 text-xs text-zinc-400">Tips: scan barcode → set jumlah → bayar.</div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-zinc-400">
                    Metode bayar: <span className="text-zinc-200">QRIS</span>
                    {!snapReady && <span className="ml-2 text-xs text-zinc-500">(loading payment...)</span>}
                  </div>

                  <button
                    onClick={pay}
                    disabled={!canPay}
                    className={[
                      "w-full sm:w-auto rounded-2xl px-6 py-4 text-base font-semibold transition",
                      "bg-white text-zinc-950 hover:bg-zinc-100 active:scale-[0.99]",
                      "disabled:opacity-60 disabled:cursor-not-allowed",
                    ].join(" ")}
                  >
                    {loading ? "Processing..." : `Pay Rp${formatIDR(total)}`}
                  </button>
                </div>
              </div>

              <div className={`mt-4 rounded-3xl border p-4 sm:p-5 ${statusClasses}`}>
                <div className="text-xs uppercase tracking-wide opacity-80">Status</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{status?.text ?? "-"}</div>
              </div>
            </section>

            {/* Right */}
            <aside className="lg:col-span-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
                <h3 className="text-lg font-semibold">Operator</h3>
                <ol className="mt-3 space-y-2 text-sm text-zinc-300">
                  <li className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">1) Customer bayar QRIS</li>
                  <li className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">
                    2) Cek order status <span className="font-semibold">PAID</span> di admin queue
                  </li>
                  <li className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">3) Open link → download → print</li>
                </ol>
                <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/30 p-4 text-xs text-zinc-400">
                  Catatan keamanan: jangan percaya screenshot “success”. Status valid harus dari sistem (webhook).
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
                <h3 className="text-lg font-semibold">Kiosk Tips</h3>
                <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                  <li className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">
                    Scanner USB paling stabil untuk barcode. Klik “Focus Scan” lalu scan.
                  </li>
                  <li className="rounded-2xl border border-white/10 bg-zinc-950/30 p-3">
                    Batasi input hanya domain fotoshare (sudah divalidasi server).
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
