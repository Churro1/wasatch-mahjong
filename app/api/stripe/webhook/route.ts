import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/sendEmail";
import { ensureGiftCardFromStripeSession, sendGiftCardDeliveryEmails } from "@/lib/giftCards";

type OrderDetails = {
  id: string;
  confirmation_email_sent_at: string | null;
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
        event_date: string;
      }
    | Array<{
        name: string;
        event_date: string;
      }>
    | null;
};

function buildBuyerConfirmationEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  attendeeCount: number;
  totalAmount: number;
}) {
  return `
    <h1>Wasatch Mahjong Confirmation</h1>
    <p>Hi ${params.attendeeName},</p>
    <p>Your registration for <strong>${params.eventName}</strong> is confirmed.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    <p><strong>Attendees on Order:</strong> ${params.attendeeCount}</p>
    <p><strong>Total Paid:</strong> $${(params.totalAmount / 100).toFixed(2)}</p>
    <h2>Day Of</h2>
    <ul>
      <li>Show up 15 minutes early to get signed in and settled.</li>
      <li>No need to bring tiles.</li>
      <li>Bring a card if you want.</li>
    </ul>
    <h2>Cancellation Policy</h2>
    <p>Cancellations require at least 24 hours notice and include a $10 cancellation fee.</p>
  `;
}

function buildGuestConfirmationEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  buyerName: string;
}) {
  return `
    <h1>Wasatch Mahjong Confirmation</h1>
    <p>Hi ${params.attendeeName},</p>
    <p><strong>${params.buyerName}</strong> has registered you for <strong>${params.eventName}</strong>.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    <h2>Day Of</h2>
    <ul>
      <li>Show up 15 minutes early to get signed in and settled.</li>
      <li>No need to bring tiles.</li>
      <li>Bring a card if you want.</li>
    </ul>
    <h2>Cancellation Policy</h2>
    <p>Cancellations require at least 24 hours notice and include a $10 cancellation fee.</p>
  `;
}

type EmailRecipient = {
  email: string;
  name: string;
};

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

      const { data: orderDetails, error: orderDetailsError } = await supabaseAdmin
        .from("checkout_orders")
        .select("id, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, event_date)")
        .eq("id", finalized.order_id)
        .single();

      if (orderDetailsError) {
        console.error("Failed to load order details after finalize", {
          eventId: event.id,
          orderId,
          sessionId: session.id,
          error: orderDetailsError.message,
        });
      }

      const order = orderDetails as OrderDetails | null;
      const eventSummary = order?.events ? (Array.isArray(order.events) ? order.events[0] : order.events) : null;
      const attendeeCount = finalized.attendee_count || 0;
      const uniqueEmails = new Set<string>();
      const recipients: EmailRecipient[] = [];

      if (order?.confirmation_email_sent_at) {
        return NextResponse.json({ received: true });
      }

      try {
        const buyerAttendee = (order?.checkout_order_attendees || []).find((attendee) => attendee.is_buyer) || null;
        const buyerEmailFromOrder = buyerAttendee?.email?.trim().toLowerCase() || "";
        const buyerEmailFromFinalize =
          typeof finalized.buyer_email === "string" ? finalized.buyer_email.trim().toLowerCase() : "";
        const buyerEmail = buyerEmailFromFinalize || buyerEmailFromOrder;
        const buyerName = buyerAttendee?.full_name || "there";

        if (buyerEmail) {
          uniqueEmails.add(buyerEmail);
          recipients.push({ email: buyerEmail, name: buyerName });
        }

        for (const attendee of order?.checkout_order_attendees || []) {
          if (!attendee.email) {
            continue;
          }
          const email = attendee.email.trim().toLowerCase();
          if (!email || uniqueEmails.has(email)) {
            continue;
          }
          uniqueEmails.add(email);
          recipients.push({ email, name: attendee.full_name });
        }

        let sentCount = 0;
        for (const recipient of recipients) {
          try {
            const isBuyer = recipient.email === buyerEmail;
            const emailHtml = isBuyer
              ? buildBuyerConfirmationEmailHtml({
                  attendeeName: recipient.name,
                  eventName: eventSummary?.name || "Wasatch Mahjong Event",
                  eventDate: eventSummary?.event_date || "",
                  attendeeCount,
                  totalAmount: finalized.total_amount || 0,
                })
              : buildGuestConfirmationEmailHtml({
                  attendeeName: recipient.name,
                  eventName: eventSummary?.name || "Wasatch Mahjong Event",
                  eventDate: eventSummary?.event_date || "",
                  buyerName: buyerName,
                });

            await sendEmail({
              to: recipient.email,
              subject: `Wasatch Mahjong Confirmation: ${eventSummary?.name || "Your Event"}`,
              html: emailHtml,
            });
            sentCount += 1;
          } catch (recipientEmailError) {
            console.error("Failed to send confirmation email to recipient", {
              eventId: event.id,
              orderId: finalized.order_id,
              recipientEmail: recipient.email,
              error: recipientEmailError,
            });
          }
        }

        if (sentCount > 0) {
          await supabaseAdmin
            .from("checkout_orders")
            .update({ confirmation_email_sent_at: new Date().toISOString() })
            .eq("id", finalized.order_id);
        } else {
          console.error("Confirmation email skipped because no recipient emails were available", {
            eventId: event.id,
            orderId: finalized.order_id,
          });
        }
      } catch (emailError) {
        console.error("Confirmation email handling failed", {
          eventId: event.id,
          orderId: finalized.order_id,
          error: emailError,
        });
      }
    } catch (unhandledError) {
      console.error("Unhandled checkout.session.completed webhook failure", {
        eventId: event.id,
        error: unhandledError,
      });
      return NextResponse.json({ error: "Unhandled checkout completion failure." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}