import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import { getSiteOrigin } from "@/lib/siteUrl";
import { dispatchWaitlistOffersForEvent } from "@/lib/waitlist";
import { sendEmail } from "@/lib/sendEmail";
import { normalizeGiftCardCode } from "@/lib/giftCards";

type OrderRow = {
  id: string;
  buyer_user_id: string;
  event_id: string;
  status: string;
  subtotal_amount: number;
  total_amount: number;
  currency: string;
  checkout_order_attendees:
    | Array<{
        id: string;
        full_name: string;
        email: string | null;
        phone?: string | null;
        is_buyer: boolean;
      }>
    | null;
  events:
    | {
        id: string;
        name: string;
        description: string | null;
        event_date: string;
        price: number;
        spots_remaining: number | null;
        stripe_product_id: string | null;
        stripe_price_id: string | null;
        stripe_price_unit_amount: number | null;
        stripe_price_currency: string | null;
      }
    | Array<{
        id: string;
        name: string;
        description: string | null;
        event_date: string;
        price: number;
        spots_remaining: number | null;
        stripe_product_id: string | null;
        stripe_price_id: string | null;
        stripe_price_unit_amount: number | null;
        stripe_price_currency: string | null;
      }>
    | null;
};

type OrderEvent = {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  price: number;
  spots_remaining: number | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_price_unit_amount: number | null;
  stripe_price_currency: string | null;
};

type ActiveWaitlistOffer = {
  id: string;
  offer_token: string;
  expires_at: string;
  entry_id: string;
  waitlist_entries:
    | {
        id: string;
        email: string;
      }
    | Array<{
        id: string;
        email: string;
      }>
    | null;
};

type CouponRow = {
  id: string;
  code: string;
  discount_type: "dollar" | "percentage" | "bogo";
  discount_value: number;
  bogo_buy_quantity: number;
  bogo_get_quantity: number;
  expiry_date: string | null;
  is_active: boolean;
};

type EmailRecipient = {
  email: string;
  name: string;
};

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

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

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

async function sendOrderConfirmationEmails(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  orderId: string;
  buyerEmail: string | null;
  attendeeCount: number;
  totalAmount: number;
}) {
  const { supabaseAdmin, orderId, buyerEmail, attendeeCount, totalAmount } = params;

  const { data: orderDetails, error: orderDetailsError } = await supabaseAdmin
    .from("checkout_orders")
    .select("id, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, event_date)")
    .eq("id", orderId)
    .single();

  if (orderDetailsError || !orderDetails) {
    console.error("Failed to load order details for confirmation email", {
      orderId,
      error: orderDetailsError?.message,
    });
    return;
  }

  const order = orderDetails as OrderDetails;
  if (order.confirmation_email_sent_at) {
    return;
  }

  const eventSummary = order.events ? (Array.isArray(order.events) ? order.events[0] : order.events) : null;
  const uniqueEmails = new Set<string>();
  const recipients: EmailRecipient[] = [];
  const buyerAttendee = (order.checkout_order_attendees || []).find((attendee) => attendee.is_buyer) || null;
  const buyerEmailFromOrder = buyerAttendee?.email?.trim().toLowerCase() || "";
  const buyerEmailFromFinalize = typeof buyerEmail === "string" ? buyerEmail.trim().toLowerCase() : "";
  const normalizedBuyerEmail = buyerEmailFromFinalize || buyerEmailFromOrder;
  const buyerName = buyerAttendee?.full_name || "there";

  if (normalizedBuyerEmail) {
    uniqueEmails.add(normalizedBuyerEmail);
    recipients.push({ email: normalizedBuyerEmail, name: buyerName });
  }

  for (const attendee of order.checkout_order_attendees || []) {
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
      const isBuyer = recipient.email === normalizedBuyerEmail;
      const emailHtml = isBuyer
        ? buildBuyerConfirmationEmailHtml({
            attendeeName: recipient.name,
            eventName: eventSummary?.name || "Wasatch Mahjong Event",
            eventDate: eventSummary?.event_date || "",
            attendeeCount,
            totalAmount,
          })
        : buildGuestConfirmationEmailHtml({
            attendeeName: recipient.name,
            eventName: eventSummary?.name || "Wasatch Mahjong Event",
            eventDate: eventSummary?.event_date || "",
            buyerName,
          });

      await sendEmail({
        to: recipient.email,
        subject: `Wasatch Mahjong Confirmation: ${eventSummary?.name || "Your Event"}`,
        html: emailHtml,
      });
      sentCount += 1;
    } catch (recipientEmailError) {
      console.error("Failed to send confirmation email to recipient", {
        orderId,
        recipientEmail: recipient.email,
        error: recipientEmailError,
      });
    }
  }

  if (sentCount > 0) {
    await supabaseAdmin
      .from("checkout_orders")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);
  }
}

async function ensureEventStripePrice(params: {
  stripe: Stripe;
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  event: OrderEvent;
  currency: string;
  unitAmount: number;
}) {
  const { stripe, supabaseAdmin, event, currency, unitAmount } = params;
  const normalizedCurrency = currency.toLowerCase();
  const storedCurrency = event.stripe_price_currency?.toLowerCase() || null;

  const hasReusablePrice =
    Boolean(event.stripe_price_id) &&
    event.stripe_price_unit_amount === unitAmount &&
    storedCurrency === normalizedCurrency;

  if (hasReusablePrice && event.stripe_price_id) {
    return event.stripe_price_id;
  }

  if (!event.stripe_product_id) {
    const product = await stripe.products.create({
      name: event.name,
      description: event.description || undefined,
      default_price_data: {
        currency: normalizedCurrency,
        unit_amount: unitAmount,
      },
    });

    const defaultPriceId =
      typeof product.default_price === "string" ? product.default_price : product.default_price?.id;

    if (!defaultPriceId) {
      throw new Error("Stripe product was created without a default price.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("events")
      .update({
        stripe_product_id: product.id,
        stripe_price_id: defaultPriceId,
        stripe_price_unit_amount: unitAmount,
        stripe_price_currency: normalizedCurrency,
      })
      .eq("id", event.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return defaultPriceId;
  }

  const price = await stripe.prices.create({
    product: event.stripe_product_id,
    currency: normalizedCurrency,
    unit_amount: unitAmount,
  });

  const { error: updateError } = await supabaseAdmin
    .from("events")
    .update({
      stripe_price_id: price.id,
      stripe_price_unit_amount: unitAmount,
      stripe_price_currency: normalizedCurrency,
    })
    .eq("id", event.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return price.id;
}

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

  const { orderId, offerToken, couponCode, giftCardCode } = await req.json();
  const normalizedOfferToken = typeof offerToken === "string" ? offerToken : "";
  const normalizedCouponCode = typeof couponCode === "string" ? couponCode.trim().toUpperCase() : "";
  const normalizedGiftCardCode = normalizeGiftCardCode(typeof giftCardCode === "string" ? giftCardCode : "");
  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("checkout_orders")
    .select(
      "id, buyer_user_id, event_id, status, subtotal_amount, total_amount, currency, checkout_order_attendees(id, full_name, email, phone, is_buyer), events(id, name, description, event_date, price, spots_remaining, stripe_product_id, stripe_price_id, stripe_price_unit_amount, stripe_price_currency)"
    )
    .eq("id", orderId)
    .eq("buyer_user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Draft order not found." }, { status: 404 });
  }

  const order = data as OrderRow;
  const event = Array.isArray(order.events) ? order.events[0] : order.events;
  const attendees = order.checkout_order_attendees || [];

  if (!event) {
    return NextResponse.json({ error: "Event not found for order." }, { status: 400 });
  }

  if (order.status !== "draft" && order.status !== "pending_payment") {
    return NextResponse.json({ error: "This order can no longer be checked out." }, { status: 400 });
  }

  if (attendees.length === 0) {
    return NextResponse.json({ error: "Add at least one attendee before checkout." }, { status: 400 });
  }

  if (attendees.some((attendee) => attendee.full_name.trim().length === 0)) {
    return NextResponse.json({ error: "Each attendee must have a name before checkout." }, { status: 400 });
  }

  if (!attendees.some((attendee) => attendee.is_buyer)) {
    return NextResponse.json({ error: "The buyer must be included as an attendee." }, { status: 400 });
  }

  const userEmail = normalizeEmail(user.email);
  const nowIso = new Date().toISOString();

    // Check if buyer user has already signed up for this event
    const { data: existingSignups, error: checkSignupError } = await supabaseAdmin
      .from("signups")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_id", order.event_id)
      .eq("signup_status", "active")
      .limit(1);

    if (checkSignupError) {
      return NextResponse.json({ error: checkSignupError.message }, { status: 500 });
    }

    if (existingSignups && existingSignups.length > 0) {
      return NextResponse.json(
        { error: "You are already registered for this event. Check your dashboard if you need to make changes." },
        { status: 409 }
      );
    }

  try {
    await dispatchWaitlistOffersForEvent({
      supabaseAdmin,
      event: {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        spots_remaining: event.spots_remaining,
      },
      origin: siteOrigin,
    });
  } catch (waitlistDispatchError) {
    return NextResponse.json(
      {
        error:
          waitlistDispatchError instanceof Error
            ? waitlistDispatchError.message
            : "Failed to process waitlist offers.",
      },
      { status: 500 }
    );
  }

  const { data: activeOffersData, error: activeOffersError } = await supabaseAdmin
    .from("waitlist_offers")
    .select("id, offer_token, expires_at, entry_id, waitlist_entries(id, email)")
    .eq("event_id", order.event_id)
    .eq("status", "active")
    .gt("expires_at", nowIso);

  if (activeOffersError) {
    return NextResponse.json({ error: activeOffersError.message }, { status: 500 });
  }

  const activeOffers = (activeOffersData || []) as ActiveWaitlistOffer[];
  const matchingOffer = activeOffers.find((offer) => offer.offer_token === normalizedOfferToken);

  if (activeOffers.length > 0) {
    if (!normalizedOfferToken || !matchingOffer) {
      return NextResponse.json(
        {
          error:
            "A waitlist offer is currently active for this event. Booking is temporarily reserved for the invited guest.",
        },
        { status: 409 }
      );
    }

    const matchingEntry = Array.isArray(matchingOffer.waitlist_entries)
      ? matchingOffer.waitlist_entries[0]
      : matchingOffer.waitlist_entries;
    const offerEmail = normalizeEmail(matchingEntry?.email);

    if (!offerEmail || offerEmail !== userEmail) {
      return NextResponse.json(
        {
          error:
            "This waitlist offer is assigned to a different email address. Sign in with the invited email to claim this spot.",
        },
        { status: 403 }
      );
    }

    if (attendees.length !== 1) {
      return NextResponse.json(
        { error: "Waitlist claim links can only be used for one attendee." },
        { status: 400 }
      );
    }
  }

  if (typeof event.spots_remaining === "number" && attendees.length > event.spots_remaining) {
    return NextResponse.json({ error: "There are not enough spots remaining for this order." }, { status: 400 });
  }

  const attendeeCount = attendees.length;
  const unitAmount = Math.round(Number(event.price) * 100);

  if (unitAmount < 0) {
    return NextResponse.json({ error: "Checkout requires a valid event price." }, { status: 400 });
  }

  const subtotalAmount = unitAmount * attendeeCount;
  let discountAmount = 0;
  let giftCardReservationApplied = false;

  async function releaseReservedGiftCard() {
    if (!giftCardReservationApplied) {
      return;
    }

    try {
      await supabaseAdmin.rpc("reverse_gift_card_redemptions", {
        p_order_id: order.id,
      });
    } catch (releaseError) {
      console.error("Failed to release reserved gift card after checkout error", {
        orderId: order.id,
        error: releaseError,
      });
    }
  }

  if (normalizedCouponCode) {
    const { data: couponData, error: couponError } = await supabaseAdmin
      .from("coupons")
      .select("id, code, discount_type, discount_value, bogo_buy_quantity, bogo_get_quantity, expiry_date, is_active")
      .eq("code", normalizedCouponCode)
      .maybeSingle();

    if (couponError) {
      return NextResponse.json({ error: "Failed to validate coupon." }, { status: 500 });
    }

    const coupon = couponData as CouponRow | null;
    if (!coupon) {
      return NextResponse.json({ error: "Coupon code not found." }, { status: 404 });
    }

    if (!coupon.is_active) {
      return NextResponse.json({ error: "This coupon is no longer active." }, { status: 400 });
    }

    if (coupon.expiry_date && coupon.expiry_date < new Date().toISOString()) {
      return NextResponse.json({ error: "This coupon has expired." }, { status: 400 });
    }

    if (coupon.discount_type === "dollar") {
      discountAmount = Math.round(coupon.discount_value * 100);
    } else if (coupon.discount_type === "percentage") {
      discountAmount = Math.round(subtotalAmount * (coupon.discount_value / 100));
    } else {
      const buyQty = coupon.bogo_buy_quantity || 1;
      const getQty = coupon.bogo_get_quantity || 1;
      const groupSize = buyQty + getQty;
      const fullGroups = Math.floor(attendeeCount / groupSize);
      const remainder = attendeeCount % groupSize;
      const freeSpots = fullGroups * getQty + Math.max(0, remainder - buyQty);
      const boundedFreeSpots = Math.min(freeSpots, attendeeCount);
      discountAmount = boundedFreeSpots * unitAmount;
    }
  }

  discountAmount = Math.max(0, Math.min(discountAmount, subtotalAmount));
  const totalAfterCouponAmount = Math.max(0, subtotalAmount - discountAmount);
  let totalAmount = totalAfterCouponAmount;
  let giftCardAmount = 0;

  const { error: preCheckoutOrderUpdateError } = await supabaseAdmin
    .from("checkout_orders")
    .update({
      subtotal_amount: subtotalAmount,
      total_amount: totalAfterCouponAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (preCheckoutOrderUpdateError) {
    return NextResponse.json({ error: preCheckoutOrderUpdateError.message }, { status: 500 });
  }

  if (normalizedGiftCardCode && totalAfterCouponAmount > 0) {
    const { data: giftCardData, error: giftCardError } = await supabaseAdmin.rpc("apply_gift_card_to_order", {
      p_order_id: order.id,
      p_gift_card_code: normalizedGiftCardCode,
      p_requested_amount: totalAfterCouponAmount,
    });

    if (giftCardError) {
      return NextResponse.json({ error: giftCardError.message }, { status: 400 });
    }

    const giftCardResult = Array.isArray(giftCardData) ? giftCardData[0] : giftCardData;
    if (!giftCardResult) {
      await releaseReservedGiftCard();
      return NextResponse.json({ error: "Gift card could not be applied." }, { status: 500 });
    }

    giftCardReservationApplied = true;
    giftCardAmount = Number(giftCardResult.applied_amount) || 0;
    totalAmount = Math.max(0, Number(giftCardResult.order_total_amount) || totalAfterCouponAmount - giftCardAmount);
  }

  if (totalAmount === 0) {
    const freeSessionId = `free_${order.id}`;
    const { data: finalizedRows, error: finalizeError } = await supabaseAdmin.rpc("finalize_checkout_order", {
      p_order_id: order.id,
      p_checkout_session_id: freeSessionId,
      p_payment_intent_id: null,
      p_payment_status: "no_payment_required",
    });

    if (finalizeError) {
      await releaseReservedGiftCard();
      return NextResponse.json({ error: finalizeError.message }, { status: 500 });
    }

    const finalizedCandidate = Array.isArray(finalizedRows) ? finalizedRows[0] : finalizedRows;
    if (!finalizedCandidate) {
      await releaseReservedGiftCard();
      return NextResponse.json({ error: "Finalize checkout returned no order." }, { status: 500 });
    }

    const finalized = finalizedCandidate as {
      order_id: string;
      buyer_user_id: string;
      buyer_email: string | null;
      attendee_count: number;
      total_amount: number;
    };

    if (matchingOffer) {
      const { data: claimedOffer } = await supabaseAdmin
        .from("waitlist_offers")
        .update({
          status: "claimed",
          claimed_at: new Date().toISOString(),
          claimed_by_user_id: finalized.buyer_user_id,
          claimed_order_id: finalized.order_id,
        })
        .eq("offer_token", matchingOffer.offer_token)
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

    await sendOrderConfirmationEmails({
      supabaseAdmin,
      orderId: finalized.order_id,
      buyerEmail: finalized.buyer_email,
      attendeeCount: finalized.attendee_count || attendeeCount,
      totalAmount: finalized.total_amount || 0,
    });

    return NextResponse.json({ url: `${siteOrigin}/success?session_id=${encodeURIComponent(freeSessionId)}` });
  }

  const orderCurrency = (order.currency || "usd").toLowerCase();
  let stripePriceId: string;
  if (discountAmount === 0) {
    try {
      stripePriceId = await ensureEventStripePrice({
        stripe,
        supabaseAdmin,
        event,
        currency: orderCurrency,
        unitAmount,
      });
    } catch (catalogError) {
      await releaseReservedGiftCard();
      return NextResponse.json(
        { error: catalogError instanceof Error ? catalogError.message : "Failed to prepare Stripe product pricing." },
        { status: 500 }
      );
    }
  } else {
    stripePriceId = "";
  }

  let session: Stripe.Checkout.Session;
  try {
    const cancelUrl = `${siteOrigin}/cart?eventId=${encodeURIComponent(order.event_id)}${
      normalizedOfferToken ? `&offer=${encodeURIComponent(normalizedOfferToken)}` : ""
    }`;

    session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${siteOrigin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      customer_email: user.email || undefined,
      client_reference_id: order.id,
      metadata: {
        orderId: order.id,
        eventId: order.event_id,
        buyerUserId: user.id,
        attendeeCount: String(attendeeCount),
        offerToken: normalizedOfferToken,
        couponCode: normalizedCouponCode,
        giftCardCode: normalizedGiftCardCode,
        giftCardAmount: String(giftCardAmount),
        discountAmount: String(discountAmount),
      },
      line_items:
        discountAmount === 0
          ? [
              {
                quantity: attendeeCount,
                price: stripePriceId,
              },
            ]
          : [
              {
                quantity: 1,
                price_data: {
                  currency: orderCurrency,
                  unit_amount: totalAmount,
                  product_data: {
                    name: `${event.name} (${attendeeCount} attendee${attendeeCount === 1 ? "" : "s"})`,
                  },
                },
              },
            ],
    });
  } catch (sessionError) {
    await releaseReservedGiftCard();
    return NextResponse.json(
      {
        error:
          sessionError instanceof Error
            ? sessionError.message
            : "Stripe Checkout could not be started.",
      },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("checkout_orders")
    .update({
      status: "pending_payment",
      subtotal_amount: subtotalAmount,
      total_amount: totalAmount,
      stripe_checkout_session_id: session.id,
      stripe_payment_status: session.payment_status,
    })
    .eq("id", order.id);

  if (updateError) {
    await releaseReservedGiftCard();
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}