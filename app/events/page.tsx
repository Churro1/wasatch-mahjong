"use client";
import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO, addMonths, subMonths } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { supabase } from "@/lib/supabaseClient";

type EventType = "Open Play" | "Class" | "Custom";

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: EventType;
  spots: number;
  capacity: number;
  price: number;
  description: string;
  eventDateTime: string;
};

const eventTypes: Array<"All" | EventType> = ["All", "Open Play", "Class", "Custom"];

function toUiType(value: string | null): EventType {
  if (value === "class") {
    return "Class";
  }
  if (value === "open_play") {
    return "Open Play";
  }
  return "Custom";
}

function toUiEvent(row: {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  event_type: string | null;
  price: number;
  capacity?: number | null;
  spots_remaining?: number | null;
  spots_available?: number | null;
}): EventItem {
  const parsedDate = parseISO(row.event_date);
  const capacity = row.capacity ?? 0;
  const spots = row.spots_remaining ?? row.spots_available ?? capacity;

  return {
    id: row.id,
    title: row.name,
    date: format(parsedDate, "yyyy-MM-dd"),
    time: format(parsedDate, "h:mm a"),
    type: toUiType(row.event_type),
    spots,
    capacity,
    price: Number(row.price),
    description: row.description || "No description provided.",
    eventDateTime: row.event_date,
  };
}

export default function EventsPage() {
  const [filter, setFilter] = useState<"All" | EventType>("All");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ event: EventItem; x: number; y: number; visible: boolean } | null>(null);

  useEffect(() => {
    async function loadEvents() {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_type, price, capacity, spots_remaining, spots_available")
        .gte("event_date", midnight.toISOString())
        .order("event_date", { ascending: true });

      if (!error && data) {
        setEvents(data.map(toUiEvent));
      }
      setLoading(false);
    }

    loadEvents();
  }, []);

  const filteredEvents = useMemo(
    () => (filter === "All" ? events : events.filter((event) => event.type === filter)),
    [events, filter]
  );

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return filteredEvents.filter(event => {
      const eventDateTime = parseISO(event.eventDateTime);
      return eventDateTime > now;
    });
  }, [filteredEvents]);

  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState(today);
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const eventMap = filteredEvents.reduce((acc, event) => {
    acc[event.date] = acc[event.date] || [];
    acc[event.date].push(event);
    return acc;
  }, {} as Record<string, EventItem[]>);

  const calendarRows = [];
  let day = startDate;
  while (day <= endDate) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dayStr = format(day, "yyyy-MM-dd");
      week.push({
        date: new Date(day),
        isCurrentMonth: isSameMonth(day, monthStart),
        isToday: isSameDay(day, today),
        events: eventMap[dayStr] || [],
      });
      day = addDays(day, 1);
    }
    calendarRows.push(week);
  }

  return (
    <div className="min-h-screen bg-[color:var(--wasatch-bg1)] flex flex-col">
      <main className="flex-1">
        <div className="max-w-5xl mx-auto py-12 px-4">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)] mb-8 text-center">
            Schedule & Booking
          </h1>
          
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3 justify-center mb-8">
            {eventTypes.map((type) => (
              <Button
                key={type}
                variant={filter === type ? "primary" : "outline"}
                onClick={() => setFilter(type)}
              >
                {type}
              </Button>
            ))}
          </div>

          {/* Calendar View */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-2">
              <Button variant="outline" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>&lt; Prev</Button>
              <div className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)]">
                {format(monthStart, "MMMM yyyy")}
              </div>
              <Button variant="outline" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>Next &gt;</Button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[color:var(--wasatch-gray)] mb-1">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {calendarRows.flat().map((cell, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-1 min-h-[56px] border border-[color:var(--wasatch-bg2)] flex flex-col items-center justify-start ${cell.isCurrentMonth ? "bg-white" : "bg-[color:var(--wasatch-bg2)] opacity-60"} ${cell.isToday ? "ring-2 ring-[color:var(--wasatch-blue)]" : ""}`}
                >
                  <div className="text-xs font-bold mb-1">{cell.date.getDate()}</div>
                  {cell.events.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}`}
                      className="w-full text-[color:var(--wasatch-red)] text-[10px] truncate rounded bg-[color:var(--wasatch-bg2)] px-1 mb-0.5 cursor-pointer relative"
                      onMouseEnter={e => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltip({
                          event: ev,
                          x: rect.left + rect.width / 2,
                          y: rect.top + window.scrollY,
                          visible: true
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {ev.title}
                      <span className="ml-1 text-[color:var(--wasatch-blue)]">{ev.time}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Event List View */}
          <div className="flex flex-col gap-6">
            {loading ? (
              <div className="text-center text-[color:var(--wasatch-gray)]">Loading events...</div>
            ) : null}
            {upcomingEvents.length === 0 ? (
              <div className="text-center text-[color:var(--wasatch-gray)]">
                No upcoming events found.
              </div>
            ) : (
              upcomingEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((event) => (
                  <Card key={event.id} className="w-full">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <h2 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-1">{event.title}</h2>
                        <div className="text-[color:var(--wasatch-gray)] text-sm mb-1">
                          {format(parseISO(event.date), "MMMM d, yyyy")}<span className="ml-2 text-[color:var(--wasatch-blue)]">{event.time}</span>
                        </div>
                        <div className="text-xs text-[color:var(--wasatch-blue)] mb-2">{event.type}</div>
                        <p className="font-sans text-base text-[color:var(--wasatch-gray)] mb-2">{event.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 min-w-[120px]">
                        <div className="flex items-center gap-2 text-sm">
                          {event.spots > 0 ? (
                            <span className="text-[color:var(--wasatch-blue)] font-semibold">{event.spots} spots left</span>
                          ) : (
                            <span className="text-[color:var(--wasatch-red)] font-semibold">Waitlist only</span>
                          )}
                          <span className="text-[color:var(--wasatch-gray)]">${event.price}</span>
                        </div>
                        {event.spots > 0 ? (
                          <Link href={`/cart?eventId=${event.id}`} className="w-full">
                            <Button variant="secondary" className="w-full">Sign Up</Button>
                          </Link>
                        ) : (
                          <Link href={`/waitlist?eventId=${event.id}`} className="w-full">
                            <Button variant="outline" className="w-full">Join Waitlist</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
            )}
          </div>
          
          {/* Tooltip for event summary */}
          {tooltip && tooltip.visible && (
            <div
              style={{
                position: "absolute",
                left: tooltip.x,
                top: tooltip.y + 24,
                zIndex: 50,
                pointerEvents: "none",
                transform: "translateX(-50%)",
                minWidth: 200,
                maxWidth: 320,
              }}
              className="bg-white border border-[color:var(--wasatch-gray)] shadow-lg rounded-lg p-3 text-xs text-left"
            >
              <div className="font-bold text-[color:var(--wasatch-red)] mb-1">{tooltip.event.title}</div>
              <div className="mb-1 text-[color:var(--wasatch-blue)]">{format(parseISO(tooltip.event.date), "MMMM d, yyyy")} <span className='ml-1'>{tooltip.event.time}</span></div>
              <div className="mb-1">{tooltip.event.type}</div>
              <div className="mb-1">{tooltip.event.spots > 0 ? `${tooltip.event.spots} spots left` : "Waitlist only"}</div>
              <div className="mb-1">${tooltip.event.price}</div>
              <div className="text-[color:var(--wasatch-gray)]">{tooltip.event.description}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}