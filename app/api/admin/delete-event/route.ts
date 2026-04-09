import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

  const { eventId } = await req.json();
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";

  if (!isUuid(normalizedEventId)) {
    return NextResponse.json({ error: "Valid event ID is required." }, { status: 400 });
  }

  const { data: event, error: eventLookupError } = await supabaseAdmin
    .from("events")
    .select("id")
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (eventLookupError) {
    return NextResponse.json({ error: eventLookupError.message }, { status: 500 });
  }

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { count: orderCount, error: orderCountError } = await supabaseAdmin
    .from("checkout_orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", normalizedEventId);

  if (orderCountError) {
    return NextResponse.json({ error: orderCountError.message }, { status: 500 });
  }

  const { count: signupCount, error: signupCountError } = await supabaseAdmin
    .from("signups")
    .select("id", { count: "exact", head: true })
    .eq("event_id", normalizedEventId);

  if (signupCountError) {
    return NextResponse.json({ error: signupCountError.message }, { status: 500 });
  }

  if ((signupCount || 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete this event because it has one or more signups. Cancel attendee orders instead." },
      { status: 409 }
    );
  }

  if ((orderCount || 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete this event because it has checkout orders. Delete or cancel those orders first." },
      { status: 409 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("events")
    .delete()
    .eq("id", normalizedEventId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: "Event deleted." });
}
