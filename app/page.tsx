"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    snap: any;
  }
}

export default function Home() {
  const [input, setInput] = useState("");
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState("4x6");
  const [msg, setMsg] = useState("");

  async function createAndPay() {
    setMsg("loading...");
    const r = await fetch("/api/print-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotoshare_input: input, qty, size }),
    });

    const text = await r.text();
    setMsg(`HTTP ${r.status}\n${text}`);

    if (!r.ok) return;

    const j = JSON.parse(text);
    if (!window.snap) {
      setMsg((m) => m + "\n\nSnap.js not loaded yet.");
      return;
    }

    window.snap.pay(j.snap_token, {
      gopayMode: "qr",
      onSuccess: () => setMsg("Payment success (cek webhook nanti untuk PAID)."),
      onPending: () => setMsg("Payment pending (scan QR)."),
      onError: () => setMsg("Payment error."),
      onClose: () => setMsg("Closed payment popup."),
    });
  }

  return (
    <>
      <Script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
      />

      <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
        <h1>Print Kiosk</h1>

        <div style={{ marginTop: 12 }}>
          <div>FotoShare link / token</div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: "100%", padding: 10 }}
            placeholder="https://fotoshare.co/i/4dsstyb atau 4dsstyb"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <select value={size} onChange={(e) => setSize(e.target.value)} style={{ padding: 10 }}>
            <option value="4x6">4x6</option>
            <option value="strip">strip</option>
            <option value="6x8">6x8</option>
          </select>

          <input
            type="number"
            min={1}
            max={20}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            style={{ width: 120, padding: 10 }}
          />
        </div>

        <button onClick={createAndPay} style={{ marginTop: 12, padding: "10px 14px" }}>
          Pay (QRIS)
        </button>

        <pre style={{ marginTop: 12, background: "#111", color: "#0f0", padding: 12, overflow: "auto" }}>
          {msg}
        </pre>
      </main>
    </>
  );
}
