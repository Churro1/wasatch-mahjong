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
  type: "Open Play" | "Class";
  spots: number;
  price: number;
  description: string;
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetailItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvent() {
      const { data } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_type, price, spots_remaining, spots_available")
        .eq("id", id)
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
        type: data.event_type === "class" ? "Class" : "Open Play",
        spots,
        price: Number(data.price),
        description: data.description || "No description provided.",
      });

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

        {event.spots > 0 ? (
          <Link href={`/login?next=${encodeURIComponent(`/checkout?eventId=${event.id}`)}`}>
            <Button variant="secondary">Sign Up</Button>
          </Link>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(`/events/${event.id}`)}`}>
            <Button variant="outline">Join Waitlist</Button>
          </Link>
        )}
      </Card>
    </main>
  );
}
