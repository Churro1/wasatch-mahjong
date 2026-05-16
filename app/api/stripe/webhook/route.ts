import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureGiftCardFromStripeSession, sendGiftCardDeliveryEmails } from "@/lib/giftCards";
import { sendOrderConfirmationEmails } from "@/lib/orderConfirmationEmails";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const stripeWebhookSecret = getStripeWebhookSecret();
  const supabaseAdmin = getSupabaseAdmin();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  // Idempotency guard: record the Stripe event and its processing status.
  try {
    const existing = await supabaseAdmin
      .from("webhook_events")
      .select("id, status, inserted_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing.data) {
      const existingStatus = existing.data.status;
      const insertedAt = existing.data.inserted_at ? new Date(existing.data.inserted_at).getTime() : 0;
      const isStaleProcessing =
        existingStatus === "processing" && insertedAt > 0 && Date.now() - insertedAt > 5 * 60 * 1000;

      // Already processed successfully, or the event is still actively being handled.
      if (existingStatus === "succeeded" || (existingStatus === "processing" && !isStaleProcessing)) {
        return NextResponse.json({ received: true });
      }
      // If the previous attempt failed or a processing event has gone stale, mark as processing and continue.
      await supabaseAdmin
        .from("webhook_events")
        .update({ status: "processing", error_text: null })
        .eq("stripe_event_id", event.id);
    } else {
      await supabaseAdmin.from("webhook_events").insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event,
        status: "processing",
      });
    }
  } catch (err) {
    console.error("Failed to record webhook event for idempotency", { eventId: event.id, err });
    // Do not proceed without recording—return 500 so Stripe will retry.
    return NextResponse.json({ error: "Failed to record webhook event." }, { status: 500 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      const session = event.data.object as Stripe.Checkout.Session;
      const purchaseType = session.metadata?.purchaseType;

      if (purchaseType === "gift_card") {
        const giftCard = await ensureGiftCardFromStripeSession({ supabaseAdmin, session });

        if (!giftCard) {
          console.error("checkout.session.completed gift card session missing data", {
            eventId: event.id,
            sessionId: session.id,
          });
          return NextResponse.json({ error: "Gift card purchase could not be completed." }, { status: 400 });
        }

        await sendGiftCardDeliveryEmails({
          supabaseAdmin,
          giftCard,
          senderName: session.metadata?.senderName || null,
        });

        return NextResponse.json({ received: true });
      }

      const orderId = session.client_reference_id || session.metadata?.orderId;
      const offerToken = typeof session.metadata?.offerToken === "string" ? session.metadata.offerToken : "";

      if (!orderId) {
        console.error("checkout.session.completed missing order reference", { eventId: event.id, sessionId: session.id });
        return NextResponse.json({ error: "Missing order reference." }, { status: 400 });
      }

      const { data: finalizedRows, error: finalizeError } = await supabaseAdmin.rpc("finalize_checkout_order", {
        p_order_id: orderId,
        p_checkout_session_id: session.id,
        p_payment_intent_id:
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        p_payment_status: session.payment_status || "paid",
      });

      if (finalizeError) {
        console.error("finalize_checkout_order failed", {
          eventId: event.id,
          orderId,
          sessionId: session.id,
          error: finalizeError.message,
          code: finalizeError.code,
          details: finalizeError.details,
          hint: finalizeError.hint,
        });
        // Mark webhook event as failed with details and return 500 so Stripe will retry
        await supabaseAdmin
          .from("webhook_events")
          .update({ status: "failed", error_text: finalizeError.message, processed_at: new Date().toISOString() })
          .eq("stripe_event_id", event.id);
        return NextResponse.json({ error: finalizeError.message }, { status: 500 });
      }

      const finalizedCandidate = Array.isArray(finalizedRows) ? finalizedRows[0] : finalizedRows;
      if (!finalizedCandidate) {
        console.error("finalize_checkout_order returned empty data", {
          eventId: event.id,
          orderId,
          sessionId: session.id,
          finalizedRows,
        });
        return NextResponse.json({ error: "Finalize checkout returned no order." }, { status: 500 });
      }

      const finalized = finalizedCandidate as {
        order_id: string;
        buyer_user_id: string;
        buyer_email: string | null;
        attendee_count: number;
        total_amount: number;
      };

      if (offerToken) {
        const { data: claimedOffer } = await supabaseAdmin
          .from("waitlist_offers")
          .update({
            status: "claimed",
            claimed_at: new Date().toISOString(),
            claimed_by_user_id: finalized.buyer_user_id,
            claimed_order_id: finalized.order_id,
          })
          .eq("offer_token", offerToken)
          .eq("status", "active")
          .select("entry_id")
          .maybeSingle();

        if (claimedOffer?.entry_id) {
          await supabaseAdmin
            .from("waitlist_entries")
            .update({
              status: "claimed",
              claimed_at: new Date().toISOString(),
            })
            .eq("id", claimedOffer.entry_id);
        }
      }

      const attendeeCount = finalized.attendee_count || 0;
      try {
        const { sentCount } = await sendOrderConfirmationEmails({
          supabaseAdmin,
          orderId: finalized.order_id,
          buyerEmail: finalized.buyer_email,
          attendeeCount,
          totalAmount: finalized.total_amount || 0,
        });

        if (sentCount <= 0) {
          console.error("Confirmation email skipped because no recipient emails were available", {
            eventId: event.id,
            orderId: finalized.order_id,
          });
        }

        // Mark webhook event processed successfully
        await supabaseAdmin
          .from("webhook_events")
          .update({ status: "succeeded", processed_at: new Date().toISOString() })
          .eq("stripe_event_id", event.id);
      } catch (emailError) {
        console.error("Confirmation email handling failed", {
          eventId: event.id,
          orderId: finalized.order_id,
          error: emailError,
        });
        // Mark webhook event as failed so it can be retried/inspected
        await supabaseAdmin
          .from("webhook_events")
          .update({ status: "failed", error_text: (emailError as Error).message || String(emailError), processed_at: new Date().toISOString() })
          .eq("stripe_event_id", event.id);
      }
    } catch (unhandledError) {
      console.error("Unhandled checkout.session.completed webhook failure", {
        eventId: event.id,
        error: unhandledError,
      });
      // Mark webhook event as failed with error
      try {
        await supabaseAdmin
          .from("webhook_events")
          .update({ status: "failed", error_text: (unhandledError as Error).message || String(unhandledError), processed_at: new Date().toISOString() })
          .eq("stripe_event_id", event.id);
      } catch (recErr) {
        console.error("Failed to mark webhook event failed", { eventId: event.id, recErr });
      }
      return NextResponse.json({ error: "Unhandled checkout completion failure." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}