import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import { ensureGiftCardFromStripeSession, sendGiftCardDeliveryEmails } from "@/lib/giftCards";
import { ensurePassFromStripeSession } from "@/lib/passes";
import { sendOrderConfirmationEmails } from "@/lib/orderConfirmationEmails";

type SummaryOrder = {
  id: string;
  buyer_user_id: string;
  status: string;
  total_amount: number;
  gift_card_amount: number;
  checkout_order_attendees:
    | Array<{
        full_name: string;
        email: string | null;
        is_buyer: boolean;
      }>
    | null;
  events:
    | {
        name: string;
        description: string | null;
        event_date: string;
      }
    | Array<{
        name: string;
        description: string | null;
        event_date: string;
      }>
    | null;
};

type GiftCardSummary = {
  id: string;
  code: string;
  original_amount: number;
  remaining_amount: number;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  email_sent_at: string | null;
};

type PassSummary = {
  id: string;
  code: string;
  pass_slug: string;
  pass_name: string;
  total_uses: number;
  remaining_uses: number;
  self_only: boolean;
  open_play_only: boolean;
};

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const stripe = getStripe();
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!sessionId || !accessToken) {
    return NextResponse.json({ error: "Missing session ID or access token." }, { status: 400 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("checkout_orders")
    .select(
      "id, buyer_user_id, status, total_amount, gift_card_amount, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, description, event_date)"
    )
    .eq("stripe_checkout_session_id", sessionId)
    .eq("buyer_user_id", user.id)
    .single();

  if (error || !data) {
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionOrderId = stripeSession.client_reference_id || stripeSession.metadata?.orderId;
    const purchaseType = stripeSession.metadata?.purchaseType;

    if (purchaseType === "pass") {
      if (stripeSession.metadata?.purchaserUserId !== user.id) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }

      const pass = await ensurePassFromStripeSession({ supabaseAdmin, session: stripeSession });
      if (!pass) {
        return NextResponse.json({ error: "Pass purchase summary not found." }, { status: 404 });
      }

      const passSummary: PassSummary = {
        id: pass.id,
        code: pass.code,
        pass_slug: pass.pass_slug,
        pass_name: pass.pass_name,
        total_uses: pass.total_uses,
        remaining_uses: pass.remaining_uses,
        self_only: pass.self_only,
        open_play_only: pass.open_play_only,
      };

      return NextResponse.json({
        type: "pass",
        id: sessionOrderId || pass.id,
        status: pass.status,
        totalAmount: Number(stripeSession.metadata?.passPrice || 10000),
        confirmationEmailSentAt: null,
        pass: passSummary,
      });
    }

    if (purchaseType !== "gift_card") {
      return NextResponse.json({ error: "Order summary not found." }, { status: 404 });
    }

    if (stripeSession.metadata?.purchaserUserId !== user.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const giftCard = await ensureGiftCardFromStripeSession({ supabaseAdmin, session: stripeSession });
    if (!giftCard) {
      return NextResponse.json({ error: "Gift card purchase summary not found." }, { status: 404 });
    }

    const sentCount = await sendGiftCardDeliveryEmails({
      supabaseAdmin,
      giftCard,
      senderName: stripeSession.metadata?.senderName || null,
    });
    const confirmationEmailSentAt = sentCount > 0 ? new Date().toISOString() : giftCard.email_sent_at || null;

    const giftCardSummary: GiftCardSummary = {
      id: giftCard.id,
      code: giftCard.code,
      original_amount: giftCard.original_amount,
      remaining_amount: giftCard.remaining_amount,
      recipient_name: giftCard.recipient_name,
      recipient_email: giftCard.recipient_email,
      message: giftCard.message,
      email_sent_at: confirmationEmailSentAt,
    };

    return NextResponse.json({
      type: "gift_card",
      id: sessionOrderId || giftCard.id,
      status: giftCard.status,
      totalAmount: giftCard.original_amount,
      confirmationEmailSentAt,
      giftCard: giftCardSummary,
    });
  }

  let order = data as SummaryOrder & { confirmation_email_sent_at?: string | null };

  // Recovery path: if webhook delivery is delayed/missed, finalize from success page request
  // using trusted Stripe session state. finalize_checkout_order is idempotent.
  if (order.status !== "paid") {
    try {
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      const sessionOrderId = stripeSession.client_reference_id || stripeSession.metadata?.orderId;
      const sessionPaid = stripeSession.payment_status === "paid";

      if (sessionPaid && sessionOrderId === order.id) {
        const couponCode = typeof stripeSession.metadata?.couponCode === "string" ? stripeSession.metadata.couponCode : "";
        const couponDiscountAmount = Number(stripeSession.metadata?.discountAmount || 0);

        const { error: finalizeError } = await supabaseAdmin.rpc("finalize_checkout_order", {
          p_checkout_session_id: stripeSession.id,
          p_coupon_code: couponCode || null,
          p_coupon_discount_amount: couponDiscountAmount > 0 ? couponDiscountAmount : null,
          p_order_id: order.id,
          p_payment_intent_id:
            typeof stripeSession.payment_intent === "string"
              ? stripeSession.payment_intent
              : stripeSession.payment_intent?.id || null,
          p_payment_status: stripeSession.payment_status || "paid",
        });

        if (finalizeError) {
          console.error("session-summary finalize fallback failed", {
            orderId: order.id,
            sessionId,
            error: finalizeError.message,
          });
        } else {
          order = {
            ...order,
            status: "paid",
          };

          const { data: refreshedOrder, error: refreshError } = await supabaseAdmin
            .from("checkout_orders")
            .select(
              "id, buyer_user_id, status, total_amount, gift_card_amount, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, description, event_date)"
            )
            .eq("id", order.id)
            .eq("buyer_user_id", user.id)
            .single();

          if (!refreshError && refreshedOrder) {
            order = refreshedOrder as SummaryOrder & { confirmation_email_sent_at?: string | null };
          }
        }
      }
    } catch (fallbackError) {
      console.error("session-summary fallback verification failed", {
        orderId: order.id,
        sessionId,
        error: fallbackError,
      });
    }
  }

  const event = Array.isArray(order.events) ? order.events[0] : order.events;

  if (order.status === "paid" && !order.confirmation_email_sent_at) {
    try {
      const { confirmationEmailSentAt } = await sendOrderConfirmationEmails({
        supabaseAdmin,
        orderId: order.id,
        buyerEmail: null,
        attendeeCount: order.checkout_order_attendees?.length || 0,
        totalAmount: order.total_amount,
      });

      if (confirmationEmailSentAt) {
        order.confirmation_email_sent_at = confirmationEmailSentAt;
      }
    } catch (emailFallbackError) {
      console.error("session-summary confirmation email retry failed", {
        orderId: order.id,
        sessionId,
        error: emailFallbackError,
      });
    }
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    totalAmount: order.total_amount,
    giftCardAmount: order.gift_card_amount || 0,
    confirmationEmailSentAt: order.confirmation_email_sent_at || null,
    attendees: order.checkout_order_attendees || [],
    event,
    type: "event",
  });
}