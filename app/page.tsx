"use client";

import Script from "next/script";
import { useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    snap: any;
  }
}

type SizeKey = "4x6" | "strip" | "6x8";

const SIZE_OPTIONS: { key: SizeKey; label: string; hint: string }[] = [
  { key: "4x6", label: "4×6", hint: "Standard photo print" },
  { key: "strip", label: "Strip", hint: "Photobooth-style strip" },
  { key: "6x8", label: "6×8", hint: "Large / premium" },
];

function unitPrice(size: SizeKey) {
  if (size === "6x8") return 20000;
  if (size === "strip") return 15000;
  return 10000;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function KioskPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [input, setInput] = useState("");
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState<SizeKey>("4x6");
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<
    { kind: "idle" | "info" | "ok" | "warn" | "err"; text: string } | undefined
  >({ kind: "info", text: "Masukkan link/token FotoShare (atau scan barcode), pilih ukuran & jumlah, lalu bayar QRIS." });

  const scanRef = useRef<HTMLInputElement | null>(null);

  const total = useMemo(() => unitPrice(size) * qty, [size, qty]);

  const snapScriptUrl =
    process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";

  function bumpQty(delta: number) {
    setQty((q) => Math.min(20, Math.max(1, q + delta)));
  }

  async function pay() {
    if (!input.trim()) {
      setStatus({ kind: "warn", text: "Link/token FotoShare masih kosong." });
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

      setStatus({ kind: "info", text: "Menampilkan QRIS..." });

      window.snap.pay(j.snap_token, {
        gopayMode: "qr",
        onSuccess: () => {
          // Sukses yang valid tetap webhook. Ini hanya UX.
          setStatus({ kind: "ok", text: "Pembayaran sukses. Silakan tunggu diproses operator." });
        },
        onPending: () => setStatus({ kind: "info", text: "Menunggu pembayaran (scan QRIS)." }),
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
      <Script src={snapScriptUrl} data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY} />

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
                    <button
                      type="button"
                      onClick={() => scanRef.current?.focus()}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      Focus Scan
                    </button>
                  </div>
                  <input
                    ref={scanRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="https://fotoshare.co/i/4dsstyb atau 4dsstyb"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-4 text-base outline-none placeholder:text-zinc-600 focus:border-white/20"
                  />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {/* Size */}
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                    <div className="text-xs text-zinc-400">Ukuran</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {SIZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setSize(opt.key)}
                          className={[
                            "rounded-2xl px-3 py-3 text-sm font-medium transition",
                            size === opt.key
                              ? "border border-white/20 bg-white/10"
                              : "border border-white/10 bg-white/5 hover:bg-white/10",
                          ].join(" ")}
                        >
                          <div>{opt.label}</div>
                          <div className="mt-1 text-[11px] text-zinc-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-zinc-400">
                      Harga/lembar: <span className="text-zinc-200">Rp{formatIDR(unitPrice(size))}</span>
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
                      >
                        +
                      </button>
                    </div>
                    <div className="mt-4 text-xs text-zinc-400">
                      Tips: untuk photostrip, pilih <span className="text-zinc-200">Strip</span>.
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-zinc-400">
                    Metode bayar: <span className="text-zinc-200">QRIS</span>
                  </div>

                  <button
                    onClick={pay}
                    disabled={loading}
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
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {status?.text ?? "-"}
                </div>
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
