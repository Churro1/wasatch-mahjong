"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";
import { PASS_PRODUCTS } from "@/lib/passes";

export default function PassesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?next=${encodeURIComponent("/passes")}`);
        return;
      }

      setLoading(false);
    }

    void loadUser();
  }, [router]);

  const handlePurchase = async (passSlug: string) => {
    setSubmitting(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      router.push(`/login?next=${encodeURIComponent("/passes")}`);
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/passes/create-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ passSlug }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.url) {
      setError(payload.error || "We could not start pass checkout.");
      setSubmitting(false);
      return;
    }

    window.location.href = payload.url;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Card>
            <p className="text-[color:var(--wasatch-gray)] text-center">Loading passes...</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--wasatch-blue)]">Passes</p>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-[color:var(--wasatch-blue)]">One pass now, a full catalog later</h1>
          <p className="text-[color:var(--wasatch-gray)] text-base md:text-lg leading-7">
            The Social Six Pass is built as an entitlement, not a discount code. That keeps the rules simple: it belongs to one person, it applies to open play only, and it can be expanded into more pass types later.
          </p>
        </div>

        {error ? (
          <Card>
            <p className="text-[color:var(--wasatch-red)] font-medium">{error}</p>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--wasatch-red)]">Featured Pass</p>
                <h2 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] mt-2">{PASS_PRODUCTS[0].name}</h2>
                <p className="text-[color:var(--wasatch-gray)] mt-3 leading-7">{PASS_PRODUCTS[0].shortDescription}</p>
              </div>

              <div className="rounded-3xl bg-[linear-gradient(135deg,rgba(178,31,45,0.08),rgba(34,84,117,0.08))] border border-[color:var(--wasatch-gray)]/20 p-5 space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-[color:var(--wasatch-gray)]">Price</p>
                    <p className="font-serif text-4xl font-bold text-[color:var(--wasatch-red)]">$100</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[color:var(--wasatch-gray)]">Includes</p>
                    <p className="font-semibold text-[color:var(--wasatch-blue)]">6 open play nights</p>
                  </div>
                </div>

                <ul className="grid gap-3 md:grid-cols-2 text-sm text-[color:var(--wasatch-gray)]">
                  {PASS_PRODUCTS[0].benefits.map((benefit) => (
                    <li key={benefit} className="rounded-2xl bg-white/80 border border-[color:var(--wasatch-gray)]/20 px-4 py-3">
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3 text-[color:var(--wasatch-gray)] leading-7">
                <p>This pass is for the holder only. They can use it to register themselves for six open play nights.</p>
                <p>Guests are not included, so the booking flow should only allow one attendee when a pass is applied.</p>
                <p>When you add more pass options later, they can live on this same page and use the same checkout and entitlement model.</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={() => void handlePurchase(PASS_PRODUCTS[0].slug)} disabled={submitting}>
                  {submitting ? "Redirecting to Checkout..." : "Buy Social Six Pass"}
                </Button>
                <Link href="/events">
                  <Button variant="outline">Back to Events</Button>
                </Link>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <h3 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-3">How it should work</h3>
              <div className="space-y-3 text-[color:var(--wasatch-gray)] leading-7">
                <p>Buy the pass once.</p>
                <p>Attach it to the buyer&apos;s account.</p>
                <p>Require one attendee only when it&apos;s used on an open play booking.</p>
                <p>Decrement the remaining uses after each confirmed sign-up.</p>
              </div>
            </Card>

            <Card>
              <h3 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-3">Built for expansion</h3>
              <p className="text-[color:var(--wasatch-gray)] leading-7">
                This page is catalog-driven, so adding a second or third pass later should be a content update instead of a rewrite.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}