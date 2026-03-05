"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
      } else {
        setUser(user);
      }
      setLoading(false);
    };
    getUser();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  const [emailStatus, setEmailStatus] = useState("");

  const handleSendTestEmail = async () => {
    setEmailStatus("Sending...");
    const res = await fetch("/api/send-signup-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });
    if (res.ok) {
      setEmailStatus("Email sent!");
    } else {
      setEmailStatus("Failed to send email");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="mb-4">Welcome, {user?.email}!</p>
        <button
          onClick={handleSignOut}
          className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition mb-4"
        >
          Sign Out
        </button>
        <button
          onClick={handleSendTestEmail}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition mb-2"
        >
          Send Test Email
        </button>
        {emailStatus && <div className="mt-2 text-sm">{emailStatus}</div>}
      </div>
    </div>
  );
}
