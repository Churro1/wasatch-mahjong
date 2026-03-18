"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/Button";

function getInitials(user: User | null): string {
  if (!user) {
    return "U";
  }

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
  }

  const email = user.email || "";
  return (email[0] || "U").toUpperCase();
}

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAdminStatus(userId: string | null) {
      if (!userId) {
        if (mounted) {
          setIsAdmin(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1);

      if (!mounted) {
        return;
      }

      if (error) {
        setIsAdmin(false);
        return;
      }

      setIsAdmin(Boolean(data && data.length > 0));
    }

    async function loadUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (mounted) {
        setUser(currentUser);
      }

      await loadAdminStatus(currentUser?.id ?? null);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      void loadAdminStatus(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const displayName = useMemo(() => {
    if (!user) {
      return "Profile";
    }

    const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
    return fullName || user.email || "Profile";
  }, [user]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setIsAdmin(false);
    setMenuOpen(false);
    setSigningOut(false);
    router.push("/login");
  };

  return (
    <header className="w-full bg-[color:white] border-b border-[color:var(--wasatch-gray)] shadow-sm">
      <div className="max-w-5xl mx-auto flex items-center justify-between py-4 px-6 gap-4">
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

        <div className="flex items-center gap-4">
          <nav className="hidden md:flex gap-6 text-[color:var(--wasatch-gray)] font-sans text-base font-medium">
            <Link href="/events" className="hover:text-[color:var(--wasatch-red)] transition">Events</Link>
            <Link href="/contact" className="hover:text-[color:var(--wasatch-red)] transition">Contact</Link>
            <Link href="/policy" className="hover:text-[color:var(--wasatch-red)] transition">Policy</Link>
          </nav>

          {!user ? (
            <Link href="/login">
              <Button variant="primary" className="px-5 py-2">Login</Button>
            </Link>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-[color:var(--wasatch-gray)]/40 bg-white px-3 py-1.5 hover:border-[color:var(--wasatch-blue)] transition"
                onClick={() => setMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="w-8 h-8 rounded-full bg-[color:var(--wasatch-blue)] text-white flex items-center justify-center text-sm font-semibold">
                  {getInitials(user)}
                </span>
                <span className="hidden sm:inline max-w-[180px] truncate text-sm text-[color:var(--wasatch-gray)]">{displayName}</span>
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white shadow-lg p-2 z-50"
                >
                  <Link
                    href="/dashboard"
                    role="menuitem"
                    className="block rounded-xl px-3 py-2 text-sm text-[color:var(--wasatch-gray)] hover:bg-[color:var(--wasatch-bg2)] hover:text-[color:var(--wasatch-red)] transition"
                    onClick={() => setMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  {isAdmin ? (
                    <Link
                      href="/admin"
                      role="menuitem"
                      className="block rounded-xl px-3 py-2 text-sm text-[color:var(--wasatch-gray)] hover:bg-[color:var(--wasatch-bg2)] hover:text-[color:var(--wasatch-red)] transition"
                      onClick={() => setMenuOpen(false)}
                    >
                      Admin Dashboard
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left rounded-xl px-3 py-2 text-sm text-[color:var(--wasatch-gray)] hover:bg-[color:var(--wasatch-bg2)] hover:text-[color:var(--wasatch-red)] transition"
                    onClick={handleSignOut}
                    disabled={signingOut}
                  >
                    {signingOut ? "Signing out..." : "Sign Out"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <nav className="md:hidden border-t border-[color:var(--wasatch-gray)]/25 px-6 py-2 flex gap-5 text-sm text-[color:var(--wasatch-gray)] font-medium">
        <Link href="/events" className="hover:text-[color:var(--wasatch-red)] transition">Events</Link>
        <Link href="/contact" className="hover:text-[color:var(--wasatch-red)] transition">Contact</Link>
        <Link href="/policy" className="hover:text-[color:var(--wasatch-red)] transition">Policy</Link>
      </nav>
    </header>
  );
}
