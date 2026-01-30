import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY!;
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";

type SizeKey = "4x6" | "strip" | "6x8";

function parseFotoshareToken(input: string): string {
  const s = input.trim();

  if (!s.includes("://")) {
    if (!/^[a-zA-Z0-9]+$/.test(s)) throw new Error("Invalid token");
    return s;
  }

  const u = new URL(s);
  if (u.hostname !== "fotoshare.co") throw new Error("Only fotoshare.co allowed");
  const m = u.pathname.match(/^\/i\/([a-zA-Z0-9]+)$/);
  if (!m) throw new Error("Invalid fotoshare URL");
  return m[1];
}

function midtransAuth(serverKey: string) {
  return "Basic " + Buffer.from(`${serverKey}:`).toString("base64");
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    if (!MIDTRANS_SERVER_KEY) {
      return NextResponse.json({ error: "MIDTRANS_SERVER_KEY missing" }, { status: 500 });
    }

    const body = await req.json();

    const fotoshare_input = String(body?.fotoshare_input ?? "");
    const qty = Number(body?.qty ?? 1);
    const size = String(body?.size ?? "4x6") as SizeKey;

    const customer_name = String(body?.customer_name ?? "").trim().slice(0, 40);
    const customer_email = String(body?.customer_email ?? "").trim().toLowerCase().slice(0, 120);

    if (!fotoshare_input) return NextResponse.json({ error: "fotoshare_input required" }, { status: 400 });
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
      return NextResponse.json({ error: "qty must be 1..20" }, { status: 400 });
    }

    const allowedSizes = new Set<SizeKey>(["4x6", "strip", "6x8"]);
    if (!allowedSizes.has(size)) return NextResponse.json({ error: "invalid size" }, { status: 400 });

    if (!isValidEmail(customer_email)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }

    // pricing (sementara)
    const unitPrice = size === "6x8" ? 20000 : size === "strip" ? 15000 : 10000;
    const grossAmount = unitPrice * qty;

    const token = parseFotoshareToken(fotoshare_input);

    const shortRand = crypto.randomBytes(4).toString("hex");
    const midtrans_order_id = `PRINT-${Date.now()}-${shortRand}`.slice(0, 50);

    // 1) Insert order dulu (audit trail)
    const { data: order, error: insErr } = await supabaseAdmin
      .from("print_orders")
      .insert({
        midtrans_order_id,
        fotoshare_token: token,
        size,
        qty,
        amount: grossAmount,
        status: "PENDING",
        customer_name: customer_name || null,
        customer_email: customer_email || null,
        snap_error: null,
      })
      .select("*")
      .single();

    if (insErr) throw insErr;

    const snapUrl = MIDTRANS_IS_PRODUCTION
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    const payload = {
      transaction_details: { order_id: midtrans_order_id, gross_amount: grossAmount },
      enabled_payments: ["gopay"],
      item_details: [{ id: `print-${size}`, price: unitPrice, quantity: qty, name: `Photo Print ${size}` }],
      customer_details: {
        first_name: customer_name || "Customer",
        email: customer_email || undefined,
      },
    };

    // 2) Call Midtrans Snap
    const resp = await fetch(snapUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: midtransAuth(MIDTRANS_SERVER_KEY),
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();

    // 3) Kalau gagal → update order biar tidak nyangkut
    if (!resp.ok) {
      await supabaseAdmin
        .from("print_orders")
        .update({
          status: "FAILED",
          snap_error: `snap_error_http_${resp.status}: ${text}`.slice(0, 2000),
        })
        .eq("id", order.id);

      return NextResponse.json({ error: "midtrans_error", detail: text }, { status: 502 });
    }

    const snap = JSON.parse(text) as { token: string; redirect_url: string };

    // 4) Simpan token + timestamp
    await supabaseAdmin
      .from("print_orders")
      .update({
        snap_token: snap.token,
        snap_redirect_url: snap.redirect_url,
        snap_created_at: new Date().toISOString(),
        snap_error: null,
      })
      .eq("id", order.id);

    return NextResponse.json({
      ok: true,
      order_id: order.id,
      midtrans_order_id,
      snap_token: snap.token,
      redirect_url: snap.redirect_url,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bad_request" }, { status: 400 });
  }
}
