"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export function Footer() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (mounted) {
        setUser(currentUser);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <footer className="w-full bg-[color:var(--wasatch-bg2)] border-t border-[color:var(--wasatch-gray)] mt-12">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between py-8 px-6 gap-6 md:gap-0">
        {/* Logo and Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[color:var(--wasatch-blue)] flex items-center justify-center text-white font-serif text-2xl font-bold">
            WM
          </div>
          <span className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)] tracking-tight">Wasatch Mahjong</span>
        </div>
        {/* Address */}
        <div className="text-center md:text-left text-[color:var(--wasatch-gray)] text-sm">
          Salt Lake City, UT<br />
          INSERT ACTUAL ADDRESS HERE
        </div>
        {/* Helpful Links */}
        <nav className="flex flex-col md:flex-row gap-2 md:gap-6 text-[color:var(--wasatch-blue)] font-sans text-base font-medium">
          <Link href="/" className="hover:text-[color:var(--wasatch-red)] transition">Home</Link>
          <Link href="/events" className="hover:text-[color:var(--wasatch-red)] transition">Events</Link>
          <Link href="/contact" className="hover:text-[color:var(--wasatch-red)] transition">Contact</Link>
          <Link href="/policy" className="hover:text-[color:var(--wasatch-red)] transition">Policy</Link>
          {user ? (
            <Link href="/dashboard" className="hover:text-[color:var(--wasatch-red)] transition">Dashboard</Link>
          ) : (
            <Link href="/login" className="hover:text-[color:var(--wasatch-red)] transition">Login</Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
