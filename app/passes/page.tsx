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
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setIsAuthenticated(!!user);
      setLoading(false);
    }

    void checkUser();
  }, []);

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

    window.location.assign(payload.url);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[color:var(--wasatch-blue)] border-t-transparent rounded-full animate-spin"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--wasatch-blue)]">Passes</p>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-[color:var(--wasatch-blue)]">Play More, Save More</h1>
          <p className="text-[color:var(--wasatch-gray)] text-base md:text-lg leading-relaxed">
            Purchase a pass to lock in your open play nights at a discounted rate. Passes make checkout a breeze and you&apos;ll get an open play for free!
          </p>
        </div>

        {error ? (
          <div className="max-w-3xl mx-auto">
            <Card>
              <p className="text-[color:var(--wasatch-red)] font-medium text-center">{error}</p>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-8 max-w-3xl mx-auto">
          {PASS_PRODUCTS.map((pass) => (
            <Card key={pass.slug}>
              <div className="space-y-6">
                <div>
                  <h2 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] mt-2">{pass.name}</h2>
                  <p className="text-[color:var(--wasatch-gray)] mt-3 leading-relaxed text-lg">{pass.shortDescription}</p>
                </div>

                <div className="rounded-3xl bg-[linear-gradient(135deg,rgba(178,31,45,0.08),rgba(34,84,117,0.08))] border border-[color:var(--wasatch-gray)]/20 p-6 space-y-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[color:var(--wasatch-gray)] uppercase tracking-wider mb-1">Price</p>
                      <p className="font-serif text-5xl font-bold text-[color:var(--wasatch-red)]">${(pass.priceCents / 100).toFixed(0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[color:var(--wasatch-gray)] uppercase tracking-wider mb-1">Includes</p>
                      <p className="font-semibold text-lg text-[color:var(--wasatch-blue)]">{pass.totalUses} open play nights</p>
                    </div>
                  </div>

                  <ul className="grid gap-3 md:grid-cols-2 text-sm text-[color:var(--wasatch-gray)]">
                    {pass.benefits.map((benefit) => (
                      <li key={benefit} className="rounded-2xl bg-white/80 border border-[color:var(--wasatch-gray)]/20 px-4 py-3 flex items-center gap-3">
                        <svg className="w-5 h-5 text-[color:var(--wasatch-blue)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Button variant="primary" onClick={() => void handlePurchase(pass.slug)} disabled={submitting} className="w-full sm:w-auto text-lg px-8 py-3">
                    {submitting ? "Redirecting..." : isAuthenticated ? `Buy ${pass.name}` : "Log in to Purchase"}
                  </Button>
                  <Link href="/events" className="w-full sm:w-auto">
                    <Button variant="outline" className="w-full text-lg px-8 py-3">Back to Events</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}