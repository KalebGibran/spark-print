"use client";

import { useEffect, useMemo, useState } from "react";

type OrderStatus = "PENDING" | "PAID" | "PRINTED" | "FAILED" | string;

type Order = {
  id: string;
  queue_number: number | null;
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
  payment_method?: string | null;
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function badgeClasses(status: string) {
  switch (status) {
    case "PAID":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    case "PRINTED":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "PENDING":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    case "FAILED":
      return "bg-red-100 text-red-700 border border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [qrisOrders, setQrisOrders] = useState<Order[]>([]);
  const [cashierOrders, setCashierOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Tab
  const [activeTab, setActiveTab] = useState<"qris" | "cashier">("qris");

  // Filters
  const [status, setStatus] = useState<"ALL" | "PENDING" | "PAID" | "PRINTED" | "FAILED">("ALL");
  const [needsPrint, setNeedsPrint] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<"ALL" | "4x6" | "strip">("ALL");
  const [q, setQ] = useState("");

  // Sort
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const authHeader = useMemo(() => ({ "x-admin-password": password }), [password]);

  async function load() {
    if (!password) {
      setMsg("Isi password operator dulu.");
      return;
    }

    setMsg("loading...");

    // Load QRIS orders (payment_method = 'qris' or null, exclude PENDING since they're waiting for payment)
    const qrisParams = new URLSearchParams();
    qrisParams.set("status", needsPrint ? "PAID" : status);
    qrisParams.set("size", sizeFilter);
    qrisParams.set("q", q.trim());
    qrisParams.set("sortField", "paid_at");
    qrisParams.set("sortDir", sortDir);
    qrisParams.set("limit", "200");
    qrisParams.set("paymentMethod", "qris");

    const qrisRes = await fetch(`/api/admin/orders?${qrisParams.toString()}`, { headers: authHeader });
    const qrisJson = await qrisRes.json().catch(() => ({}));

    // Load Cashier orders
    const cashierParams = new URLSearchParams();
    cashierParams.set("status", status);
    cashierParams.set("size", sizeFilter);
    cashierParams.set("q", q.trim());
    cashierParams.set("sortField", "created_at");
    cashierParams.set("sortDir", sortDir);
    cashierParams.set("limit", "200");
    cashierParams.set("paymentMethod", "cashier");

    const cashierRes = await fetch(`/api/admin/orders?${cashierParams.toString()}`, { headers: authHeader });
    const cashierJson = await cashierRes.json().catch(() => ({}));

    if (!qrisRes.ok || !cashierRes.ok) {
      return setMsg(qrisJson?.error ?? cashierJson?.error ?? "Load failed");
    }

    setQrisOrders(qrisJson.orders ?? []);
    setCashierOrders(cashierJson.orders ?? []);
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
      return alert(j?.error ?? `HTTP ${r.status}`);
    }

    await load();
  }

  async function markPaid(id: string) {
    if (!confirm("Tandai pesanan ini sebagai SUDAH DIBAYAR?")) return;

    const r = await fetch("/api/admin/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ id }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
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
  }, [autoRefresh, password, status, needsPrint, sizeFilter, q, sortDir]);

  const currentOrders = activeTab === "qris" ? qrisOrders : cashierOrders;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              🖨️ Print Queue
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Kelola antrian print foto • Auto-refresh setiap 5 detik
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Auto refresh</span>
              {autoRefresh && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Password + Refresh */}
        <div className="mt-6 rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Password Operator
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
                placeholder="••••••••"
                type="password"
              />
            </div>

            <button
              onClick={load}
              className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setActiveTab("qris")}
            className={[
              "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
              activeTab === "qris"
                ? "bg-blue-600 text-white shadow"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            ].join(" ")}
          >
            💳 Pesanan QRIS ({qrisOrders.length})
          </button>
          <button
            onClick={() => setActiveTab("cashier")}
            className={[
              "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
              activeTab === "cashier"
                ? "bg-pink-600 text-white shadow"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            ].join(" ")}
          >
            🏪 Pesanan Kasir ({cashierOrders.length})
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Filter Status */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Filter Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              disabled={needsPrint}
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">🕐 PENDING</option>
              <option value="PAID">💰 PAID</option>
              <option value="PRINTED">✅ PRINTED</option>
              <option value="FAILED">❌ FAILED</option>
            </select>

            <label className="mt-3 flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={needsPrint}
                onChange={(e) => setNeedsPrint(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Butuh print saja</span>
            </label>
          </div>

          {/* Search */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Cari
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Token / nama / email..."
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>

          {/* Filter Ukuran */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Filter Ukuran
            </label>
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="ALL">Semua Ukuran</option>
              <option value="4x6">📷 4×6</option>
              <option value="strip">📸 2×6 Strip</option>
            </select>
          </div>

          {/* Sort */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Urutkan
            </label>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "desc" | "asc")}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="desc">⬇️ Terbaru</option>
              <option value="asc">⬆️ Terlama</option>
            </select>
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>{msg}</span>
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm border border-gray-200 shadow-sm">
            <span className="text-gray-500">Total:</span>
            <span className="font-semibold text-gray-900">{currentOrders.length}</span>
          </div>
          {activeTab === "qris" && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm border border-blue-200">
              <span className="text-blue-600">Perlu Print:</span>
              <span className="font-semibold text-blue-700">
                {currentOrders.filter(o => o.status === "PAID").length}
              </span>
            </div>
          )}
          {activeTab === "cashier" && (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm border border-amber-200">
                <span className="text-amber-600">Belum Bayar:</span>
                <span className="font-semibold text-amber-700">
                  {currentOrders.filter(o => o.status === "PENDING").length}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm border border-blue-200">
                <span className="text-blue-600">Perlu Print:</span>
                <span className="font-semibold text-blue-700">
                  {currentOrders.filter(o => o.status === "PAID").length}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">No. Urut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {activeTab === "qris" ? "Paid at" : "Created at"}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Token</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {currentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-pink-100 text-pink-700 font-bold text-sm">
                        {o.queue_number ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {activeTab === "qris" ? (
                        o.paid_at ? (
                          <span className="font-mono text-xs">{o.paid_at}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : (
                        <span className="font-mono text-xs">{o.created_at}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                        {o.fotoshare_token}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{o.customer_name || "-"}</div>
                      <div className="text-xs text-gray-500">{o.customer_email || "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {o.size === "strip" ? "2×6" : o.size}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{o.qty}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">Rp{formatIDR(o.amount)}</td>

                    <td className="px-4 py-3">
                      <span className={["inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", badgeClasses(o.status)].join(" ")}>
                        {o.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          href={`https://fotoshare.co/i/${o.fotoshare_token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          🔗 Open
                        </a>

                        {/* Cashier: Show Pay button for PENDING */}
                        {activeTab === "cashier" && o.status === "PENDING" && (
                          <button
                            onClick={() => markPaid(o.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
                          >
                            💰 Bayar
                          </button>
                        )}

                        <button
                          onClick={() => markPrinted(o.id)}
                          disabled={o.status !== "PAID"}
                          className={[
                            "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                            o.status !== "PAID"
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm",
                          ].join(" ")}
                        >
                          {o.status === "PRINTED" ? "✅ Done" : "🖨️ Print"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {currentOrders.length === 0 && (
                  <tr>
                    <td className="px-4 py-12 text-center text-gray-400" colSpan={9}>
                      <div className="text-4xl mb-2">📭</div>
                      <div>Tidak ada data untuk filter ini.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4">
          <div className="flex items-start gap-2 text-sm text-blue-700">
            <span>💡</span>
            <div>
              {activeTab === "qris" ? (
                <span><span className="font-medium">Tips:</span> Gunakan filter "Butuh print saja" untuk fokus pada order yang perlu diprint (status PAID).</span>
              ) : (
                <span><span className="font-medium">Tips:</span> Klik "Bayar" setelah customer bayar di kasir, lalu klik "Print" untuk memproses.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
