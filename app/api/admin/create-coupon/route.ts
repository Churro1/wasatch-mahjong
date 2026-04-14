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

  const {
    code,
    discountType,
    discountValue,
    bogoBuyQuantity,
    bogoGetQuantity,
    expiryDate,
    maxUsesPerUser,
  } = await req.json();
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  const normalizedType = typeof discountType === "string" ? discountType.trim() : "";
  const parsedValue = Number(discountValue);
  const parsedBogoBuyQuantity = Number(bogoBuyQuantity) || 1;
  const parsedBogoGetQuantity = Number(bogoGetQuantity) || 1;
  const parsedMaxUses = Number(maxUsesPerUser) || 1;

  if (!normalizedCode) {
    return NextResponse.json({ error: "Coupon code is required." }, { status: 400 });
  }

  if (!["dollar", "percentage", "bogo"].includes(normalizedType)) {
    return NextResponse.json(
      { error: "Discount type must be 'dollar', 'percentage', or 'bogo'." },
      { status: 400 }
    );
  }

  if (normalizedType === "bogo") {
    if (!Number.isInteger(parsedBogoBuyQuantity) || parsedBogoBuyQuantity < 1) {
      return NextResponse.json(
        { error: "Buy quantity must be a whole number of at least 1." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(parsedBogoGetQuantity) || parsedBogoGetQuantity < 1) {
      return NextResponse.json(
        { error: "Get quantity must be a whole number of at least 1." },
        { status: 400 }
      );
    }
  } else {
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      return NextResponse.json({ error: "Discount value must be greater than 0." }, { status: 400 });
    }

    if (normalizedType === "percentage") {
      if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 100) {
        return NextResponse.json(
          { error: "Percentage discount must be a whole number from 1 to 100." },
          { status: 400 }
        );
      }
    }
  }

  if (Number.isNaN(parsedMaxUses) || parsedMaxUses < 1) {
    return NextResponse.json(
      { error: "Max uses per user must be at least 1." },
      { status: 400 }
    );
  }

  let expiryDateIso: string | null = null;
  if (expiryDate && typeof expiryDate === "string") {
    const parsed = new Date(expiryDate);
    if (!Number.isNaN(parsed.getTime())) {
      expiryDateIso = parsed.toISOString();
    }
  }

  const { data, error } = await supabaseAdmin.from("coupons").insert({
    code: normalizedCode,
    discount_type: normalizedType,
    discount_value: normalizedType === "bogo" ? 1 : parsedValue,
    bogo_buy_quantity: normalizedType === "bogo" ? parsedBogoBuyQuantity : 1,
    bogo_get_quantity: normalizedType === "bogo" ? parsedBogoGetQuantity : 1,
    expiry_date: expiryDateIso,
    max_uses_per_user: parsedMaxUses,
    created_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    message: "Coupon created successfully.",
    coupon: {
      code: normalizedCode,
      discountType: normalizedType,
      discountValue: normalizedType === "bogo" ? 1 : parsedValue,
      bogoBuyQuantity: normalizedType === "bogo" ? parsedBogoBuyQuantity : 1,
      bogoGetQuantity: normalizedType === "bogo" ? parsedBogoGetQuantity : 1,
      expiryDate: expiryDateIso,
      maxUsesPerUser: parsedMaxUses,
    },
  });
}
