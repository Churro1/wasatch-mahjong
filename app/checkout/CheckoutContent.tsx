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
  event_type: "open_play" | "class" | "custom" | null;
  price: number;
  spots_remaining: number | null;
  capacity: number | null;
};

type AppliedCoupon = {
  code: string;
  discountType: string;
  discountValue: number;
  discountAmount: number;
};

function toCheckoutTypeLabel(type: CheckoutEvent["event_type"]): string {
  if (type === "class") {
    return "Class";
  }
  if (type === "open_play") {
    return "Open Play";
  }
  return "Custom";
}

export default function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [event, setEvent] = useState<CheckoutEvent | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

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
      if (Number.isNaN(normalizedPrice) || normalizedPrice < 0) {
        setError("This event has invalid pricing data. Please contact support.");
        setLoading(false);
        return;
      }

      setEvent({ ...data, price: normalizedPrice });
      setLoading(false);
    }

    loadCheckoutData();
  }, [checkoutPath, eventId, router]);

  const appliedDiscount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const finalPrice = event ? Math.max(0, event.price - appliedDiscount) : 0;

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError("Please enter a coupon code.");
      return;
    }

    setApplyingCoupon(true);
    setCouponError("");

    try {
      const response = await fetch("/api/checkout/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponCode: code,
          eventPrice: event?.price || 0,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setCouponError(payload.error || "Invalid coupon code.");
        setApplyingCoupon(false);
        return;
      }

      setAppliedCoupon(payload.coupon);
      setCouponError("");
    } catch {
      setCouponError("Failed to apply coupon. Please try again.");
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const handleContinue = () => {
    if (!eventId) {
      setError("Missing event selection. Please return to Events and try again.");
      return;
    }

    router.push(`/cart?eventId=${encodeURIComponent(eventId)}`);
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
                  {toCheckoutTypeLabel(event.event_type)}
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
                {appliedCoupon && (
                  <>
                    <div className="flex items-center justify-between text-[color:var(--wasatch-gray)]">
                      <span>Subtotal</span>
                      <span className="font-medium">${event.price}</span>
                    </div>
                    <div className="flex items-center justify-between text-[color:var(--wasatch-green)] font-medium">
                        <span>Coupon code</span>
                      <span>-${appliedCoupon.discountAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between text-lg border-t border-[color:var(--wasatch-gray)]/20 pt-2">
                  <span className="font-serif text-[color:var(--wasatch-blue)] font-bold">Total</span>
                  <span className={`font-serif font-bold ${
                    finalPrice === 0 ? "text-green-600" : "text-[color:var(--wasatch-red)]"
                  }`}>
                    ${finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              {!appliedCoupon ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value);
                        setCouponError("");
                      }}
                      maxLength={20}
                      disabled={applyingCoupon}
                      className="flex-1 rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyCoupon}
                      disabled={applyingCoupon || !couponCode.trim()}
                      className="whitespace-nowrap"
                    >
                      {applyingCoupon ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                  {couponError && <p className="text-xs text-[color:var(--wasatch-red)]">{couponError}</p>}
                </div>
              ) : (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-green-700">
                    ✓ Coupon applied successfully!
                  </p>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-sm text-green-600 hover:text-green-700 underline"
                  >
                    Remove
                  </button>
                </div>
              )}

              {event.description ? (
                <p className="text-[color:var(--wasatch-gray)] leading-7">{event.description}</p>
              ) : null}

              <p className="text-sm text-[color:var(--wasatch-gray)]">
                {finalPrice > 0
                  ? "Continue to cart to confirm attendees and complete payment in secure Stripe checkout."
                  : finalPrice === 0 && event.price > 0
                    ? "Your coupon covers this event! Continue to complete signup."
                    : "Continue to cart to confirm attendees and complete signup with no payment required."}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button
                  variant="primary"
                  onClick={handleContinue}
                  className="w-full sm:w-auto"
                >
                  Continue to Cart
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
