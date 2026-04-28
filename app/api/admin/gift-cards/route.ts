import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatGiftCardCode, generateGiftCardCode, normalizeGiftCardCode, sendGiftCardDeliveryEmails } from "@/lib/giftCards";

type AdminGiftCardRow = {
  id: string;
  code: string;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  status: string;
  issued_by_user_id: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  expires_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  purchase_source: string;
  issued_at: string;
  redeemed_at: string | null;
  email_sent_at: string | null;
};

async function ensureAdminUser(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, accessToken: string | null) {
  if (!accessToken) {
    return { error: NextResponse.json({ error: "Missing access token." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminUser?.user_id) {
    return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }

  return { user };
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  const authResult = await ensureAdminUser(supabaseAdmin, accessToken);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { data, error } = await supabaseAdmin
    .from("gift_cards")
    .select(
      "id, code, original_amount, remaining_amount, currency, status, issued_by_user_id, purchaser_email, recipient_name, recipient_email, message, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, purchase_source, issued_at, redeemed_at, email_sent_at"
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    giftCards: (data || []).map((giftCard) => ({
      ...giftCard,
      displayCode: formatGiftCardCode(giftCard.code),
    })),
  });
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  const authResult = await ensureAdminUser(supabaseAdmin, accessToken);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { user } = authResult;
  const { code, amount, recipientName, recipientEmail, message, expiryDate, sendEmail: shouldSendEmail } = await req.json();
  const normalizedCode = normalizeGiftCardCode(typeof code === "string" ? code : "");
  const parsedAmount = Math.round(Number(amount));
  const trimmedRecipientName = typeof recipientName === "string" ? recipientName.trim() : "";
  const trimmedRecipientEmail = typeof recipientEmail === "string" ? recipientEmail.trim().toLowerCase() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const sendEmailNow = shouldSendEmail !== false;

  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: "Gift card amount must be greater than zero." }, { status: 400 });
  }

  let expiryDateIso: string | null = null;
  if (expiryDate && typeof expiryDate === "string") {
    const parsed = new Date(expiryDate);
    if (!Number.isNaN(parsed.getTime())) {
      expiryDateIso = parsed.toISOString();
    }
  }

  const codeToUse = normalizedCode || generateGiftCardCode();

  const { data: insertedGiftCard, error: insertError } = await supabaseAdmin
    .from("gift_cards")
    .insert({
      code: codeToUse,
      original_amount: parsedAmount,
      remaining_amount: parsedAmount,
      currency: "usd",
      status: "active",
      issued_by_user_id: user.id,
      purchaser_email: user.email || null,
      recipient_name: trimmedRecipientName || null,
      recipient_email: trimmedRecipientEmail || null,
      message: trimmedMessage || null,
      expires_at: expiryDateIso,
      purchase_source: "admin",
    })
    .select(
      "id, code, original_amount, remaining_amount, currency, status, issued_by_user_id, purchaser_email, recipient_name, recipient_email, message, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, purchase_source, issued_at, redeemed_at, email_sent_at"
    )
    .single();

  if (insertError || !insertedGiftCard) {
    return NextResponse.json({ error: insertError?.message || "Failed to create gift card." }, { status: 400 });
  }

  if (sendEmailNow && (insertedGiftCard.recipient_email || insertedGiftCard.purchaser_email)) {
    await sendGiftCardDeliveryEmails({
      supabaseAdmin,
      giftCard: insertedGiftCard as AdminGiftCardRow,
      senderName: user.user_metadata?.full_name || user.email || "Wasatch Mahjong",
    });
  }

  return NextResponse.json({
    message: "Gift card created successfully.",
    giftCard: {
      ...insertedGiftCard,
      displayCode: formatGiftCardCode(insertedGiftCard.code),
    },
  });
}