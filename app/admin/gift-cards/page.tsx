"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

type GiftCardRow = {
  id: string;
  code: string;
  displayCode: string;
  original_amount: number;
  remaining_amount: number;
  status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  expires_at: string | null;
  email_sent_at: string | null;
  issued_at: string;
};

export default function AdminGiftCardsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [recentGiftCards, setRecentGiftCards] = useState<GiftCardRow[]>([]);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("50");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    async function loadGiftCards() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        router.push("/login");
        return;
      }

      const response = await fetch("/api/admin/gift-cards", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Unable to load gift cards.");
        setLoading(false);
        return;
      }

      setRecentGiftCards(payload.giftCards || []);
      setLoading(false);
    }

    void loadGiftCards();
  }, [router]);

  const handleCreateGiftCard = async () => {
    const parsedAmount = Math.round(Number(amount) * 100);

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a gift card amount greater than zero.");
      return;
    }

    setSubmitting(true);
    setError("");
    setStatusMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      router.push("/login");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/admin/gift-cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        code: code.trim(),
        amount: parsedAmount,
        recipientName,
        recipientEmail,
        message,
        expiryDate: expiryDate || null,
        sendEmail,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "Failed to create gift card.");
      setSubmitting(false);
      return;
    }

    setStatusMessage(`Gift card created: ${payload.giftCard.displayCode}`);
    setCode("");
    setAmount("50");
    setRecipientName("");
    setRecipientEmail("");
    setMessage("");
    setExpiryDate("");
    await refreshGiftCards();
    setSubmitting(false);
  };

  const refreshGiftCards = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      return;
    }

    const response = await fetch("/api/admin/gift-cards", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    setRecentGiftCards(payload.giftCards || []);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Card>
            <p className="text-[color:var(--wasatch-gray)] text-center">Loading gift card manager...</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)]">Gift Card Manager</h1>
            <p className="text-[color:var(--wasatch-gray)] mt-1">Issue gift cards directly from the admin dashboard.</p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Back to Admin</Button>
          </Link>
        </div>

        {error ? (
          <Card>
            <p className="text-[color:var(--wasatch-red)] font-medium">{error}</p>
          </Card>
        ) : null}

        {statusMessage ? (
          <Card>
            <p className="text-[color:var(--wasatch-blue)] font-medium">{statusMessage}</p>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Create Gift Card</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-code">
                  Custom Code
                </label>
                <input
                  id="gift-card-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-amount-admin">
                  Amount
                </label>
                <input
                  id="gift-card-amount-admin"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-recipient-name-admin">
                  Recipient Name
                </label>
                <input
                  id="gift-card-recipient-name-admin"
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-recipient-email-admin">
                  Recipient Email
                </label>
                <input
                  id="gift-card-recipient-email-admin"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-message-admin">
                  Message
                </label>
                <textarea
                  id="gift-card-message-admin"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-28 w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="Optional note"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1" htmlFor="gift-card-expiry-admin">
                  Expiry Date
                </label>
                <input
                  id="gift-card-expiry-admin"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[color:var(--wasatch-gray)]">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                Send delivery email if an email address is present
              </label>

              <Button variant="primary" onClick={handleCreateGiftCard} disabled={submitting}>
                {submitting ? "Creating..." : "Create Gift Card"}
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Recent Gift Cards</h2>
            <div className="space-y-3">
              {recentGiftCards.length > 0 ? (
                recentGiftCards.map((giftCard) => (
                  <div key={giftCard.id} className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-[color:var(--wasatch-blue)]">{giftCard.displayCode}</p>
                      <span className="text-xs uppercase tracking-wide text-[color:var(--wasatch-gray)]">{giftCard.status}</span>
                    </div>
                    <p className="text-sm text-[color:var(--wasatch-gray)]">
                      ${ (giftCard.original_amount / 100).toFixed(2) } remaining ${ (giftCard.remaining_amount / 100).toFixed(2) }
                    </p>
                    <p className="text-sm text-[color:var(--wasatch-gray)]">
                      {giftCard.recipient_name || "No recipient"}
                      {giftCard.recipient_email ? ` · ${giftCard.recipient_email}` : ""}
                    </p>
                    {giftCard.message ? <p className="text-sm text-[color:var(--wasatch-gray)] whitespace-pre-wrap">{giftCard.message}</p> : null}
                  </div>
                ))
              ) : (
                <p className="text-[color:var(--wasatch-gray)]">No gift cards have been issued yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}