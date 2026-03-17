import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[color:var(--wasatch-bg1)]">
      {/* Hero Section */}
      <section className="w-full py-16 px-4 bg-[color:var(--wasatch-bg2)] flex flex-col items-center text-center">
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-[color:var(--wasatch-red)] mb-4 tracking-tight">Welcome to Wasatch Mahjong</h1>
        <p className="max-w-xl text-lg md:text-xl text-[color:var(--wasatch-gray)] mb-8 font-sans">
          Salt Lake City&apos;s friendliest American Mahjong club. Join us for open play nights, fun classes, and a warm, welcoming community!
        </p>
        <Link href="/events">
          <Button variant="primary" className="text-lg px-8 py-3 shadow-lg">View Events</Button>
        </Link>
      </section>

      {/* Upcoming Events Section */}
      <section className="w-full max-w-5xl mx-auto py-12 px-4">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-8 text-center">Upcoming Events</h2>
        <Card>
          <div className="text-center space-y-3">
            <p className="font-sans text-base text-[color:var(--wasatch-gray)]">
              New classes and open play nights are added regularly.
            </p>
            <p className="font-sans text-base text-[color:var(--wasatch-gray)]">
              Visit the Events page to see the latest schedule and reserve your spot.
            </p>
            <Link href="/events" className="inline-block">
              <Button variant="secondary">See Upcoming Events</Button>
            </Link>
          </div>
        </Card>
      </section>
      {/* Who We Are Section */}
      <section className="w-full max-w-3xl mx-auto py-12 px-4 text-center">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-4">Who We Are</h2>
        <p className="text-lg md:text-xl text-[color:var(--wasatch-gray)] font-sans mb-4">
          Wasatch Mahjong is a community of players who love the game and love sharing it with others. Whether you’re a total beginner or a seasoned player, you’ll find a warm welcome, friendly faces, and a place to belong. We believe in fun, fairness, and fostering new friendships through the joy of American Mahjong.
        </p>
      </section>

      {/* Location Section */}
      <section className="w-full max-w-3xl mx-auto py-12 px-4 text-center">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-4">Location</h2>
        <p className="text-lg text-[color:var(--wasatch-gray)] font-sans mb-2">
          <span className="font-semibold text-[color:var(--wasatch-red)]">Salt Lake City, UT</span><br />
          <span>3939 S Wasatch Dr, Salt Lake City, UT 84124</span>
        </p>
        <a
          href="https://maps.app.goo.gl/Kj5bom52uh6Vy2DG8?g_st=ic"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-[color:var(--wasatch-blue)] underline hover:text-[color:var(--wasatch-red)] transition"
        >
          View on Google Maps
        </a>
        <div className="text-sm text-[color:var(--wasatch-gray)] mt-4">
          We recommend arriving 10-15 minutes early to get settled before play begins.
        </div>
      </section>
    </div>
  );
}
