import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendOrderEmail } from "@/lib/email";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch order to verify it's a cashier order and PENDING
  const { data: order, error: fetchErr } = await supabaseAdmin
    .from("print_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  if (order.payment_method !== "cashier") {
    return NextResponse.json({ error: "not_a_cashier_order" }, { status: 400 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "order_already_processed" }, { status: 409 });
  }

  // Update to PAID
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("print_orders")
    .update({ 
      status: "PAID",
      paid_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Send payment receipt email (non-blocking)
  if (order.customer_email) {
    try {
      await sendOrderEmail({
        to: order.customer_email,
        name: order.customer_name || "Customer",
        orderId: order.midtrans_order_id || order.id,
        amount: order.amount,
        items: [{
          name: `Photo Print ${order.size} (${order.qty}x)`,
          qty: order.qty,
          price: order.amount / order.qty
        }],
        type: "PAYMENT_RECEIVED",
        queueNumber: order.queue_number
      });
    } catch (e) {
      console.error("Failed to send payment email:", e);
      // Don't fail the request - payment is already recorded
    }
  }

  return NextResponse.json({ ok: true, order: updated });
}

