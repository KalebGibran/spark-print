"use client";

import { useEffect, useMemo, useState } from "react";

type Order = {
  id: string;
  fotoshare_token: string;
  size: string;
  qty: number;
  amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  midtrans_order_id: string | null;
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");

  const authHeader = useMemo(() => ({ Authorization: `Bearer ${password}` }), [password]);

  async function load() {
    setMsg("loading...");
    const r = await fetch("/api/admin/paid-orders", { headers: authHeader });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j?.error ?? `HTTP ${r.status}`);
    setOrders(j.orders ?? []);
    setMsg("");
  }

  async function markPrinted(id: string) {
    const r = await fetch("/api/admin/mark-printed", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j?.error ?? `HTTP ${r.status}`);
    await load();
  }

  useEffect(() => {
    // jangan auto-load tanpa password
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Admin Queue</h1>
        <p className="mt-1 text-sm text-zinc-400">List order status PAID (siap diprint)</p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <div className="text-xs text-zinc-400">Operator password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
              placeholder="••••••••"
              type="password"
            />
          </div>
          <button
            onClick={load}
            className="rounded-xl bg-white px-5 py-3 font-semibold text-zinc-950"
          >
            Refresh
          </button>
        </div>

        {msg && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            {msg}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-zinc-300">
              <tr>
                <th className="px-4 py-3 text-left">Paid at</th>
                <th className="px-4 py-3 text-left">Token</th>
                <th className="px-4 py-3 text-left">Size</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-white/10">
                  <td className="px-4 py-3">{o.paid_at ?? "-"}</td>
                  <td className="px-4 py-3 font-mono">{o.fotoshare_token}</td>
                  <td className="px-4 py-3">{o.size}</td>
                  <td className="px-4 py-3">{o.qty}</td>
                  <td className="px-4 py-3">Rp{formatIDR(o.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                        href={`https://fotoshare.co/i/${o.fotoshare_token}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open FotoShare
                      </a>
                      <button
                        onClick={() => markPrinted(o.id)}
                        className="rounded-lg bg-emerald-400/90 px-3 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
                      >
                        Mark Printed
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-zinc-400" colSpan={6}>
                    Belum ada order PAID.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
