"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

export default function GiftCardsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("50");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?next=${encodeURIComponent("/gift-cards")}`);
        return;
      }

      setLoading(false);
    }

    void loadUser();
  }, [router]);

  const handlePurchase = async () => {
    const parsedAmount = Math.round(Number(amount) * 100);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a gift card amount greater than zero.");
      return;
    }

    setSubmitting(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      router.push(`/login?next=${encodeURIComponent("/gift-cards")}`);
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/gift-cards/create-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        amount: parsedAmount,
        recipientName,
        recipientEmail,
        message,
      }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.url) {
      setError(payload.error || "We could not start gift card checkout.");
      setSubmitting(false);
      return;
    }

    window.location.href = payload.url;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <Card>
            <p className="text-[color:var(--wasatch-gray)] text-center">Loading gift cards...</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)]">Gift Cards</h1>
          <p className="text-[color:var(--wasatch-gray)]">
            Send a Wasatch Mahjong gift card to someone who loves the game, or keep it for a future booking.
          </p>
        </div>

        {error ? (
          <Card>
            <p className="text-[color:var(--wasatch-red)] font-medium">{error}</p>
          </Card>
        ) : null}

        <Card>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-amount">
                Amount
              </label>
              <input
                id="gift-card-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-recipient-name">
                Recipient Name
              </label>
              <input
                id="gift-card-recipient-name"
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-recipient-email">
                Recipient Email
              </label>
              <input
                id="gift-card-recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-message">
                Message
              </label>
              <textarea
                id="gift-card-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-28 w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                placeholder="Optional note for the recipient"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={handlePurchase} disabled={submitting}>
                {submitting ? "Redirecting to Checkout..." : "Buy Gift Card"}
              </Button>
              <Link href="/events">
                <Button variant="outline">Back to Events</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}