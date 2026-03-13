"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type EventSummary = {
  id: string;
  name: string;
  event_date: string;
  event_type: "open_play" | "class" | "custom" | null;
  price: number;
};

type OrderAttendee = {
  full_name: string;
  email: string | null;
  is_buyer: boolean;
};

type OrderRow = {
  id: string;
  total_amount: number;
  cancellation_fee_amount: number;
  events: EventSummary | EventSummary[] | null;
  checkout_order_attendees: OrderAttendee[] | null;
};

type UpcomingBooking = {
  orderId: string;
  title: string;
  eventDate: string;
  eventType: EventSummary["event_type"];
  totalAmount: number;
  cancellationFeeAmount: number;
  attendees: OrderAttendee[];
};

const CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;

function canSelfCancel(eventDate: string) {
  return parseISO(eventDate).getTime() - Date.now() >= CANCELLATION_NOTICE_MS;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([]);
  const [classLoadError, setClassLoadError] = useState("");
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
  const [cancelStatus, setCancelStatus] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const router = useRouter();

  const loadBookings = async (userId: string) => {
    const { data: orderData, error: orderError } = await supabase
      .from("checkout_orders")
      .select(
        "id, total_amount, cancellation_fee_amount, events(id, name, event_date, event_type, price), checkout_order_attendees(full_name, email, is_buyer)"
      )
      .eq("buyer_user_id", userId)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    if (orderError) {
      setClassLoadError("We could not load your bookings right now.");
      return;
    }

    const now = new Date();
    const bookings = (orderData as OrderRow[])
      .map((row) => {
        const event = Array.isArray(row.events) ? row.events[0] : row.events;
        if (!event) {
          return null;
        }

        const eventDate = parseISO(event.event_date);
        if (eventDate <= now) {
          return null;
        }

        return {
          orderId: row.id,
          title: event.name,
          eventDate: event.event_date,
          eventType: event.event_type,
          totalAmount: Number(row.total_amount),
          cancellationFeeAmount: Number(row.cancellation_fee_amount),
          attendees: row.checkout_order_attendees || [],
        };
      })
      .filter((item): item is UpcomingBooking => item !== null)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    setUpcomingBookings(bookings);
    setClassLoadError("");
  };

  useEffect(() => {
    const loadDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);
      setName((user.user_metadata?.full_name as string | undefined) || "");
      setEmail(user.email || "");

      await loadBookings(user.id);

      setLoading(false);
    };

    loadDashboard();
  }, [router]);

  const handleCancelOrder = async (orderId: string, eventDate: string) => {
    if (!canSelfCancel(eventDate)) {
      setCancelStatus("Online cancellations close within 24 hours of the event. Please contact Wasatch Mahjong for help.");
      return;
    }

    const confirmed = window.confirm(
      "Cancel this order? Eligible refunds are reduced by the $10 cancellation fee."
    );

    if (!confirmed) {
      return;
    }

    const reason = window.prompt("Optional cancellation note:", "")?.trim() || "";
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      router.push(`/login?next=${encodeURIComponent("/dashboard")}`);
      return;
    }

    setCancelLoadingId(orderId);
    setCancelStatus("");

    const response = await fetch("/api/checkout/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orderId, reason }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setCancelStatus(payload.error || "We could not cancel this order.");
      setCancelLoadingId(null);
      return;
    }

    if (user) {
      await loadBookings(user.id);
    }

    setCancelStatus(payload.message || "Order cancelled.");
    setCancelLoadingId(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    setProfileSaving(true);
    setProfileStatus("");

    const updates: { email?: string; data?: Record<string, unknown> } = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const currentName = (user.user_metadata?.full_name as string | undefined) || "";

    if (trimmedName !== currentName) {
      updates.data = {
        ...user.user_metadata,
        full_name: trimmedName,
      };
    }

    if (trimmedEmail && trimmedEmail !== user.email) {
      updates.email = trimmedEmail;
    }

    if (!updates.data && !updates.email) {
      setProfileStatus("No profile changes to save.");
      setProfileSaving(false);
      return;
    }

    const { error } = await supabase.auth.updateUser(updates);
    if (error) {
      setProfileStatus(error.message);
      setProfileSaving(false);
      return;
    }

    const {
      data: { user: refreshedUser },
    } = await supabase.auth.getUser();

    if (refreshedUser) {
      setUser(refreshedUser);
      setEmail(refreshedUser.email || "");
      setName((refreshedUser.user_metadata?.full_name as string | undefined) || "");
    }

    setProfileStatus(
      updates.email
        ? "Profile saved. Check your inbox to confirm your new email address."
        : "Profile saved successfully."
    );
    setProfileSaving(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      return;
    }

    setResetLoading(true);
    setResetMessage("");

    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${origin}/update-password`,
    });

    if (error) {
      setResetMessage(error.message);
      setResetLoading(false);
      return;
    }

    setResetMessage("Password reset email sent. Please check your inbox.");
    setResetLoading(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] flex items-center justify-center px-4">
        <p className="text-[color:var(--wasatch-gray)]">Loading your dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)]">My Dashboard</h1>
            <p className="text-[color:var(--wasatch-gray)] mt-1">Manage your profile and upcoming bookings.</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Profile</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                  placeholder="Your name"
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

              {profileStatus ? <p className="text-sm text-[color:var(--wasatch-blue)]">{profileStatus}</p> : null}

              <Button type="submit" variant="primary" disabled={profileSaving}>
                {profileSaving ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Password</h2>
            <p className="text-[color:var(--wasatch-gray)] mb-4">
              Send yourself a secure password reset email any time.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="secondary" onClick={handlePasswordReset} disabled={resetLoading || !user?.email}>
                {resetLoading ? "Sending..." : "Send Password Reset Email"}
              </Button>
              <Link href="/update-password" className="inline-flex">
                <Button variant="outline">Update Password Now</Button>
              </Link>
            </div>

            {resetMessage ? <p className="text-sm text-[color:var(--wasatch-blue)] mt-3">{resetMessage}</p> : null}
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)]">Upcoming Bookings</h2>
            <Link href="/events">
              <Button variant="outline">Book Another Event</Button>
            </Link>
          </div>

          {classLoadError ? <p className="text-sm text-[color:var(--wasatch-red)]">{classLoadError}</p> : null}
          {cancelStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mb-4">{cancelStatus}</p> : null}

          {!classLoadError && upcomingBookings.length === 0 ? (
            <p className="text-[color:var(--wasatch-gray)]">You do not have any upcoming bookings yet.</p>
          ) : null}

          {!classLoadError && upcomingBookings.length > 0 ? (
            <div className="space-y-3">
              {upcomingBookings.map((item) => {
                const refundPreview = Math.max(item.totalAmount - item.cancellationFeeAmount, 0);
                const eligibleForSelfCancellation = canSelfCancel(item.eventDate);

                return (
                <div
                  key={item.orderId}
                  className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white px-4 py-4 flex flex-col gap-3"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)]">{item.title}</h3>
                      <p className="text-sm text-[color:var(--wasatch-gray)]">
                        {format(parseISO(item.eventDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <div className="text-sm text-[color:var(--wasatch-gray)] md:text-right">
                      <p className="font-medium text-[color:var(--wasatch-red)]">Total: ${(item.totalAmount / 100).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/20 bg-[color:var(--wasatch-bg2)]/35 p-3">
                    <p className="text-sm font-medium text-[color:var(--wasatch-blue)] mb-2">Attendees</p>
                    <div className="space-y-1 text-sm text-[color:var(--wasatch-gray)]">
                      {item.attendees.map((attendee) => (
                        <p key={`${item.orderId}-${attendee.full_name}-${attendee.email || "no-email"}`}>
                          {attendee.full_name}
                          {attendee.is_buyer ? " (buyer)" : ""}
                          {attendee.email ? ` • ${attendee.email}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-sm text-[color:var(--wasatch-gray)]">
                      {eligibleForSelfCancellation ? (
                        <p>Cancel at least 24 hours ahead to receive ${(refundPreview / 100).toFixed(2)} back after the $10 cancellation fee.</p>
                      ) : (
                        <p>Online cancellation closes within 24 hours of the event. Contact Wasatch Mahjong if you need help.</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      disabled={!eligibleForSelfCancellation || cancelLoadingId === item.orderId}
                      onClick={() => handleCancelOrder(item.orderId, item.eventDate)}
                    >
                      {cancelLoadingId === item.orderId ? "Cancelling..." : "Cancel Booking"}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
