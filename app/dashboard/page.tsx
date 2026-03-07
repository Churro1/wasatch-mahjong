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
  event_type: "open_play" | "class" | null;
  price: number;
};

type SignupRow = {
  id: string;
  payment_status: string;
  events: EventSummary | EventSummary[] | null;
};

type UpcomingClass = {
  signupId: string;
  title: string;
  eventDate: string;
  price: number;
  paymentStatus: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [classLoadError, setClassLoadError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const router = useRouter();

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

      const { data: signupData, error: signupError } = await supabase
        .from("signups")
        .select("id, payment_status, events(id, name, event_date, event_type, price)")
        .order("created_at", { ascending: false });

      if (signupError) {
        setClassLoadError("We could not load your upcoming classes right now.");
      } else {
        const now = new Date();
        const classes = (signupData as SignupRow[])
          .map((row) => {
            const event = Array.isArray(row.events) ? row.events[0] : row.events;
            if (!event || event.event_type !== "class") {
              return null;
            }

            const eventDate = parseISO(event.event_date);
            if (eventDate <= now) {
              return null;
            }

            return {
              signupId: row.id,
              title: event.name,
              eventDate: event.event_date,
              price: Number(event.price),
              paymentStatus: row.payment_status,
            };
          })
          .filter((item): item is UpcomingClass => item !== null)
          .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

        setUpcomingClasses(classes);
      }

      setLoading(false);
    };

    loadDashboard();
  }, [router]);

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
            <p className="text-[color:var(--wasatch-gray)] mt-1">Manage your profile and view your upcoming classes.</p>
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
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)]">Upcoming Classes</h2>
            <Link href="/events">
              <Button variant="outline">Book Another Class</Button>
            </Link>
          </div>

          {classLoadError ? <p className="text-sm text-[color:var(--wasatch-red)]">{classLoadError}</p> : null}

          {!classLoadError && upcomingClasses.length === 0 ? (
            <p className="text-[color:var(--wasatch-gray)]">You do not have any upcoming classes yet.</p>
          ) : null}

          {!classLoadError && upcomingClasses.length > 0 ? (
            <div className="space-y-3">
              {upcomingClasses.map((item) => (
                <div
                  key={item.signupId}
                  className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                >
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)]">{item.title}</h3>
                    <p className="text-sm text-[color:var(--wasatch-gray)]">
                      {format(parseISO(item.eventDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <div className="text-sm text-[color:var(--wasatch-gray)] md:text-right">
                    <p className="font-medium text-[color:var(--wasatch-red)]">${item.price}</p>
                    <p>Status: {item.paymentStatus}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
