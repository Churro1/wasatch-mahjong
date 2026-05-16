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

  const { eventId, attendeeName, attendeeEmail } = await req.json();

  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  if (!attendeeName || typeof attendeeName !== "string" || !attendeeName.trim()) {
    return NextResponse.json({ error: "Attendee name is required." }, { status: 400 });
  }

  const normalizedName = attendeeName.trim();
  const normalizedEmail = attendeeEmail ? attendeeEmail.trim() || null : null;

  // Verify event exists and has spots remaining
  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, spots_remaining, name")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  if (event.spots_remaining <= 0) {
    return NextResponse.json(
      { error: "No spots remaining for this event." },
      { status: 400 }
    );
  }

  // Create signup
  const { data: signup, error: signupError } = await supabaseAdmin
    .from("signups")
    .insert({
      event_id: eventId,
      user_id: null,
      order_id: null,
      attendee_name: normalizedName,
      attendee_email: normalizedEmail,
      is_buyer: false,
      payment_status: "admin",
      signup_status: "active",
    })
    .select()
    .single();

  if (signupError || !signup) {
    console.error("Signup creation error:", signupError);
    return NextResponse.json(
      { error: "Failed to add attendee to event." },
      { status: 500 }
    );
  }

  // Update event spots_remaining
  const { error: updateError } = await supabaseAdmin
    .from("events")
    .update({ spots_remaining: event.spots_remaining - 1 })
    .eq("id", eventId);

  if (updateError) {
    console.error("Event update error:", updateError);
    // Try to rollback the signup if we can't update the event
    await supabaseAdmin.from("signups").delete().eq("id", signup.id);
    return NextResponse.json(
      { error: "Failed to update event spots." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    signup,
    message: `${normalizedName} has been added to ${event.name}.`,
  });
}
