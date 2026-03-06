"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

const faqs = [
  {
    question: "Where do I park for events?",
    answer:
      "Free parking is available onsite. If the main lot is full, overflow parking is available nearby.",
  },
  {
    question: "Do I need to bring Mahjong tiles?",
    answer:
      "No. We provide tiles, racks, and game materials. You are welcome to bring your own card or accessories.",
  },
  {
    question: "What is your cancellation policy?",
    answer:
      "Please cancel at least 24 hours in advance from your dashboard for the best chance of a refund based on our policy.",
  },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setStatus("");

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });

    if (!response.ok) {
      setStatus("We could not send your message. Please try again.");
      setLoading(false);
      return;
    }

    setStatus("Thanks! Your message has been sent.");
    setName("");
    setEmail("");
    setMessage("");
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-2">
        <Card>
          <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] mb-3">
            Contact Us
          </h1>
          <p className="text-[color:var(--wasatch-gray)] mb-6">
            Questions about classes, open play, or your booking? Send us a message.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                required
              />
            </div>

            {status ? <p className="text-sm text-[color:var(--wasatch-blue)]">{status}</p> : null}

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send Message"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-blue)] mb-4">FAQ</h2>
          <div className="space-y-3">
            {faqs.map((item) => (
              <details
                key={item.question}
                className="rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-3"
              >
                <summary className="cursor-pointer font-medium text-[color:var(--wasatch-red)]">
                  {item.question}
                </summary>
                <p className="mt-2 text-sm text-[color:var(--wasatch-gray)]">{item.answer}</p>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}