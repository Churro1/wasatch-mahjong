import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

type SummaryOrder = {
  id: string;
  buyer_user_id: string;
  status: string;
  total_amount: number;
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
      "id, buyer_user_id, status, total_amount, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, description, event_date)"
    )
    .eq("stripe_checkout_session_id", sessionId)
    .eq("buyer_user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Order summary not found." }, { status: 404 });
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
        const { error: finalizeError } = await supabaseAdmin.rpc("finalize_checkout_order", {
          p_order_id: order.id,
          p_checkout_session_id: stripeSession.id,
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
          const { data: refreshedOrder, error: refreshError } = await supabaseAdmin
            .from("checkout_orders")
            .select(
              "id, buyer_user_id, status, total_amount, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, description, event_date)"
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

  return NextResponse.json({
    id: order.id,
    status: order.status,
    totalAmount: order.total_amount,
    confirmationEmailSentAt: order.confirmation_email_sent_at || null,
    attendees: order.checkout_order_attendees || [],
    event,
  });
}