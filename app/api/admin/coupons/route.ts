import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type CouponRow = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  bogo_buy_quantity: number;
  bogo_get_quantity: number;
  expiry_date: string | null;
  max_uses_per_user: number;
  is_active: boolean;
  created_at: string;
};

export async function GET(req: NextRequest) {
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

  const { data: coupons, error } = await supabaseAdmin
    .from("coupons")
    .select("id, code, discount_type, discount_value, bogo_buy_quantity, bogo_get_quantity, expiry_date, max_uses_per_user, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const normalizedCoupons = (coupons as CouponRow[]).map((coupon) => {
    const isExpired = coupon.expiry_date && coupon.expiry_date < now;
    const isActiveStatus = coupon.is_active && !isExpired;

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      bogoBuyQuantity: coupon.bogo_buy_quantity || 1,
      bogoGetQuantity: coupon.bogo_get_quantity || 1,
      expiryDate: coupon.expiry_date,
      maxUsesPerUser: coupon.max_uses_per_user,
      isActive: isActiveStatus,
      createdAt: coupon.created_at,
      isExpired: Boolean(isExpired),
    };
  });

  return NextResponse.json({ coupons: normalizedCoupons });
}
