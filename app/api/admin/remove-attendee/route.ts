import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

function isValidRefundAmount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const stripe = getStripe();
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

  const { signupId, eventId, refundAmountCents, refundReason } = await req.json();

  if (!signupId || typeof signupId !== "string" || !signupId.trim()) {
    return NextResponse.json({ error: "Signup ID is required." }, { status: 400 });
  }

  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  const normalizedRefundAmount = Number(refundAmountCents);
  const shouldRefund = isValidRefundAmount(normalizedRefundAmount);
  const normalizedRefundReason = typeof refundReason === "string" ? refundReason.trim() : "";

  // Get the signup to verify it exists
  const { data: signup, error: signupError } = await supabaseAdmin
    .from("signups")
    .select("id, event_id, attendee_name, attendee_email, is_buyer, order_id, signup_status")
    .eq("id", signupId)
    .maybeSingle();

  if (signupError || !signup) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  if (signup.event_id !== eventId) {
    return NextResponse.json(
      { error: "Signup does not belong to this event." },
      { status: 400 }
    );
  }

  if (signup.signup_status !== "active") {
    return NextResponse.json({ error: "This attendee is no longer active." }, { status: 400 });
  }

  if (shouldRefund && signup.is_buyer) {
    return NextResponse.json(
      { error: "Custom refunds are only supported for guest attendee removals." },
      { status: 400 }
    );
  }

  const refundableOrderId: string | null = signup.order_id;
  let orderRefundAmount = 0;

  if (shouldRefund) {
    if (!refundableOrderId) {
      return NextResponse.json(
        { error: "This attendee is not tied to a paid order, so no refund can be issued." },
        { status: 400 }
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("checkout_orders")
      .select("id, status, total_amount, refund_amount, stripe_payment_intent_id")
      .eq("id", refundableOrderId)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ error: "Associated order not found." }, { status: 404 });
    }

    if (order.status !== "paid") {
      return NextResponse.json({ error: "Refunds can only be issued for paid orders." }, { status: 400 });
    }

    const alreadyRefunded = Number(order.refund_amount || 0);
    const remainingRefundable = Math.max(Number(order.total_amount || 0) - alreadyRefunded, 0);

    if (normalizedRefundAmount > remainingRefundable) {
      return NextResponse.json(
        {
          error: `The maximum refundable amount for this order is ${formatCurrency(remainingRefundable)}.`,
        },
        { status: 400 }
      );
    }

    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: "Missing Stripe payment reference for refund." }, { status: 400 });
    }

    try {
      await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: normalizedRefundAmount,
        reason: "requested_by_customer",
        metadata: {
          orderId: order.id,
          signupId: signup.id,
          cancelledBy: user.id,
          refundReason: normalizedRefundReason || "Admin attendee removal refund",
        },
      });
      orderRefundAmount = normalizedRefundAmount;
    } catch (refundError) {
      return NextResponse.json(
        { error: refundError instanceof Error ? refundError.message : "Stripe refund failed." },
        { status: 500 }
      );
    }

    const { error: orderUpdateError } = await supabaseAdmin
      .from("checkout_orders")
      .update({
        refund_amount: alreadyRefunded + orderRefundAmount,
        refund_reason: normalizedRefundReason || "Admin attendee removal refund",
      })
      .eq("id", order.id);

    if (orderUpdateError) {
      return NextResponse.json({ error: orderUpdateError.message }, { status: 500 });
    }
  }

  if (shouldRefund) {
    const nowIso = new Date().toISOString();
    const { error: signupUpdateError } = await supabaseAdmin
      .from("signups")
      .update({
        signup_status: "refunded",
        payment_status: "refunded",
        cancellation_requested_at: nowIso,
        cancelled_at: nowIso,
        refunded_at: nowIso,
        refund_amount: normalizedRefundAmount,
      })
      .eq("id", signupId);

    if (signupUpdateError) {
      return NextResponse.json({ error: signupUpdateError.message }, { status: 500 });
    }
  } else {
    // Delete the signup when no refund is needed.
    const { error: deleteError } = await supabaseAdmin.from("signups").delete().eq("id", signupId);

    if (deleteError) {
      console.error("Signup deletion error:", deleteError);
      return NextResponse.json({ error: "Failed to remove attendee." }, { status: 500 });
    }
  }

  // Increment event spots_remaining
  const { data: event } = await supabaseAdmin
    .from("events")
    .select("spots_remaining")
    .eq("id", eventId)
    .maybeSingle();

  if (event) {
    await supabaseAdmin
      .from("events")
      .update({ spots_remaining: event.spots_remaining + 1 })
      .eq("id", eventId);
  }

  return NextResponse.json({
    success: true,
    message: shouldRefund
      ? `${signup.attendee_name} has been removed from the event and ${formatCurrency(orderRefundAmount)} has been refunded to the buyer.`
      : `${signup.attendee_name} has been removed from the event.`,
  });
}
