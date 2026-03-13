"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export default function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    if (!isLogin) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        await fetch("/api/send-signup-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }
    }

    const next = searchParams.get("next");
    router.push(next || "/dashboard");
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] text-center mb-6">
          {isLogin ? "Log In" : "Sign Up"}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
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
            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
              required
            />
          </div>

          {error ? <p className="text-sm text-[color:var(--wasatch-red)]">{error}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : isLogin ? "Log In" : "Create Account"}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setIsLogin((current) => !current)}
            className="text-[color:var(--wasatch-blue)] hover:underline"
          >
            {isLogin ? "Need an account? Sign up" : "Already have an account? Log in"}
          </button>

          <Link href="/forgot-password" className="text-[color:var(--wasatch-blue)] hover:underline">
            Forgot password?
          </Link>
        </div>
      </Card>
    </main>
  );
}
