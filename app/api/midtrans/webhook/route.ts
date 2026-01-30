import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY!;

function sha512hex(s: string) {
  return crypto.createHash("sha512").update(s).digest("hex");
}

export async function POST(req: Request) {
  const n = await req.json();

  const order_id = String(n?.order_id ?? "");
  const status_code = String(n?.status_code ?? "");
  const gross_amount = String(n?.gross_amount ?? "");
  const signature_key = String(n?.signature_key ?? "");

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const expected = sha512hex(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY);
  if (expected !== signature_key) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const transaction_status = String(n?.transaction_status ?? "");
  const fraud_status = String(n?.fraud_status ?? "");

  const isPaid =
    (transaction_status === "settlement" || transaction_status === "capture") &&
    fraud_status !== "deny";

  const newStatus =
    isPaid ? "PAID" :
    transaction_status === "pending" ? "PENDING" :
    (transaction_status === "expire" || transaction_status === "cancel" || transaction_status === "deny") ? "FAILED" :
    "PENDING";

  // Fetch existing paid_at once (avoid overwriting)
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("print_orders")
    .select("id, paid_at, status")
    .eq("midtrans_order_id", order_id)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: true, msg: "order_not_found" });

  const shouldSetPaidAt = isPaid && !existing.paid_at;

  const updatePayload: any = { status: newStatus };
  if (shouldSetPaidAt) updatePayload.paid_at = new Date().toISOString();

  await supabaseAdmin
    .from("print_orders")
    .update(updatePayload)
    .eq("id", existing.id);

  return NextResponse.json({ ok: true });
}
