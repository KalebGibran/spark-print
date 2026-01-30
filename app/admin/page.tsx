"use client";

import { useEffect, useMemo, useState } from "react";

type OrderStatus = "PENDING" | "PAID" | "PRINTED" | "FAILED" | string;

type Order = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  fotoshare_token: string;
  size: string;
  qty: number;
  amount: number;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  midtrans_order_id: string | null;
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function badgeClasses(status: string) {
  switch (status) {
    case "PAID":
      return "bg-sky-500/20 text-sky-200 border border-sky-500/30";
    case "PRINTED":
      return "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30";
    case "PENDING":
      return "bg-amber-500/20 text-amber-100 border border-amber-500/30";
    case "FAILED":
      return "bg-red-500/20 text-red-200 border border-red-500/30";
    default:
      return "bg-white/10 text-zinc-200 border border-white/10";
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");

  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [status, setStatus] = useState<"ALL" | "PENDING" | "PAID" | "PRINTED" | "FAILED">("ALL");
  const [needsPrint, setNeedsPrint] = useState(false); // PAID only shortcut
  const [q, setQ] = useState("");

  // Sort
  const [sortField, setSortField] = useState<"paid_at" | "created_at">("paid_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const authHeader = useMemo(() => ({ "x-admin-password": password }), [password]);

  async function load() {
    if (!password) {
      setMsg("Isi password operator dulu.");
      return;
    }

    setMsg("loading...");

    const params = new URLSearchParams();
    params.set("status", status);
    params.set("needsPrint", needsPrint ? "1" : "0");
    params.set("q", q.trim());
    params.set("sortField", sortField);
    params.set("sortDir", sortDir);
    params.set("limit", "200");

    const r = await fetch(`/api/admin/orders?${params.toString()}`, { headers: authHeader });
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
    if (!r.ok) {
      // 409 not_paid_or_already_printed -> show clean message
      return alert(j?.error ?? `HTTP ${r.status}`);
    }

    await load();
  }

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    if (!password) return;

    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, password, status, needsPrint, q, sortField, sortDir]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Admin Queue</h1>
            <p className="mt-1 text-sm text-zinc-400">Semua order + filter status + search + sort</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4"
            />
            Auto refresh (5s)
          </label>
        </div>

        {/* Password + Refresh */}
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
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
            className="h-[46px] self-end rounded-xl bg-white px-5 py-3 font-semibold text-zinc-950"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">Filter status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3 outline-none"
              disabled={needsPrint}
              title={needsPrint ? "Disable karena 'Butuh print saja' aktif" : ""}
            >
              <option value="ALL">ALL</option>
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
              <option value="PRINTED">PRINTED</option>
              <option value="FAILED">FAILED</option>
            </select>

            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={needsPrint}
                onChange={(e) => setNeedsPrint(e.target.checked)}
                className="h-4 w-4"
              />
              Butuh print saja (PAID)
            </label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="token / nama / email / order id"
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3 outline-none"
            />
            <div className="mt-2 text-xs text-zinc-400">Tip: tekan Refresh kalau auto-refresh off.</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">Sort field</div>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3 outline-none"
            >
              <option value="paid_at">paid_at</option>
              <option value="created_at">created_at</option>
            </select>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">Sort direction</div>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as any)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-3 outline-none"
            >
              <option value="desc">desc (newest first)</option>
              <option value="asc">asc (oldest first)</option>
            </select>
          </div>
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
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Token</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Size</th>
                <th className="px-4 py-3 text-left">Qty</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-white/10">
                  <td className="px-4 py-3">{o.paid_at ?? "-"}</td>
                  <td className="px-4 py-3">{o.created_at}</td>
                  <td className="px-4 py-3 font-mono">{o.fotoshare_token}</td>
                  <td className="px-4 py-3">{o.customer_name || "-"}</td>
                  <td className="px-4 py-3">{o.customer_email || "-"}</td>
                  <td className="px-4 py-3">{o.size}</td>
                  <td className="px-4 py-3">{o.qty}</td>
                  <td className="px-4 py-3">Rp{formatIDR(o.amount)}</td>

                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold", badgeClasses(o.status)].join(" ")}>
                      {o.status}
                    </span>
                  </td>

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
                        disabled={o.status !== "PAID"}
                        className={[
                          "rounded-lg px-3 py-2 font-semibold",
                          o.status !== "PAID"
                            ? "bg-white/10 text-zinc-400 cursor-not-allowed"
                            : "bg-emerald-400/90 text-zinc-950 hover:bg-emerald-400",
                        ].join(" ")}
                        title={o.status !== "PAID" ? "Hanya bisa Mark Printed jika status PAID" : ""}
                      >
                        {o.status === "PRINTED" ? "Printed" : "Mark Printed"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {orders.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-zinc-400" colSpan={10}>
                    Tidak ada data untuk filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          Catatan: “Butuh print saja” = hanya status PAID. PRINTED sudah selesai. PENDING = belum bayar. FAILED = gagal/expired.
        </div>
      </div>
    </main>
  );
}
