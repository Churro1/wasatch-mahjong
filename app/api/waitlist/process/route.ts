import { NextRequest, NextResponse } from "next/server";
import { getSiteOrigin } from "@/lib/siteUrl";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchWaitlistOffersForEvent } from "@/lib/waitlist";

export async function POST(req: NextRequest) {
  const siteOrigin = getSiteOrigin(req);
  const configuredSecret = process.env.WAITLIST_CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "WAITLIST_CRON_SECRET is not configured." }, { status: 500 });
  }

  const providedSecret = req.headers.get("x-waitlist-secret");
  if (!providedSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: events, error } = await supabaseAdmin
    .from("events")
    .select("id, name, event_date, spots_remaining")
    .gt("spots_remaining", 0)
    .order("event_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let offeredCount = 0;

  for (const event of events || []) {
    try {
      const result = await dispatchWaitlistOffersForEvent({
        supabaseAdmin,
        event,
        origin: siteOrigin,
      });
      offeredCount += result.offered;
    } catch (dispatchError) {
      console.error("Failed to process waitlist offers for event", event.id, dispatchError);
    }
  }

  return NextResponse.json({
    processedEvents: (events || []).length,
    offersSent: offeredCount,
  });
}
