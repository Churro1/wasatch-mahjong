import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/sendEmail";

const CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;

type CancellationEvent = {
  id: string;
  name: string;
  event_date: string;
  capacity: number;
  spots_remaining: number | null;
};

type CancellationAttendee = {
  full_name: string;
  email: string | null;
  is_buyer: boolean;
};

type CancellationSignup = {
  id: string;
  signup_status: string;
};

type CancellationOrder = {
  id: string;
  buyer_user_id: string;
  status: string;
  total_amount: number;
  refund_amount: number | null;
  cancellation_fee_amount: number;
  stripe_payment_intent_id: string | null;
  events: CancellationEvent | CancellationEvent[] | null;
  checkout_order_attendees: CancellationAttendee[] | null;
  signups: CancellationSignup[] | null;
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildCancellationEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  refundAmount: number;
}) {
  const refundLine =
    params.refundAmount > 0
      ? `<p><strong>Refund Issued:</strong> ${formatCurrency(params.refundAmount)}</p>`
      : "<p><strong>Refund Issued:</strong> No refund was issued for this cancellation.</p>";

  return `
    <h1>Wasatch Mahjong Cancellation</h1>
    <p>Hi ${params.attendeeName},</p>
    <p>Your booking for <strong>${params.eventName}</strong> has been cancelled.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    ${refundLine}
    <p>If you have any questions, reply to this email or contact Wasatch Mahjong from the website.</p>
  `;
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

  const { orderId, reason, adminRefundOverride } = await req.json();
  const cancellationReason = typeof reason === "string" ? reason.trim() : "";
  const shouldAdminOverrideRefund = adminRefundOverride === true;

  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const requesterIsAdmin = Boolean(adminUser?.user_id);

  let orderQuery = supabaseAdmin
    .from("checkout_orders")
    .select(
      "id, buyer_user_id, status, total_amount, refund_amount, cancellation_fee_amount, stripe_payment_intent_id, events(id, name, event_date, capacity, spots_remaining), checkout_order_attendees(full_name, email, is_buyer), signups(id, signup_status)"
    )
    .eq("id", orderId);

  if (!requesterIsAdmin) {
    orderQuery = orderQuery.eq("buyer_user_id", user.id);
  }

  const { data, error } = await orderQuery.single();

  if (error || !data) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const order = data as CancellationOrder;
  const event = Array.isArray(order.events) ? order.events[0] : order.events;
  const attendees = order.checkout_order_attendees || [];
  const activeSignupCount = (order.signups || []).filter((signup) => signup.signup_status === "active").length;

  if (!event) {
    return NextResponse.json({ error: "Event not found for order." }, { status: 400 });
  }

  if (order.status !== "paid") {
    return NextResponse.json({ error: "Only paid orders can be cancelled." }, { status: 400 });
  }

  if (activeSignupCount <= 0) {
    return NextResponse.json({ error: "This order is already cancelled." }, { status: 400 });
  }

  const eventDate = new Date(event.event_date);
  const refundEligible = eventDate.getTime() - Date.now() >= CANCELLATION_NOTICE_MS;
  const issueRefund = refundEligible || (requesterIsAdmin && shouldAdminOverrideRefund);

  if (!requesterIsAdmin && !refundEligible) {
    return NextResponse.json(
      { error: "Online cancellations close within 24 hours of the event. Please contact Wasatch Mahjong for help." },
      { status: 400 }
    );
  }

  let refundAmount = Math.max(order.total_amount - order.cancellation_fee_amount, 0);
  if (!issueRefund) {
    refundAmount = 0;
  }

  if (refundAmount > 0) {
    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: "Missing Stripe payment reference for refund." }, { status: 400 });
    }

    try {
      await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: refundAmount,
        reason: "requested_by_customer",
        metadata: {
          orderId: order.id,
          cancelledBy: user.id,
          adminRefundOverride: shouldAdminOverrideRefund ? "true" : "false",
        },
      });
    } catch (refundError) {
      return NextResponse.json(
        { error: refundError instanceof Error ? refundError.message : "Stripe refund failed." },
        { status: 500 }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const nextOrderStatus = refundAmount > 0 ? "refunded" : "cancelled";
  const nextSignupStatus = refundAmount > 0 ? "refunded" : "cancelled";
  const nextPaymentStatus = refundAmount > 0 ? "refunded" : "cancelled";
  const nextSpotsRemaining = Math.min(event.capacity, Number(event.spots_remaining ?? 0) + activeSignupCount);

  const { error: orderUpdateError } = await supabaseAdmin
    .from("checkout_orders")
    .update({
      status: nextOrderStatus,
      refund_amount: refundAmount,
      stripe_payment_status: refundAmount > 0 ? "refunded" : "cancelled",
      cancellation_requested_at: nowIso,
      cancelled_at: nowIso,
      refunded_at: refundAmount > 0 ? nowIso : null,
      cancellation_reason: cancellationReason || null,
      refund_reason: refundAmount > 0 ? cancellationReason || "Customer cancellation" : null,
      cancelled_by: user.id,
      updated_at: nowIso,
    })
    .eq("id", order.id);

  if (orderUpdateError) {
    return NextResponse.json({ error: orderUpdateError.message }, { status: 500 });
  }

  const { error: signupsUpdateError } = await supabaseAdmin
    .from("signups")
    .update({
      signup_status: nextSignupStatus,
      payment_status: nextPaymentStatus,
      cancellation_requested_at: nowIso,
      cancelled_at: nowIso,
      refunded_at: refundAmount > 0 ? nowIso : null,
      refund_amount: refundAmount > 0 ? refundAmount : 0,
    })
    .eq("order_id", order.id)
    .eq("signup_status", "active");

  if (signupsUpdateError) {
    return NextResponse.json({ error: signupsUpdateError.message }, { status: 500 });
  }

  const { error: eventUpdateError } = await supabaseAdmin
    .from("events")
    .update({ spots_remaining: nextSpotsRemaining })
    .eq("id", event.id);

  if (eventUpdateError) {
    return NextResponse.json({ error: eventUpdateError.message }, { status: 500 });
  }

  const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(order.buyer_user_id);
  const recipientEmails = new Set<string>();

  for (const attendee of attendees) {
    const email = attendee.email?.trim().toLowerCase();
    if (email) {
      recipientEmails.add(email);
    }
  }

  const buyerEmail = buyerUser.user?.email?.trim().toLowerCase();
  if (buyerEmail) {
    recipientEmails.add(buyerEmail);
  }

  for (const email of recipientEmails) {
    const attendeeName = attendees.find((attendee) => attendee.email?.trim().toLowerCase() === email)?.full_name || "there";

    try {
      await sendEmail({
        to: email,
        subject: `Wasatch Mahjong Cancellation: ${event.name}`,
        html: buildCancellationEmailHtml({
          attendeeName,
          eventName: event.name,
          eventDate: event.event_date,
          refundAmount,
        }),
      });
    } catch (emailError) {
      console.error("Failed to send cancellation email", emailError);
    }
  }

  const message =
    refundAmount > 0
      ? `Order cancelled. Refund of ${formatCurrency(refundAmount)} has been initiated after the ${formatCurrency(order.cancellation_fee_amount)} cancellation fee.`
      : refundEligible
        ? "Order cancelled. No refund was due after fees."
        : requesterIsAdmin
          ? "Order cancelled without refund."
          : "Order cancelled. No refund was issued because the event is within 24 hours.";

  return NextResponse.json({
    status: nextOrderStatus,
    refundAmount,
    message,
  });
}