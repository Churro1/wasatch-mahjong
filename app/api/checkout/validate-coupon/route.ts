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
  is_active: boolean;
};

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const { couponCode, eventPrice } = await req.json();

  const normalizedCode = typeof couponCode === "string" ? couponCode.trim().toUpperCase() : "";
  const parsedPrice = Number(eventPrice) || 0;

  if (!normalizedCode) {
    return NextResponse.json({ error: "Coupon code is required." }, { status: 400 });
  }

  if (parsedPrice < 0) {
    return NextResponse.json({ error: "Invalid event price." }, { status: 400 });
  }

  const { data: coupon, error: couponError } = await supabaseAdmin
    .from("coupons")
    .select("id, code, discount_type, discount_value, bogo_buy_quantity, bogo_get_quantity, expiry_date, is_active")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (couponError) {
    return NextResponse.json({ error: "Failed to validate coupon." }, { status: 500 });
  }

  if (!coupon) {
    return NextResponse.json({ error: "Coupon code not found." }, { status: 404 });
  }

  if (!coupon.is_active) {
    return NextResponse.json({ error: "This coupon is no longer active." }, { status: 400 });
  }

  const now = new Date().toISOString();
  if (coupon.expiry_date && coupon.expiry_date < now) {
    return NextResponse.json({ error: "This coupon has expired." }, { status: 400 });
  }

  let discountAmount = 0;

  if (coupon.discount_type === "dollar") {
    discountAmount = Math.min(coupon.discount_value, parsedPrice);
  } else if (coupon.discount_type === "percentage") {
    discountAmount = (coupon.discount_value / 100) * parsedPrice;
  } else if (coupon.discount_type === "bogo") {
    const buyQty = coupon.bogo_buy_quantity || 1;
    const getQty = coupon.bogo_get_quantity || 1;
    const totalQty = buyQty + getQty;
    discountAmount = totalQty > 0 ? parsedPrice * (getQty / totalQty) : 0;
  }

  return NextResponse.json({
    coupon: {
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      bogoBuyQuantity: coupon.bogo_buy_quantity || 1,
      bogoGetQuantity: coupon.bogo_get_quantity || 1,
      discountAmount: Number(discountAmount.toFixed(2)),
    },
  });
}
