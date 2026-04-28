import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSiteOrigin } from "@/lib/siteUrl";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const stripe = getStripe();
  const siteOrigin = getSiteOrigin(req);
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

  const { amount, recipientName, recipientEmail, message } = await req.json();
  const parsedAmount = Math.round(Number(amount));
  const trimmedRecipientName = typeof recipientName === "string" ? recipientName.trim() : "";
  const trimmedRecipientEmail = typeof recipientEmail === "string" ? recipientEmail.trim() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: "Gift card amount must be greater than zero." }, { status: 400 });
  }

  const purchaserEmail = user.email || "";
  const purchaserName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : purchaserEmail.split("@")[0] || "Wasatch Mahjong Guest";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${siteOrigin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin}/gift-cards`,
      customer_email: purchaserEmail || undefined,
      client_reference_id: user.id,
      metadata: {
        purchaseType: "gift_card",
        giftCardAmount: String(parsedAmount),
        recipientName: trimmedRecipientName,
        recipientEmail: trimmedRecipientEmail,
        giftCardMessage: trimmedMessage,
        purchaserUserId: user.id,
        purchaserEmail,
        senderName: purchaserName,
        currency: "usd",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: parsedAmount,
            product_data: {
              name: "Wasatch Mahjong Gift Card",
              description: trimmedRecipientName
                ? `Gift card for ${trimmedRecipientName}`
                : "Wasatch Mahjong gift card",
            },
          },
        },
      ],
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create gift card checkout session." },
      { status: 500 }
    );
  }
}