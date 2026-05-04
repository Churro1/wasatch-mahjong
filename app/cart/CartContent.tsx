"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { User } from "@supabase/supabase-js";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";

type CartEvent = {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  event_type: "open_play" | "class" | "custom" | null;
  price: number;
  spots_remaining: number | null;
  capacity: number | null;
};

type CartOrderAttendee = {
  id?: string;
  full_name: string;
  email: string;
  phone?: string;
  is_buyer: boolean;
};

type CheckoutOrderRow = {
  id: string;
  event_id: string;
  status: string;
  subtotal_amount: number;
  total_amount: number;
  checkout_order_attendees:
    | Array<{
        id: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        is_buyer: boolean;
      }>
    | null;
};

type AppliedCoupon = {
  code: string;
  discountType: "dollar" | "percentage" | "bogo";
  discountValue: number;
  bogoBuyQuantity?: number;
  bogoGetQuantity?: number;
};

type AppliedGiftCard = {
  code: string;
  remainingAmount: number;
  availableAmount: number;
  appliedAmount: number;
  currency: string;
};

const MAX_ATTENDEES = 4;

function toCartTypeLabel(type: CartEvent["event_type"]): string {
  if (type === "class") {
    return "Class";
  }
  if (type === "open_play") {
    return "Open Play";
  }
  return "Custom";
}

function getBuyerDefaultName(user: User | null): string {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim().length > 0) {
    return fullName.trim();
  }

  const email = user?.email || "";
  if (email.includes("@")) {
    return email.split("@")[0];
  }

  return "";
}

export default function CartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const offerToken = searchParams.get("offer");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [event, setEvent] = useState<CartEvent | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<CartOrderAttendee[]>([]);
  const [removedAttendeeIds, setRemovedAttendeeIds] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardError, setGiftCardError] = useState("");
  const [applyingGiftCard, setApplyingGiftCard] = useState(false);
  const [appliedGiftCard, setAppliedGiftCard] = useState<AppliedGiftCard | null>(null);

  const cartPath = useMemo(() => {
    if (!eventId) {
      return "/cart";
    }
    return `/cart?eventId=${encodeURIComponent(eventId)}${
      offerToken ? `&offer=${encodeURIComponent(offerToken)}` : ""
    }`;
  }, [eventId, offerToken]);

  const attendeeLimit = useMemo(() => {
    if (offerToken) {
      return 1;
    }

    if (!event) {
      return 1;
    }
    const remaining = typeof event.spots_remaining === "number" ? event.spots_remaining : MAX_ATTENDEES;
    return Math.max(1, Math.min(MAX_ATTENDEES, remaining));
  }, [event, offerToken]);

  const subtotal = useMemo(() => {
    if (!event) {
      return 0;
    }
    return attendees.length * event.price;
  }, [attendees.length, event]);

  const discountAmount = useMemo(() => {
    if (!event || !appliedCoupon || attendees.length <= 0) {
      return 0;
    }

    if (appliedCoupon.discountType === "dollar") {
      return Math.min(subtotal, appliedCoupon.discountValue);
    }

    if (appliedCoupon.discountType === "percentage") {
      return Math.min(subtotal, subtotal * (appliedCoupon.discountValue / 100));
    }

    const buyQty = appliedCoupon.bogoBuyQuantity || 1;
    const getQty = appliedCoupon.bogoGetQuantity || 1;
    const groupSize = buyQty + getQty;
    if (groupSize <= 0) {
      return 0;
    }

    const fullGroups = Math.floor(attendees.length / groupSize);
    const remainder = attendees.length % groupSize;
    const freeSpots = fullGroups * getQty + Math.max(0, remainder - buyQty);
    const boundedFreeSpots = Math.min(freeSpots, attendees.length);
    return Math.min(subtotal, boundedFreeSpots * event.price);
  }, [appliedCoupon, attendees.length, event, subtotal]);

  const totalAfterCoupon = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [discountAmount, subtotal]);

  const giftCardAmount = useMemo(() => {
    if (!appliedGiftCard || totalAfterCoupon <= 0) {
      return 0;
    }

    return Math.min(totalAfterCoupon, appliedGiftCard.availableAmount);
  }, [appliedGiftCard, totalAfterCoupon]);

  const totalAfterDiscount = useMemo(() => {
    return Math.max(0, totalAfterCoupon - giftCardAmount);
  }, [giftCardAmount, totalAfterCoupon]);

  useEffect(() => {
    async function loadCart() {
      if (!eventId) {
        setError("Missing event selection. Please choose an event first.");
        setLoading(false);
        return;
      }

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push(`/login?next=${encodeURIComponent(cartPath)}`);
        return;
      }
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_type, price, spots_remaining, capacity")
        .eq("id", eventId)
        .single();

      if (eventError || !eventData) {
        setError("We could not find this event. Please return to Events and try again.");
        setLoading(false);
        return;
      }

      const normalizedEvent = {
        ...eventData,
        price: Number(eventData.price),
      } as CartEvent;

      if (
        typeof normalizedEvent.spots_remaining === "number" &&
        normalizedEvent.spots_remaining <= 0 &&
        !offerToken
      ) {
        setError("This event is currently full.");
        setEvent(normalizedEvent);
        setLoading(false);
        return;
      }

      setEvent(normalizedEvent);

        // Check if user is already signed up for this event
        const { data: existingSignups, error: signupCheckError } = await supabase
          .from("signups")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("event_id", eventId)
          .eq("signup_status", "active")
          .limit(1);

        if (!signupCheckError && existingSignups && existingSignups.length > 0) {
          setError("You are already signed up for this event. View your booking in the dashboard.");
          setEvent(normalizedEvent);
          setLoading(false);
          return;
        }

      const { data: orderData, error: orderError } = await supabase
        .from("checkout_orders")
        .select(
          "id, event_id, status, subtotal_amount, total_amount, checkout_order_attendees(id, full_name, email, phone, is_buyer)"
        )
        .eq("buyer_user_id", currentUser.id)
        .eq("event_id", eventId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderError) {
        setError(orderError.message);
        setLoading(false);
        return;
      }

      if (orderData) {
        const existingOrder = orderData as CheckoutOrderRow;
        setOrderId(existingOrder.id);
        const loadedAttendees = (existingOrder.checkout_order_attendees || []).map((attendee) => ({
          id: attendee.id,
          full_name: attendee.full_name,
          phone: attendee.phone || "",
          email: attendee.email || "",
          is_buyer: attendee.is_buyer,
        }));

        setAttendees(
          loadedAttendees.length > 0
            ? loadedAttendees
            : [
                {
                  full_name: getBuyerDefaultName(currentUser),
                  email: currentUser.email || "",
                  is_buyer: true,
                },
              ]
        );
        setLoading(false);
        return;
      }

      const { data: createdOrder, error: createOrderError } = await supabase
        .from("checkout_orders")
        .insert({
          buyer_user_id: currentUser.id,
          event_id: eventId,
          status: "draft",
          subtotal_amount: Math.round(normalizedEvent.price * 100),
          total_amount: Math.round(normalizedEvent.price * 100),
        })
        .select("id")
        .single();

      if (createOrderError || !createdOrder) {
        setError(createOrderError?.message || "We could not create a cart for this event.");
        setLoading(false);
        return;
      }

      const buyerAttendee = {
        full_name: getBuyerDefaultName(currentUser),
        email: currentUser.email || "",
        is_buyer: true,
      };

      const { data: createdAttendee, error: attendeeError } = await supabase
        .from("checkout_order_attendees")
        .insert({
          order_id: createdOrder.id,
          full_name: buyerAttendee.full_name || "Buyer",
          phone: null,
          is_buyer: true,
        })
        .select("id, full_name, email, phone, is_buyer")
        .single();

      if (attendeeError || !createdAttendee) {
        setError(attendeeError?.message || "We could not create the buyer attendee record.");
        setLoading(false);
        return;
      }

      setOrderId(createdOrder.id);
      setAttendees([
        {
          id: createdAttendee.id,
          full_name: createdAttendee.full_name,
          email: createdAttendee.email || "",
          phone: createdAttendee.phone || "",
          is_buyer: createdAttendee.is_buyer,
        },
      ]);
      setLoading(false);
    }

    loadCart();
  }, [cartPath, eventId, offerToken, router]);

  const handleAttendeeChange = (index: number, field: "full_name" | "email" | "phone", value: string) => {
    setAttendees((current) =>
      current.map((attendee, attendeeIndex) =>
        attendeeIndex === index ? { ...attendee, [field]: value } : attendee
      )
    );
  };

  const handleAddAttendee = () => {
    if (attendees.length >= attendeeLimit) {
      return;
    }

    setAttendees((current) => [
      ...current,
      {
        full_name: "",
        email: "",
        is_buyer: false,
      },
    ]);
  };

  const handleRemoveAttendee = (index: number) => {
    setAttendees((current) => {
      const attendeeToRemove = current[index];
      if (attendeeToRemove?.id) {
        setRemovedAttendeeIds((existing) => [...existing, attendeeToRemove.id as string]);
      }
      return current.filter((_, attendeeIndex) => attendeeIndex !== index);
    });
  };

  const handleApplyCoupon = async () => {
    const normalizedCode = couponCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCouponError("Please enter a coupon code.");
      return;
    }

    if (!event || attendees.length <= 0) {
      setCouponError("Add at least one attendee before applying a coupon.");
      return;
    }

    setApplyingCoupon(true);
    setCouponError("");

    try {
      const response = await fetch("/api/checkout/validate-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          couponCode: normalizedCode,
          eventPrice: subtotal,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        coupon?: {
          code: string;
          discountType: "dollar" | "percentage" | "bogo";
          discountValue: number;
          bogoBuyQuantity?: number;
          bogoGetQuantity?: number;
        };
      };

      if (!response.ok || !payload.coupon) {
        setCouponError(payload.error || "Unable to apply this coupon.");
        setAppliedCoupon(null);
        setApplyingCoupon(false);
        return;
      }

      setAppliedCoupon(payload.coupon);
      setCouponCode(payload.coupon.code);
      setCouponError("");
      setStatusMessage("Coupon applied.");
    } catch {
      setCouponError("We could not validate that coupon. Please try again.");
      setAppliedCoupon(null);
    }

    setApplyingCoupon(false);
  };

  const handleApplyGiftCard = async () => {
    const normalizedCode = giftCardCode.trim().toUpperCase();
    if (!normalizedCode) {
      setGiftCardError("Please enter a gift card code.");
      return;
    }

    if (!event || attendees.length <= 0) {
      setGiftCardError("Add at least one attendee before applying a gift card.");
      return;
    }

    setApplyingGiftCard(true);
    setGiftCardError("");

    try {
      const response = await fetch("/api/checkout/validate-gift-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          giftCardCode: normalizedCode,
          orderTotal: totalAfterCoupon,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        giftCard?: {
          code: string;
          remainingAmount: number;
          availableAmount: number;
          appliedAmount: number;
          currency: string;
        };
      };

      if (!response.ok || !payload.giftCard) {
        setGiftCardError(payload.error || "Unable to apply this gift card.");
        setAppliedGiftCard(null);
        setApplyingGiftCard(false);
        return;
      }

      setAppliedGiftCard(payload.giftCard);
      setGiftCardCode(payload.giftCard.code);
      setGiftCardError("");
      setStatusMessage("Gift card applied.");
    } catch {
      setGiftCardError("We could not validate that gift card. Please try again.");
      setAppliedGiftCard(null);
    }

    setApplyingGiftCard(false);
  };

  const handleRemoveGiftCard = () => {
    setAppliedGiftCard(null);
    setGiftCardCode("");
    setGiftCardError("");
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const handleSaveCart = async (): Promise<boolean> => {
    if (!orderId || !event) {
      return false;
    }

    if (attendees.length === 0) {
      setError("Add at least one attendee.");
      return false;
    }

    if (attendees.length > attendeeLimit) {
      setError(`You can only register ${attendeeLimit} attendee(s) for this event right now.`);
      return false;
    }

    const trimmedAttendees = attendees.map((attendee) => ({
      ...attendee,
      full_name: attendee.full_name.trim(),
      email: attendee.email.trim(),
    }));

    if (trimmedAttendees.some((attendee) => attendee.full_name.length === 0)) {
      setError("Each attendee must have a name.");
      return false;
    }

    if (!trimmedAttendees.some((attendee) => attendee.is_buyer)) {
      setError("The buyer must be included as one attendee.");
      return false;
    }

    const buyer = trimmedAttendees.find((attendee) => attendee.is_buyer);
    if (!buyer || !buyer.phone || buyer.phone.trim().length === 0) {
      setError("The buyer must provide a phone number.");
      return false;
    }

    if (!buyer.email || buyer.email.trim().length === 0) {
      setError("The buyer must provide an email address.");
      return false;
    }

    setSaving(true);
    setError("");
    setStatusMessage("");

    if (removedAttendeeIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("checkout_order_attendees")
        .delete()
        .in("id", removedAttendeeIds);

      if (deleteError) {
        setError(deleteError.message);
        setSaving(false);
        return false;
      }
    }

    for (const attendee of trimmedAttendees) {
      if (attendee.id) {
        const { error: updateError } = await supabase
          .from("checkout_order_attendees")
          .update({
            full_name: attendee.full_name,
            email: attendee.email || null,
            phone: attendee.is_buyer ? attendee.phone || null : null,
            is_buyer: attendee.is_buyer,
          })
          .eq("id", attendee.id);

        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return false;
        }
      } else {
        const { data: insertedAttendee, error: insertError } = await supabase
          .from("checkout_order_attendees")
          .insert({
            order_id: orderId,
            full_name: attendee.full_name,
            phone: attendee.is_buyer ? attendee.phone || null : null,
            email: attendee.email || null,
            is_buyer: attendee.is_buyer,
          })
          .select("id")
          .single();

        if (insertError || !insertedAttendee) {
          setError(insertError?.message || "We could not save one of the attendees.");
          setSaving(false);
          return false;
        }

        attendee.id = insertedAttendee.id;
      }
    }

    const nextTotal = Math.round(event.price * trimmedAttendees.length * 100);
    const { error: orderUpdateError } = await supabase
      .from("checkout_orders")
      .update({
        subtotal_amount: nextTotal,
        total_amount: nextTotal,
      })
      .eq("id", orderId);

    if (orderUpdateError) {
      setError(orderUpdateError.message);
      setSaving(false);
      return false;
    }

    setAttendees([...trimmedAttendees]);
    setRemovedAttendeeIds([]);
    setStatusMessage(
      totalAfterDiscount > 0
        ? "Cart saved. Stripe checkout is the next step."
        : "Cart saved. You can finish signup without payment."
    );
    setSaving(false);
    return true;
  };

  const handleCheckout = async () => {
    if (!orderId) {
      return;
    }

    const saveSucceeded = await handleSaveCart();
    if (!saveSucceeded) {
      return;
    }

    setRedirectingToCheckout(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      router.push(`/login?next=${encodeURIComponent(cartPath)}`);
      setRedirectingToCheckout(false);
      return;
    }

    const response = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        orderId,
        offerToken: offerToken || undefined,
        couponCode: appliedCoupon?.code || undefined,
        giftCardCode: appliedGiftCard?.code || undefined,
      }),
    });

    const responseText = await response.text();
    let payload: { url?: string; error?: string } = {};

    if (responseText) {
      try {
        payload = JSON.parse(responseText) as { url?: string; error?: string };
      } catch {
        payload = { error: "Stripe Checkout returned an unreadable response." };
      }
    }

    if (!response.ok || !payload.url) {
      setError(payload.error || "We could not start Stripe Checkout.");
      setRedirectingToCheckout(false);
      return;
    }

    window.location.href = payload.url;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Card>
            <p className="text-[color:var(--wasatch-gray)] text-center">Loading your cart...</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)] text-center mb-2">
            Cart
          </h1>
          <p className="text-[color:var(--wasatch-gray)] text-center">
            Add the attendees for this event before checkout.
          </p>
        </div>

        {error ? (
          <Card>
            <p className="text-[color:var(--wasatch-red)] font-medium mb-4">{error}</p>
            <Link href="/events">
              <Button variant="outline">Back to Events</Button>
            </Link>
          </Card>
        ) : null}

        {event ? (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Attendees</h2>

              <div className="space-y-4">
                {attendees.map((attendee, index) => (
                  <div key={attendee.id || `attendee-${index}`} className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-[color:var(--wasatch-blue)]">
                          {attendee.is_buyer ? "Buyer" : `Guest ${index + 1}`}
                        </p>
                        <p className="text-xs text-[color:var(--wasatch-gray)]">
                          {attendee.is_buyer ? "This attendee must stay on the order." : "Optional attendee email."}
                        </p>
                      </div>
                      {!attendee.is_buyer ? (
                        <Button variant="outline" onClick={() => handleRemoveAttendee(index)}>
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label htmlFor={`attendee-${index}-full-name`} className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Full Name</label>
                        <input
                          id={`attendee-${index}-full-name`}
                          name={`attendee-${index}-full-name`}
                          type="text"
                          value={attendee.full_name}
                          onChange={(e) => handleAttendeeChange(index, "full_name", e.target.value)}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor={`attendee-${index}-email`} className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Email (Required)</label>
                        <input
                          id={`attendee-${index}-email`}
                          name={`attendee-${index}-email`}
                          type="email"
                          value={attendee.email}
                          onChange={(e) => handleAttendeeChange(index, "email", e.target.value)}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                        />
                      </div>

                      {attendee.is_buyer ? (
                        <div>
                          <label htmlFor={`attendee-${index}-phone`} className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                            Phone <span className="text-[color:var(--wasatch-red)]">*</span>
                          </label>
                          <input
                            id={`attendee-${index}-phone`}
                            name={`attendee-${index}-phone`}
                            type="tel"
                            value={attendee.phone || ""}
                            onChange={(e) => handleAttendeeChange(index, "phone", e.target.value)}
                            className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            required
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

                <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3 mt-4 mb-4">
                  <p className="text-sm text-blue-900">
                    <strong>Important:</strong> Only the buyer (person making payment) needs to provide a phone number. Additional attendees can be listed without contact information.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleAddAttendee}
                  disabled={attendees.length >= attendeeLimit}
                >
                  Add Attendee
                </Button>
                <Button variant="secondary" onClick={handleSaveCart} disabled={saving}>
                  {saving ? "Saving..." : "Save Cart"}
                </Button>
              </div>

              <p className="text-xs text-[color:var(--wasatch-gray)] mt-3">
                Maximum {attendeeLimit} attendee(s) for this event. The buyer must be one of them.
              </p>
              {offerToken ? (
                <p className="text-xs text-[color:var(--wasatch-blue)] mt-2">
                  This cart is tied to a private waitlist offer and can be used for one seat only.
                </p>
              ) : null}
              {statusMessage ? <p className="text-sm text-[color:var(--wasatch-blue)] mt-3">{statusMessage}</p> : null}
            </Card>

            <Card>
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Order Summary</h2>

              <div className="space-y-3 text-[color:var(--wasatch-gray)]">
                <div>
                  <p className="font-semibold text-[color:var(--wasatch-blue)]">{event.name}</p>
                  <p className="text-sm">
                    {format(parseISO(event.event_date), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                  <p className="text-sm">{toCartTypeLabel(event.event_type)}</p>
                </div>

                <div className="rounded-2xl bg-white border border-[color:var(--wasatch-gray)]/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Attendees</span>
                    <span>{attendees.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Price Per Person</span>
                    <span>${event.price.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Spots Remaining</span>
                    <span>{event.spots_remaining ?? "-"}</span>
                  </div>
                  {appliedCoupon || appliedGiftCard ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>
                    </>
                  ) : null}
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between text-green-700">
                      <span>Coupon ({appliedCoupon.code})</span>
                      <span>- ${discountAmount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  {appliedGiftCard ? (
                    <div className="flex items-center justify-between text-green-700">
                      <span>Gift Card ({appliedGiftCard.code})</span>
                      <span>- ${giftCardAmount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-lg font-semibold text-[color:var(--wasatch-blue)] pt-2">
                    <span>Total</span>
                    <span>${totalAfterDiscount.toFixed(2)}</span>
                  </div>
                </div>

                {event.description ? <p className="text-sm leading-6">{event.description}</p> : null}

                <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 space-y-2">
                  <label htmlFor="cart-coupon-code" className="block text-sm font-medium text-[color:var(--wasatch-gray)]">
                    Coupon Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="cart-coupon-code"
                      name="cartCouponCode"
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError("");
                      }}
                      placeholder="Enter code"
                      className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                      maxLength={20}
                      disabled={applyingCoupon}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyCoupon}
                      disabled={applyingCoupon || !couponCode.trim()}
                    >
                      {applyingCoupon ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between text-sm text-green-700">
                      <span>Applied: {appliedCoupon.code}</span>
                      <button type="button" onClick={handleRemoveCoupon} className="underline">
                        Remove
                      </button>
                    </div>
                  ) : null}
                  {couponError ? <p className="text-sm text-[color:var(--wasatch-red)]">{couponError}</p> : null}
                </div>

                <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 space-y-2">
                  <label htmlFor="cart-gift-card-code" className="block text-sm font-medium text-[color:var(--wasatch-gray)]">
                    Gift Card Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="cart-gift-card-code"
                      name="cartGiftCardCode"
                      type="text"
                      value={giftCardCode}
                      onChange={(e) => {
                        setGiftCardCode(e.target.value.toUpperCase());
                        setGiftCardError("");
                      }}
                      placeholder="Enter gift card code"
                      className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                      maxLength={24}
                      disabled={applyingGiftCard}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyGiftCard}
                      disabled={applyingGiftCard || !giftCardCode.trim()}
                    >
                      {applyingGiftCard ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                  {appliedGiftCard ? (
                    <div className="flex items-center justify-between text-sm text-green-700">
                      <span>Applied: {appliedGiftCard.code}</span>
                      <button type="button" onClick={handleRemoveGiftCard} className="underline">
                        Remove
                      </button>
                    </div>
                  ) : null}
                  {giftCardError ? <p className="text-sm text-[color:var(--wasatch-red)]">{giftCardError}</p> : null}
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <Button variant="primary" onClick={handleCheckout} disabled={saving || redirectingToCheckout}>
                    {saving || redirectingToCheckout
                      ? totalAfterDiscount > 0
                        ? "Preparing Checkout..."
                        : "Finalizing Signup..."
                      : totalAfterDiscount > 0
                        ? "Continue to Checkout"
                        : "Complete Signup"}
                  </Button>
                  <Link href="/events">
                    <Button variant="outline" className="w-full">Back to Events</Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}