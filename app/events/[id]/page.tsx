"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type EventDetailItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "Open Play" | "Class" | "Custom";
  spots: number;
  price: number;
  description: string;
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [userIsSignedUp, setUserIsSignedUp] = useState(false);
  const [userOnWaitlist, setUserOnWaitlist] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_type, price, spots_remaining, spots_available")
        .eq("id", id)
        .gte("event_date", midnight.toISOString())
        .single();

      if (!data) {
        setLoading(false);
        return;
      }

      const eventDate = parseISO(data.event_date);
      const spots = data.spots_remaining ?? data.spots_available ?? 0;

      setEvent({
        id: data.id,
        title: data.name,
        date: format(eventDate, "MMMM d, yyyy"),
        time: format(eventDate, "h:mm a"),
        type:
          data.event_type === "class"
            ? "Class"
            : data.event_type === "open_play"
              ? "Open Play"
              : "Custom",
        spots,
        price: Number(data.price),
        description: data.description || "No description provided.",
      });

      // Check if user is already signed up
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser) {
        // Check for active signups by this user for this event
        const { data: existingSignups } = await supabase
          .from("signups")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("event_id", id)
          .eq("signup_status", "active")
          .limit(1);

        if (existingSignups && existingSignups.length > 0) {
          setUserIsSignedUp(true);
        }

        // Check if user is on waitlist
        const { data: waitlistStatus } = await supabase
          .from("waitlist_entries")
          .select("id, status")
          .eq("event_id", id)
          .eq("email", currentUser.email || "")
          .in("status", ["queued", "offered"])
          .limit(1);

        if (waitlistStatus && waitlistStatus.length > 0) {
          setUserOnWaitlist(true);
        }
      }
      setLoading(false);
    }

    loadEvent();
  }, [id]);

  if (loading) {
    return <main className="max-w-2xl mx-auto py-12 px-4 text-[color:var(--wasatch-gray)]">Loading event...</main>;
  }

  if (!event) {
    return <main className="max-w-2xl mx-auto py-12 px-4 text-[color:var(--wasatch-gray)]">Event not found.</main>;
  }

  return (
    <main className="max-w-2xl mx-auto py-12 px-4">
      <Card>
        <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-red)] mb-2">{event.title}</h1>
        <div className="text-[color:var(--wasatch-gray)] text-base mb-1">
          {event.date}
          <span className="ml-2 text-[color:var(--wasatch-blue)]">{event.time}</span>
        </div>
        <div className="text-xs text-[color:var(--wasatch-blue)] mb-4">{event.type}</div>
        <p className="font-sans text-lg text-[color:var(--wasatch-gray)] mb-6">{event.description}</p>
        <div className="flex items-center gap-4 mb-6">
          <span className="text-[color:var(--wasatch-blue)] font-semibold">
            {event.spots > 0 ? `${event.spots} spots left` : "Waitlist only"}
          </span>
          <span className="text-[color:var(--wasatch-gray)]">${event.price}</span>
        </div>

        {userIsSignedUp ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium">You are already signed up for this event.</p>
            <p className="text-blue-700 text-sm mt-1">View your booking in your dashboard.</p>
          </div>
        ) : null}

        {userOnWaitlist ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-amber-800 font-medium">You are on the waitlist for this event.</p>
            <p className="text-amber-700 text-sm mt-1">You will receive an email if a spot opens.</p>
          </div>
        ) : null}

        {!userIsSignedUp && event.spots > 0 ? (
          <Link href={`/cart?eventId=${event.id}`}>
            <Button variant="secondary">Sign Up</Button>
          </Link>
        ) : null}

        {!userIsSignedUp && !userOnWaitlist && event.spots <= 0 ? (
          <Link href={`/waitlist?eventId=${event.id}`}>
            <Button variant="outline">Join Waitlist</Button>
          </Link>
        ) : null}
      </Card>
    </main>
  );
}
