import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import Link from "next/link";

const placeholderEvents = [
  {
    title: "Open Play Night",
    date: "March 10, 2026",
    description: "Join us for a fun, casual night of American Mahjong. All skill levels welcome!",
  },
  {
    title: "Beginner Class",
    date: "March 15, 2026",
    description: "Learn the basics of American Mahjong in a friendly, supportive environment.",
  },
  {
    title: "Strategy Workshop",
    date: "March 22, 2026",
    description: "Take your game to the next level with advanced tips and strategies.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[color:var(--wasatch-bg1)]">
      <Header />
      {/* Hero Section */}
      <section className="w-full py-16 px-4 bg-[color:var(--wasatch-bg2)] flex flex-col items-center text-center">
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-[color:var(--wasatch-red)] mb-4 tracking-tight">Welcome to Wasatch Mahjong</h1>
        <p className="max-w-xl text-lg md:text-xl text-[color:var(--wasatch-gray)] mb-8 font-sans">
          Salt Lake City's friendliest American Mahjong club. Join us for open play nights, fun classes, and a warm, welcoming community!
        </p>
        <Link href="/auth">
          <Button variant="primary" className="text-lg px-8 py-3 shadow-lg">Join a Game</Button>
        </Link>
      </section>

      {/* Upcoming Events Section */}
      <section className="w-full max-w-5xl mx-auto py-12 px-4">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-[color:var(--wasatch-blue)] mb-8 text-center">Upcoming Events</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {placeholderEvents.map((event, i) => (
            <Card key={i}>
              <h3 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-2">{event.title}</h3>
              <div className="text-[color:var(--wasatch-gray)] text-sm mb-2">{event.date}</div>
              <p className="font-sans text-base text-[color:var(--wasatch-gray)] mb-4">{event.description}</p>
              <Button variant="secondary" className="w-full">Register</Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
