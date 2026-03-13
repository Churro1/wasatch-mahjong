import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

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

  const { orderId } = await req.json();
  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("checkout_orders")
    .select(
      "id, buyer_user_id, event_id, status, subtotal_amount, total_amount, currency, checkout_order_attendees(id, full_name, email, is_buyer), events(id, name, description, event_date, price, spots_remaining, stripe_product_id, stripe_price_id, stripe_price_unit_amount, stripe_price_currency)"
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

  if (typeof event.spots_remaining === "number" && attendees.length > event.spots_remaining) {
    return NextResponse.json({ error: "There are not enough spots remaining for this order." }, { status: 400 });
  }

  const attendeeCount = attendees.length;
  const unitAmount = Math.round(Number(event.price) * 100);
  if (unitAmount <= 0) {
    return NextResponse.json({ error: "Checkout requires an event price greater than $0." }, { status: 400 });
  }

  const orderCurrency = (order.currency || "usd").toLowerCase();
  const totalAmount = unitAmount * attendeeCount;
  const origin = req.nextUrl.origin;

  let stripePriceId: string;
  try {
    stripePriceId = await ensureEventStripePrice({
      stripe,
      supabaseAdmin,
      event,
      currency: orderCurrency,
      unitAmount,
    });
  } catch (catalogError) {
    return NextResponse.json(
      { error: catalogError instanceof Error ? catalogError.message : "Failed to prepare Stripe product pricing." },
      { status: 500 }
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart?eventId=${encodeURIComponent(order.event_id)}`,
      customer_email: user.email || undefined,
      client_reference_id: order.id,
      metadata: {
        orderId: order.id,
        eventId: order.event_id,
        buyerUserId: user.id,
        attendeeCount: String(attendeeCount),
      },
      line_items: [
        {
          quantity: attendeeCount,
          price: stripePriceId,
        },
      ],
    });
  } catch (sessionError) {
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
      subtotal_amount: totalAmount,
      total_amount: totalAmount,
      stripe_checkout_session_id: session.id,
      stripe_payment_status: session.payment_status,
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}