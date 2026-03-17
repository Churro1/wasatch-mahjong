"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

type WaitlistEvent = {
  id: string;
  name: string;
  event_date: string;
  spots_remaining: number | null;
};

export default function WaitlistContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [event, setEvent] = useState<WaitlistEvent | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadEvent() {
      if (!eventId) {
        setError("Missing event selection.");
        setLoading(false);
        return;
      }

      const { data, error: eventError } = await supabase
        .from("events")
        .select("id, name, event_date, spots_remaining")
        .eq("id", eventId)
        .single();

      if (eventError || !data) {
        setError("Event not found.");
        setLoading(false);
        return;
      }

      setEvent(data as WaitlistEvent);
      setLoading(false);
    }

    loadEvent();
  }, [eventId]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!eventId) {
      setError("Missing event selection.");
      return;
    }

    setSubmitting(true);
    setError("");
    setStatus("");

    const response = await fetch("/api/waitlist/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId,
        fullName,
        email,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "We could not add you to the waitlist.");
      setSubmitting(false);
      return;
    }

    setStatus(payload.message || "You are on the waitlist.");
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Card>
          <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] mb-4">Join Waitlist</h1>

          {loading ? <p className="text-[color:var(--wasatch-gray)]">Loading event...</p> : null}

          {!loading && event ? (
            <div className="mb-6 text-[color:var(--wasatch-gray)]">
              <p className="font-semibold text-[color:var(--wasatch-red)]">{event.name}</p>
              <p>{format(parseISO(event.event_date), "MMMM d, yyyy 'at' h:mm a")}</p>
              <p className="text-sm mt-2">
                If a spot opens, we will email you a private signup link. You will have 24 hours to claim it.
              </p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-[color:var(--wasatch-red)] mb-4">{error}</p> : null}
          {status ? <p className="text-sm text-[color:var(--wasatch-blue)] mb-4">{status}</p> : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                required
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={submitting || !eventId || !event}>
              {submitting ? "Joining..." : "Join Waitlist"}
            </Button>
          </form>

          <div className="pt-4">
            <Link href="/events">
              <Button variant="outline">Back to Events</Button>
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
