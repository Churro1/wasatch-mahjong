"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

type CheckoutEvent = {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  event_type: "open_play" | "class" | null;
  price: number;
  spots_remaining: number | null;
  capacity: number | null;
};

export default function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [event, setEvent] = useState<CheckoutEvent | null>(null);
  const [continueMessage, setContinueMessage] = useState("");

  const checkoutPath = useMemo(() => {
    if (!eventId) {
      return "/checkout";
    }
    return `/checkout?eventId=${encodeURIComponent(eventId)}`;
  }, [eventId]);

  useEffect(() => {
    async function loadCheckoutData() {
      if (!eventId) {
        setError("Missing event selection. Please choose an event first.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?next=${encodeURIComponent(checkoutPath)}`);
        return;
      }

      setUserEmail(user.email || "");

      const { data, error: eventError } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_type, price, spots_remaining, capacity")
        .eq("id", eventId)
        .single();

      if (eventError || !data) {
        setError("We could not find this event. Please return to Events and try again.");
        setLoading(false);
        return;
      }

      const normalizedPrice = Number(data.price);
      if (Number.isNaN(normalizedPrice) || normalizedPrice <= 0) {
        setError("This event has invalid pricing data. Please contact support.");
        setLoading(false);
        return;
      }

      setEvent({ ...data, price: normalizedPrice });
      setLoading(false);
    }

    loadCheckoutData();
  }, [checkoutPath, eventId, router]);

  const handleContinue = () => {
    setContinueMessage("Payment integration is the next step. No charge has been made yet.");
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)] text-center mb-6">
          Checkout
        </h1>

        {loading ? (
          <Card>
            <p className="text-[color:var(--wasatch-gray)] text-center">Loading checkout details...</p>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <p className="text-[color:var(--wasatch-red)] font-medium mb-4">{error}</p>
            <Link href="/events">
              <Button variant="outline">Back to Events</Button>
            </Link>
          </Card>
        ) : null}

        {!loading && !error && event ? (
          <Card>
            <div className="space-y-5">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-1">{event.name}</h2>
                <p className="text-[color:var(--wasatch-gray)] text-sm">
                  {format(parseISO(event.event_date), "MMMM d, yyyy")} at {format(parseISO(event.event_date), "h:mm a")}
                </p>
                <p className="text-[color:var(--wasatch-blue)] text-sm mt-1">
                  {event.event_type === "class" ? "Class" : "Open Play"}
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[color:var(--wasatch-gray)]/30 p-4 space-y-2">
                <div className="flex items-center justify-between text-[color:var(--wasatch-gray)]">
                  <span>Booked As</span>
                  <span className="font-medium">{userEmail || "Signed-in user"}</span>
                </div>
                <div className="flex items-center justify-between text-[color:var(--wasatch-gray)]">
                  <span>Spots Remaining</span>
                  <span className="font-medium">
                    {typeof event.spots_remaining === "number" ? `${event.spots_remaining}/${event.capacity ?? "-"}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-lg">
                  <span className="font-serif text-[color:var(--wasatch-blue)] font-bold">Total</span>
                  <span className="font-serif text-[color:var(--wasatch-red)] font-bold">${event.price}</span>
                </div>
              </div>

              {event.description ? (
                <p className="text-[color:var(--wasatch-gray)] leading-7">{event.description}</p>
              ) : null}

              <p className="text-sm text-[color:var(--wasatch-gray)]">
                This checkout page now validates your event and account. Stripe handoff will be wired in next.
              </p>

              {continueMessage ? <p className="text-sm text-[color:var(--wasatch-blue)]">{continueMessage}</p> : null}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button variant="primary" onClick={handleContinue} className="w-full sm:w-auto">
                  Continue to Payment
                </Button>
                <Link href="/events" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto">
                    Back to Events
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
