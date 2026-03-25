"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setMessage("Password updated successfully. Redirecting to login...");
    setLoading(false);
    setTimeout(() => router.push("/login"), 1000);
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] text-center mb-6">
          Update Password
        </h1>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label htmlFor="update-password" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
              New Password
            </label>
            <input
              id="update-password"
              name="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
              required
            />
          </div>

          <div>
            <label htmlFor="update-confirm-password" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
              Confirm New Password
            </label>
            <input
              id="update-confirm-password"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
              required
            />
          </div>

          {error ? <p className="text-sm text-[color:var(--wasatch-red)]">{error}</p> : null}
          {message ? <p className="text-sm text-[color:var(--wasatch-blue)]">{message}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Update Password"}
          </Button>
        </form>
      </Card>
    </main>
  );
}