"use client";

import Link from "next/link";
import Image from "next/image";
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
    <footer className="w-full bg-[color:white] border-t border-[color:var(--wasatch-gray)] mt-12">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between py-8 px-6 gap-6 md:gap-0">
        {/* Logo and Name */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition">
          <Image 
            src="/WM_logo.png"
            alt="Wasatch Mahjong logo" 
            width={140} 
            height={100}
            priority
          />
          {/* <span className="font-serif text-xl font-bold text-[color:var(--wasatch-blue)] tracking-tight">Wasatch Mahjong</span> */}
        </Link>
        {/* Address */}
        <div className="text-center md:text-left text-[color:var(--wasatch-gray)] text-sm">
          3939 S Wasatch Blvd, Salt Lake City, UT 84124
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
