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
  const [userEmail, setUserEmail] = useState("");
  const [alreadyOnWaitlist, setAlreadyOnWaitlist] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      if (!eventId) {
        setError("Missing event selection.");
        setLoading(false);
        return;
      }

      // Get current user email and check if already on waitlist
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser?.email) {
        setUserEmail(currentUser.email);
        setEmail(currentUser.email);

        // Check if already on waitlist
        const { data: waitlistCheck } = await supabase
          .from("waitlist_entries")
          .select("id, status")
          .eq("event_id", eventId)
          .eq("email", currentUser.email)
          .in("status", ["queued", "offered"])
          .limit(1);

        if (waitlistCheck && waitlistCheck.length > 0) {
          setAlreadyOnWaitlist(true);
        }
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

    if (alreadyOnWaitlist) {
      setError("You are already on the waitlist for this event at " + email);
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

    setStatus(payload.message || "You are on the waitlist. Check your email for next steps.");
    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Card>
          <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] mb-4">Join Event Waitlist</h1>

          {loading ? <p className="text-[color:var(--wasatch-gray)]">Loading event...</p> : null}

          {!loading && event ? (
            <div className="mb-6 space-y-3 text-[color:var(--wasatch-gray)]">
              <div>
                <p className="font-semibold text-[color:var(--wasatch-red)]">{event.name}</p>
                <p>{format(parseISO(event.event_date), "MMMM d, yyyy 'at' h:mm a")}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900 font-semibold">How the waitlist works:</p>
                <ul className="text-sm text-blue-900 mt-2 space-y-1">
                  <li>✓ When a spot becomes available, you'll get an email</li>
                  <li>✓ You'll have 24 hours to claim your spot with a private link</li>
                  <li>✓ Complete your payment to confirm your registration</li>
                </ul>
              </div>
            </div>
          ) : null}

          {alreadyOnWaitlist ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="font-medium text-amber-800">You are already on the waitlist</p>
              <p className="text-sm text-amber-700 mt-1">
                We'll email you at <strong>{userEmail}</strong> if a spot opens. Check your inbox and spam folder for our emails.
              </p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-[color:var(--wasatch-red)] mb-4 font-medium">{error}</p> : null}
          {status ? <p className="text-sm text-[color:var(--wasatch-blue)] mb-4 font-medium">{status}</p> : null}

          {!alreadyOnWaitlist ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="waitlist-full-name" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Name</label>
                <input
                  id="waitlist-full-name"
                  name="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label htmlFor="waitlist-email" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Email Address</label>
                <input
                  id="waitlist-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="your@email.com"
                  required
                />
                <p className="text-xs text-[color:var(--wasatch-gray)] mt-1">
                  We'll send spot availability notifications to this email
                </p>
              </div>

              <Button type="submit" variant="primary" className="w-full" disabled={submitting || !eventId || !event}>
                {submitting ? "Joining..." : "Join Waitlist"}
              </Button>
            </form>
          ) : null}

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
