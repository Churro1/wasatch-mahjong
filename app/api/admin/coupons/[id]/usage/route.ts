import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin();
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const params = await context.params;
  const couponId = params.id || "";

  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  if (!isUuid(couponId)) {
    return NextResponse.json({ error: "Invalid coupon ID." }, { status: 400 });
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

  const { data: coupon, error: couponError } = await supabaseAdmin
    .from("coupons")
    .select("id, code, discount_type, discount_value")
    .eq("id", couponId)
    .maybeSingle();

  if (couponError) {
    return NextResponse.json({ error: couponError.message }, { status: 500 });
  }

  if (!coupon) {
    return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  }

  const { data: uses, error: usesError } = await supabaseAdmin
    .from("coupon_uses")
    .select(
      "id, user_id, used_at, discount_amount_cents, order_id"
    )
    .eq("coupon_id", couponId)
    .order("used_at", { ascending: false });

  if (usesError) {
    return NextResponse.json({ error: usesError.message }, { status: 500 });
  }

  const usageByUser = new Map<
    string,
    Array<{
      usedAt: string;
      discountAmount: number;
      orderId: string | null;
    }>
  >();

  for (const use of uses || []) {
    const userId = use.user_id;
    if (!usageByUser.has(userId)) {
      usageByUser.set(userId, []);
    }
    usageByUser.get(userId)!.push({
      usedAt: use.used_at,
      discountAmount: use.discount_amount_cents / 100,
      orderId: use.order_id,
    });
  }

  const usageList = Array.from(usageByUser.entries()).map(([userId, uses]) => ({
    userId,
    usageCount: uses.length,
    uses,
  }));

  return NextResponse.json({
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
    },
    usage: usageList,
    totalUses: uses?.length || 0,
  });
}
