import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
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

  try {
    // Find all paid checkout orders with their attendees
    const { data: paidOrders, error: ordersError } = await supabaseAdmin
      .from("checkout_orders")
      .select(
        `
        id,
        event_id,
        buyer_user_id,
        checkout_order_attendees(
          id,
          order_id,
          full_name,
          email,
          is_buyer
        )
      `
      )
      .eq("status", "paid");

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    let createdCount = 0;
    let processedCount = 0;

    // For each paid order, ensure all attendees have signup rows
    for (const order of paidOrders || []) {
      if (!Array.isArray(order.checkout_order_attendees)) {
        continue;
      }

      for (const attendee of order.checkout_order_attendees) {
        processedCount++;

        // Check if signup already exists for this attendee
        const { data: existingSignup } = await supabaseAdmin
          .from("signups")
          .select("id")
          .eq("order_id", order.id)
          .eq("attendee_name", attendee.full_name)
          .eq("is_buyer", attendee.is_buyer)
          .maybeSingle();

        if (existingSignup) {
          // Signup already exists, skip
          continue;
        }

        // Create signup for this attendee
        const { error: signupError } = await supabaseAdmin.from("signups").insert({
          user_id: attendee.is_buyer ? order.buyer_user_id : null,
          event_id: order.event_id,
          order_id: order.id,
          attendee_name: attendee.full_name,
          attendee_email: attendee.email ? (attendee.email.trim() ? attendee.email.trim() : null) : null,
          is_buyer: attendee.is_buyer,
          payment_status: "paid",
          signup_status: "active",
        });

        if (!signupError) {
          createdCount++;
        }
      }
    }

    return NextResponse.json({
      message: "Rosters reconciled successfully.",
      processedAttendees: processedCount,
      createdSignups: createdCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Reconciliation failed: ${message}` }, { status: 500 });
  }
}
