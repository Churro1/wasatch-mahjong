import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeGiftCardCode } from "@/lib/giftCards";

type GiftCardRow = {
  id: string;
  code: string;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  status: string;
  expires_at: string | null;
};

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const { giftCardCode, orderTotal } = await req.json();

  const normalizedCode = normalizeGiftCardCode(typeof giftCardCode === "string" ? giftCardCode : "");
  const parsedOrderTotal = Number(orderTotal) || 0;

  if (!normalizedCode) {
    return NextResponse.json({ error: "Gift card code is required." }, { status: 400 });
  }

  if (parsedOrderTotal <= 0) {
    return NextResponse.json({ error: "No payment remains to cover with a gift card." }, { status: 400 });
  }

  const { data: giftCard, error } = await supabaseAdmin
    .from("gift_cards")
    .select("id, code, original_amount, remaining_amount, currency, status, expires_at")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to validate gift card." }, { status: 500 });
  }

  if (!giftCard) {
    return NextResponse.json({ error: "Gift card code not found." }, { status: 404 });
  }

  const card = giftCard as GiftCardRow;

  const { data: reservationRows, error: reservationError } = await supabaseAdmin
    .from("gift_card_redemptions")
    .select("amount, reservation_expires_at")
    .eq("gift_card_id", card.id)
    .is("reversed_at", null)
    .is("committed_at", null);

  if (reservationError) {
    return NextResponse.json({ error: "Failed to validate gift card." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const reservedAmount = (reservationRows || []).reduce((total, row) => {
    if (row.reservation_expires_at && row.reservation_expires_at <= nowIso) {
      return total;
    }

    return total + Number(row.amount || 0);
  }, 0);

  if (card.status !== "active") {
    return NextResponse.json({ error: "This gift card is no longer active." }, { status: 400 });
  }

  if (card.expires_at && card.expires_at < new Date().toISOString()) {
    return NextResponse.json({ error: "This gift card has expired." }, { status: 400 });
  }

  const availableAmount = Math.max(0, card.remaining_amount - reservedAmount);
  const appliedAmount = Math.min(availableAmount, parsedOrderTotal);

  if (appliedAmount <= 0) {
    return NextResponse.json({ error: "This gift card has no remaining balance." }, { status: 400 });
  }

  return NextResponse.json({
    giftCard: {
      code: card.code,
      remainingAmount: card.remaining_amount,
      availableAmount,
      appliedAmount,
      currency: card.currency,
    },
  });
}