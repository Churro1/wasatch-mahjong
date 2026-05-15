import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminUser?.user_id) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json();
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const checkoutSessionId = typeof body.checkoutSessionId === "string" ? body.checkoutSessionId.trim() : null;
  const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : null;
  const paymentStatus = typeof body.paymentStatus === "string" ? body.paymentStatus : "paid";

  if (!isUuid(orderId)) {
    return NextResponse.json({ error: "Valid orderId (UUID) is required." }, { status: 400 });
  }

  try {
    const { data: finalizedRows, error: finalizeError } = await supabaseAdmin.rpc("finalize_checkout_order", {
      p_order_id: orderId,
      p_checkout_session_id: checkoutSessionId,
      p_payment_intent_id: paymentIntentId,
      p_payment_status: paymentStatus,
    });

    if (finalizeError) {
      return NextResponse.json({ error: finalizeError.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Order finalized.", result: finalizedRows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
