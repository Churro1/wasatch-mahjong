"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { format, parseISO } from "date-fns";

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "Open Play" | "Class" | "Custom";
  spots: number;
  capacity: number;
  price: number;
  description: string;
};

function toUiEvent(row: {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  event_type: string | null;
  price: number;
  capacity?: number | null;
  spots_remaining?: number | null;
  spots_available?: number | null;
}): EventItem {
  const parsedDate = parseISO(row.event_date);
  const capacity = row.capacity ?? 0;
  const spots = row.spots_remaining ?? row.spots_available ?? capacity;

  return {
    id: row.id,
    title: row.name,
    date: format(parsedDate, "MMM d, yyyy"),
    time: format(parsedDate, "h:mm a"),
    type: row.event_type === "class" ? "Class" : row.event_type === "open_play" ? "Open Play" : "Custom",
    spots,
    capacity,
    price: Number(row.price),
    description: row.description || "No description provided.",
  };
}

function EventCard({ event }: { event: EventItem }) {
  const spotsLeft = event.capacity - (event.capacity - event.spots);
  const isFull = spotsLeft === 0;

  return (
    <Card>
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)]">{event.title}</h3>
            <p className="text-sm text-[color:var(--wasatch-gray)]">{event.type}</p>
          </div>
          <span className={`text-sm font-semibold px-2 py-1 rounded ${isFull ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {isFull ? "Full" : `${spotsLeft} spots`}
          </span>
        </div>
        <p className="text-sm text-[color:var(--wasatch-gray)]">{event.date} at {event.time}</p>
        <p className="text-sm text-[color:var(--wasatch-gray)]">${event.price.toFixed(2)}</p>
      </div>
    </Card>
  );
}

export default function Home() {
  const [upcomingEvents, setUpcomingEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_type, price, capacity, spots_remaining, spots_available")
        .gte("event_date", midnight.toISOString())
        .order("event_date", { ascending: true })
        .limit(3);

      if (!error && data) {
        setUpcomingEvents(data.map(toUiEvent));
      }
      setLoading(false);
    }

    loadEvents();
  }, []);

  return (
    <div className="min-h-screen bg-[color:var(--wasatch-bg1)]">
      {/* Hero Section */}
      <section className="w-full py-16 px-4 bg-[color:var(--wasatch-bg2)] flex flex-col items-center text-center">
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-[color:var(--wasatch-red)] mb-4 tracking-tight">Welcome to Wasatch Mahjong</h1>
        <p className="max-w-xl text-lg md:text-xl text-[color:var(--wasatch-gray)] mb-8 font-sans">
          Salt Lake City&apos;s friendliest American Mahjong club. Join us for open play nights, fun classes, and a warm, welcoming community!
        </p>
        <Link href="/events">
          <Button variant="primary" className="text-lg px-8 py-3 shadow-lg">View Events</Button>
        </Link>
      </section>

      {/* Upcoming Events Section */}
      <section className="w-full max-w-5xl mx-auto py-12 px-4">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-8 text-center">Upcoming Events</h2>
        {loading ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-[color:var(--wasatch-gray)]">Loading events...</p>
            </div>
          </Card>
        ) : upcomingEvents.length > 0 ? (
          <div className="space-y-4">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
            <div className="text-center pt-4">
              <Link href="/events">
                <Button variant="secondary">See All Events</Button>
              </Link>
            </div>
          </div>
        ) : (
          <Card>
            <div className="text-center space-y-3">
              <p className="font-sans text-base text-[color:var(--wasatch-gray)]">
                No upcoming events scheduled at this time.
              </p>
              <p className="font-sans text-base text-[color:var(--wasatch-gray)]">
                Check back soon or visit the Events page for more information.
              </p>
              <Link href="/events" className="inline-block">
                <Button variant="secondary">View Events</Button>
              </Link>
            </div>
          </Card>
        )}
      </section>
      {/* Who We Are Section */}
      <section className="w-full max-w-3xl mx-auto py-12 px-4 text-center">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-4">Who We Are</h2>
        <p className="text-lg md:text-xl text-[color:var(--wasatch-gray)] font-sans mb-4">
          Wasatch Mahjong is a community of players who love the game and love sharing it with others. Whether you’re a total beginner or a seasoned player, you’ll find a warm welcome, friendly faces, and a place to belong. We believe in fun, fairness, and fostering new friendships through the joy of American Mahjong.
        </p>
      </section>

      {/* Location Section */}
      <section className="w-full max-w-3xl mx-auto py-12 px-4 text-center">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-4">Location</h2>
        <p className="text-lg text-[color:var(--wasatch-red)] font-sans mb-2">
          <span>3939 S Wasatch Dr, Salt Lake City, UT 84124</span>
        </p>
        <a
          href="https://maps.app.goo.gl/Kj5bom52uh6Vy2DG8?g_st=ic"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-[color:var(--wasatch-blue)] underline hover:text-[color:var(--wasatch-red)] transition"
        >
          View on Google Maps
        </a>
        <div className="text-sm text-[color:var(--wasatch-gray)] mt-4">
          We recommend arriving 10-15 minutes early to get settled before play begins.
        </div>
      </section>
    </div>
  );
}
