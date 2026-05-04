"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

type SummaryAttendee = {
  full_name: string;
  email: string | null;
  is_buyer: boolean;
};

type SummaryEvent = {
  name: string;
  description: string | null;
  event_date: string;
};

type SummaryResponse = {
  id: string;
  status: string;
  totalAmount: number;
  type: "event" | "gift_card";
  confirmationEmailSentAt: string | null;
  attendees?: SummaryAttendee[];
  event?: SummaryEvent | null;
  giftCardAmount?: number;
  giftCard?: {
    id: string;
    code: string;
    original_amount: number;
    remaining_amount: number;
    recipient_name: string | null;
    recipient_email: string | null;
    message: string | null;
    email_sent_at: string | null;
  };
};

export default function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    async function loadSummary() {
      if (!sessionId) {
        setError("Missing Stripe session reference.");
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        router.push(`/login?next=${encodeURIComponent(`/success?session_id=${sessionId}`)}`);
        return;
      }

      const response = await fetch(`/api/checkout/session-summary?session_id=${encodeURIComponent(sessionId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "We could not load your confirmation.");
        setLoading(false);
        return;
      }

      setSummary(payload as SummaryResponse);
      setLoading(false);
    }

    loadSummary();
  }, [router, sessionId]);

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)] mb-2">
            Confirmation
          </h1>
          <p className="text-[color:var(--wasatch-gray)]">Your order summary and event details are below.</p>
        </div>

        {loading ? (
          <Card>
            <p className="text-[color:var(--wasatch-gray)] text-center">Loading your confirmation...</p>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <p className="text-[color:var(--wasatch-red)] font-medium mb-4">{error}</p>
            <Link href="/dashboard">
              <Button variant="outline">Go to Dashboard</Button>
            </Link>
          </Card>
        ) : null}

        {!loading && !error && summary && summary.type === "event" && summary.event ? (
          <>
            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Order Summary</h2>
              <div className="space-y-3 text-[color:var(--wasatch-gray)]">
                <div>
                  <p className="font-semibold text-[color:var(--wasatch-blue)]">{summary.event.name}</p>
                  <p>{format(parseISO(summary.event.event_date), "MMMM d, yyyy 'at' h:mm a")}</p>
                </div>
                <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Order Status</span>
                    <span className="font-medium capitalize">{summary.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Attendees</span>
                    <span>{summary.attendees?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-lg font-semibold text-[color:var(--wasatch-blue)]">
                    <span>Total Paid</span>
                    <span>${(summary.totalAmount / 100).toFixed(2)}</span>
                  </div>
                  {summary.giftCardAmount && summary.giftCardAmount > 0 ? (
                    <div className="flex items-center justify-between text-sm text-green-700">
                      <span>Gift Card Applied</span>
                      <span>- ${(summary.giftCardAmount / 100).toFixed(2)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Attendees</h2>
              <div className="space-y-3">
                {(summary.attendees || []).map((attendee) => (
                  <div key={`${attendee.full_name}-${attendee.email || "no-email"}`} className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 p-4 bg-white">
                    <p className="font-semibold text-[color:var(--wasatch-blue)]">{attendee.full_name}</p>
                    <p className="text-sm text-[color:var(--wasatch-gray)]">{attendee.email || "No attendee email entered"}</p>
                    {attendee.is_buyer ? <p className="text-xs text-[color:var(--wasatch-gray)] mt-1">Buyer</p> : null}
                  </div>
                ))}
              </div>
              {summary.confirmationEmailSentAt ? (
                <p className="text-sm text-[color:var(--wasatch-blue)] mt-4">Confirmation emails were sent to the buyer email and any entered attendee emails.</p>
              ) : null}
            </Card>

            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">What To Do Day Of</h2>
              <div className="space-y-2 text-[color:var(--wasatch-gray)]">
                <p>Show up 15 minutes early to get signed in and settled.</p>
                <p>No need to bring tiles.</p>
                <p>Bring a card if you want.</p>
              </div>
            </Card>

            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Cancellation Policy</h2>
              <p className="text-[color:var(--wasatch-gray)]">
                Cancellations require at least 24 hours notice and include a $10 cancellation fee.
              </p>
              <div className="pt-4 flex flex-col sm:flex-row gap-3">
                <Link href="/dashboard">
                  <Button variant="primary">Go to Dashboard</Button>
                </Link>
                <Link href="/events">
                  <Button variant="outline">Back to Events</Button>
                </Link>
              </div>
            </Card>
          </>
        ) : null}

        {!loading && !error && summary && summary.type === "gift_card" && summary.giftCard ? (
          <>
            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Gift Card Purchase</h2>
              <div className="space-y-3 text-[color:var(--wasatch-gray)]">
                <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="font-medium capitalize">{summary.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Gift Card Amount</span>
                    <span>${(summary.totalAmount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-lg font-semibold text-[color:var(--wasatch-blue)]">
                    <span>Code</span>
                    <span className="font-mono text-base">{summary.giftCard.code}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Recipient</span>
                    <span>{summary.giftCard.recipient_name || "Not specified"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Email</span>
                    <span>{summary.giftCard.recipient_email || "Not specified"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-[color:var(--wasatch-gray)]">
                    <span>Remaining Balance</span>
                    <span>${(summary.giftCard.remaining_amount / 100).toFixed(2)}</span>
                  </div>
                </div>

                {summary.giftCard.message ? (
                  <div className="rounded-2xl bg-white border border-[color:var(--wasatch-gray)]/30 p-4">
                    <p className="text-sm text-[color:var(--wasatch-gray)] whitespace-pre-wrap">{summary.giftCard.message}</p>
                  </div>
                ) : null}

                {summary.confirmationEmailSentAt ? (
                  <p className="text-sm text-[color:var(--wasatch-blue)]">
                    The gift card email was sent to the recipient and purchaser email on file.
                  </p>
                ) : null}
              </div>
            </Card>

            <Card>
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Link href="/gift-cards">
                  <Button variant="primary">Buy Another Gift Card</Button>
                </Link>
                <Link href="/events">
                  <Button variant="outline">Back to Events</Button>
                </Link>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}