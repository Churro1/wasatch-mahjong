import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";
import { getSiteOrigin } from "@/lib/siteUrl";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchWaitlistOffersForEvent, sendWaitlistJoinedEmail } from "@/lib/waitlist";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const siteOrigin = getSiteOrigin(req);
  const ip = getClientIp(req);
  const rateLimit = enforceRateLimit(`waitlist:${ip}`, 8, 60 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many requests. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  const payload = await req.json();
  const eventId = typeof payload.eventId === "string" ? payload.eventId : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const fullName = typeof payload.fullName === "string" ? payload.fullName.trim() : "";

  if (!eventId) {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, name, event_date, spots_remaining")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  if (Number(event.spots_remaining || 0) > 0) {
    return NextResponse.json(
      { error: "A spot is currently available. Please sign up directly from Events." },
      { status: 400 }
    );
  }

  const { data: existingEntry, error: existingError } = await supabaseAdmin
    .from("waitlist_entries")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("email", email)
    .in("status", ["queued", "offered"])
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existingEntry) {
    return NextResponse.json({ message: "You are already on the waitlist for this event." });
  }

  const { error: insertError } = await supabaseAdmin.from("waitlist_entries").insert({
    event_id: eventId,
    email,
    full_name: fullName || null,
    status: "queued",
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    await sendWaitlistJoinedEmail({
      email,
      fullName: fullName || email,
      eventName: event.name,
      eventDate: event.event_date,
    });
  } catch (emailError) {
    console.error("Failed to send waitlist joined email", emailError);
  }

  try {
    await dispatchWaitlistOffersForEvent({
      supabaseAdmin,
      event,
      origin: siteOrigin,
    });
  } catch (offerError) {
    console.error("Failed to dispatch waitlist offers after join", offerError);
  }

  return NextResponse.json({
    message: "You are on the waitlist. If a spot opens, you will receive an email with a 24-hour private signup link.",
  });
}
