import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

  const order = data as SummaryOrder & { confirmation_email_sent_at?: string | null };
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