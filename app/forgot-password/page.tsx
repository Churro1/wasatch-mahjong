"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/update-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Password reset email sent. Please check your inbox.");
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] text-center mb-3">
          Reset Password
        </h1>
        <p className="text-[color:var(--wasatch-gray)] text-sm text-center mb-6">
          Enter your email and we&apos;ll send a reset link.
        </p>

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
              Email
            </label>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
              required
            />
          </div>

          {error ? <p className="text-sm text-[color:var(--wasatch-red)]">{error}</p> : null}
          {message ? <p className="text-sm text-[color:var(--wasatch-blue)]">{message}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>
      </Card>
    </main>
  );
}