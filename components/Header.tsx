import Link from "next/link";
import React from "react";

export function Header() {
  return (
    <header className="w-full bg-[color:var(--wasatch-bg1)] border-b border-[color:var(--wasatch-gray)] shadow-sm">
      <div className="max-w-5xl mx-auto flex items-center justify-between py-4 px-6">
        <div className="flex items-center gap-3">
          {/* Placeholder for logo */}
          <div className="w-10 h-10 rounded-full bg-[color:var(--wasatch-blue)] flex items-center justify-center text-white font-serif text-2xl font-bold">
            WM
          </div>
          <span className="font-serif text-xl font-bold text-[color:var(--wasatch-blue)] tracking-tight">Wasatch Mahjong</span>
        </div>
        <nav className="flex gap-6 text-[color:var(--wasatch-gray)] font-sans text-base font-medium">
          <Link href="/events" className="hover:text-[color:var(--wasatch-red)] transition">Events</Link>
          <Link href="/classes" className="hover:text-[color:var(--wasatch-red)] transition">Classes</Link>
          <Link href="/contact" className="hover:text-[color:var(--wasatch-red)] transition">Contact</Link>
        </nav>
      </div>
    </header>
  );
}
