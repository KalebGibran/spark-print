import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  // Only allow PAID -> PRINTED
  const { data, error } = await supabaseAdmin
    .from("print_orders")
    .update({ status: "PRINTED" })
    .eq("id", id)
    .eq("status", "PAID")
    .select("id,status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_paid_or_already_printed" }, { status: 409 });

  return NextResponse.json({ ok: true, order: data });
}
