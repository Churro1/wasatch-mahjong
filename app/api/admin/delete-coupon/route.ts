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

  const { couponId } = await req.json();
  const normalizedCouponId = typeof couponId === "string" ? couponId.trim() : "";

  if (!isUuid(normalizedCouponId)) {
    return NextResponse.json({ error: "Valid coupon ID is required." }, { status: 400 });
  }

  const { data: coupon, error: couponError } = await supabaseAdmin
    .from("coupons")
    .select("id")
    .eq("id", normalizedCouponId)
    .maybeSingle();

  if (couponError) {
    return NextResponse.json({ error: couponError.message }, { status: 500 });
  }

  if (!coupon) {
    return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("coupons")
    .update({ is_active: false })
    .eq("id", normalizedCouponId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Coupon deactivated." });
}
