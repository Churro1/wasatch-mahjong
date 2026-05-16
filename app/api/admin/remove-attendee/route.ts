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

  const { signupId, eventId } = await req.json();

  if (!signupId || typeof signupId !== "string" || !signupId.trim()) {
    return NextResponse.json({ error: "Signup ID is required." }, { status: 400 });
  }

  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  // Get the signup to verify it exists
  const { data: signup, error: signupError } = await supabaseAdmin
    .from("signups")
    .select("id, event_id, attendee_name")
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

  // Delete the signup
  const { error: deleteError } = await supabaseAdmin
    .from("signups")
    .delete()
    .eq("id", signupId);

  if (deleteError) {
    console.error("Signup deletion error:", deleteError);
    return NextResponse.json(
      { error: "Failed to remove attendee." },
      { status: 500 }
    );
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
    message: `${signup.attendee_name} has been removed from the event.`,
  });
}
