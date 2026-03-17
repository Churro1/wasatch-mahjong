import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/sendEmail";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type EventSummary = {
  id: string;
  name: string;
  event_date: string;
  spots_remaining: number | null;
};

type WaitlistEntry = {
  id: string;
  email: string;
  full_name: string | null;
  offered_count: number;
};

const OFFER_WINDOW_HOURS = 24;

function buildOfferEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  claimUrl: string;
}) {
  return `
    <h1>Wasatch Mahjong Waitlist Spot Available</h1>
    <p>Hi ${params.attendeeName},</p>
    <p>A spot just opened for <strong>${params.eventName}</strong>.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    <p>This spot is reserved for you for <strong>24 hours</strong> from this email.</p>
    <p><a href="${params.claimUrl}">Claim your spot now</a></p>
    <p>If the spot is not claimed in time, it will be offered to the next person in line.</p>
  `;
}

function buildJoinedWaitlistEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
}) {
  return `
    <h1>You're on the Wasatch Mahjong Waitlist</h1>
    <p>Hi ${params.attendeeName},</p>
    <p>You are now on the waitlist for <strong>${params.eventName}</strong>.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    <p>If a spot opens, we will email you a private link. You will have 24 hours to claim the spot.</p>
  `;
}

function makeOfferToken() {
  return randomBytes(24).toString("hex");
}

export async function expireOffersForEvent(params: {
  supabaseAdmin: SupabaseAdmin;
  eventId: string;
}) {
  const { supabaseAdmin, eventId } = params;

  const { data: expiredOffers, error: expireError } = await supabaseAdmin
    .from("waitlist_offers")
    .update({ status: "expired" })
    .eq("event_id", eventId)
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString())
    .select("id, entry_id");

  if (expireError) {
    throw new Error(expireError.message);
  }

  const entryIds = (expiredOffers || []).map((offer) => offer.entry_id).filter(Boolean);
  if (entryIds.length === 0) {
    return;
  }

  const { error: entryResetError } = await supabaseAdmin
    .from("waitlist_entries")
    .update({ status: "queued" })
    .in("id", entryIds)
    .eq("status", "offered");

  if (entryResetError) {
    throw new Error(entryResetError.message);
  }
}

export async function dispatchWaitlistOffersForEvent(params: {
  supabaseAdmin: SupabaseAdmin;
  event: EventSummary;
  origin: string;
}) {
  const { supabaseAdmin, event, origin } = params;

  await expireOffersForEvent({ supabaseAdmin, eventId: event.id });

  const availableSpots = Number(event.spots_remaining || 0);
  if (availableSpots <= 0) {
    return { offered: 0 };
  }

  const { count: activeOfferCount, error: activeOfferError } = await supabaseAdmin
    .from("waitlist_offers")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());

  if (activeOfferError) {
    throw new Error(activeOfferError.message);
  }

  const slotsToOffer = Math.max(0, availableSpots - (activeOfferCount || 0));
  if (slotsToOffer <= 0) {
    return { offered: 0 };
  }

  let offered = 0;

  for (let i = 0; i < slotsToOffer; i += 1) {
    const { data: nextEntry, error: entryError } = await supabaseAdmin
      .from("waitlist_entries")
      .select("id, email, full_name, offered_count")
      .eq("event_id", event.id)
      .eq("status", "queued")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (entryError) {
      throw new Error(entryError.message);
    }

    if (!nextEntry) {
      break;
    }

    const entry = nextEntry as WaitlistEntry;
    const token = makeOfferToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OFFER_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data: offer, error: offerError } = await supabaseAdmin
      .from("waitlist_offers")
      .insert({
        event_id: event.id,
        entry_id: entry.id,
        offer_token: token,
        status: "active",
        sent_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (offerError || !offer) {
      throw new Error(offerError?.message || "Failed to create waitlist offer.");
    }

    const { error: entryUpdateError } = await supabaseAdmin
      .from("waitlist_entries")
      .update({
        status: "offered",
        last_offered_at: now.toISOString(),
        offered_count: (entry.offered_count || 0) + 1,
      })
      .eq("id", entry.id);

    if (entryUpdateError) {
      throw new Error(entryUpdateError.message);
    }

    const claimUrl = `${origin}/cart?eventId=${encodeURIComponent(event.id)}&offer=${encodeURIComponent(token)}`;

    try {
      await sendEmail({
        to: entry.email,
        subject: `Wasatch Mahjong Spot Open: ${event.name}`,
        html: buildOfferEmailHtml({
          attendeeName: entry.full_name || entry.email,
          eventName: event.name,
          eventDate: event.event_date,
          claimUrl,
        }),
      });
      offered += 1;
    } catch (emailError) {
      await supabaseAdmin.from("waitlist_offers").update({ status: "cancelled" }).eq("id", offer.id);
      await supabaseAdmin.from("waitlist_entries").update({ status: "queued" }).eq("id", entry.id);
      console.error("Failed to send waitlist offer email", emailError);
    }
  }

  return { offered };
}

export async function sendWaitlistJoinedEmail(params: {
  email: string;
  fullName: string;
  eventName: string;
  eventDate: string;
}) {
  const { email, fullName, eventName, eventDate } = params;
  await sendEmail({
    to: email,
    subject: `Wasatch Mahjong Waitlist: ${eventName}`,
    html: buildJoinedWaitlistEmailHtml({
      attendeeName: fullName,
      eventName,
      eventDate,
    }),
  });
}
