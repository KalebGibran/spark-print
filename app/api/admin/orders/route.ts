import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

const ALLOWED_STATUS = new Set(["ALL", "PENDING", "PAID", "PRINTED", "FAILED"]);
const ALLOWED_SORT_FIELD = new Set(["paid_at", "created_at"]);
const ALLOWED_SORT_DIR = new Set(["desc", "asc"]);

export async function GET(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);

  const status = (url.searchParams.get("status") || "ALL").toUpperCase();
  const needsPrint = (url.searchParams.get("needsPrint") || "0") === "1"; // PAID only
  const q = (url.searchParams.get("q") || "").trim();
  const sortField = (url.searchParams.get("sortField") || "paid_at").toLowerCase();
  const sortDir = (url.searchParams.get("sortDir") || "desc").toLowerCase();
  const limitRaw = Number(url.searchParams.get("limit") || 200);

  if (!ALLOWED_STATUS.has(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  if (!ALLOWED_SORT_FIELD.has(sortField)) return NextResponse.json({ error: "invalid sortField" }, { status: 400 });
  if (!ALLOWED_SORT_DIR.has(sortDir)) return NextResponse.json({ error: "invalid sortDir" }, { status: 400 });

  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 200;

  let query = supabaseAdmin
    .from("print_orders")
    .select(
      "id, customer_name, customer_email, fotoshare_token, size, qty, amount, status, created_at, paid_at, midtrans_order_id"
    )
    .limit(limit);

  // Filter status
  if (needsPrint) {
    query = query.eq("status", "PAID");
  } else if (status !== "ALL") {
    query = query.eq("status", status);
  }

  // Search (simple OR)
  // Note: ilike + OR syntax di PostgREST: or=(col.ilike.*q*,col2.ilike.*q*)
  if (q) {
    const esc = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pat = `%${esc}%`;
    query = query.or(
      [
        `fotoshare_token.ilike.${pat}`,
        `customer_name.ilike.${pat}`,
        `customer_email.ilike.${pat}`,
        `midtrans_order_id.ilike.${pat}`,
      ].join(",")
    );
  }

  // Sort
  query = query.order(sortField as any, { ascending: sortDir === "asc", nullsFirst: false });

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, orders: data ?? [] });
}
