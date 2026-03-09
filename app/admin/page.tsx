"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type AdminUser = {
  user_id: string;
  created_at: string;
  created_by: string | null;
};

type EventTypeValue = "class" | "open_play" | "custom";

type ManagedEvent = {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  event_type: EventTypeValue | null;
  price: number;
  capacity: number;
  spots_remaining: number;
};

type CreateFormValues = {
  title: string;
  description: string;
  date: string;
  time: string;
  cost: string;
  spotsAvailable: string;
};

const EVENT_PRESETS: Record<EventTypeValue, Omit<CreateFormValues, "date" | "time">> = {
  class: {
    title: "Beginner Mahjong Class",
    description: "Learn the basics of American Mahjong in a friendly, supportive environment.",
    cost: "50",
    spotsAvailable: "16",
  },
  open_play: {
    title: "Open Play Night",
    description: "A fun, casual night of American Mahjong. All skill levels welcome!",
    cost: "30",
    spotsAvailable: "32",
  },
  custom: {
    title: "Special Mahjong Event",
    description: "",
    cost: "40",
    spotsAvailable: "20",
  },
};

function toEventTypeLabel(type: EventTypeValue | null): string {
  if (type === "class") {
    return "Class";
  }
  if (type === "open_play") {
    return "Open Play";
  }
  return "Custom";
}

function toNumber(value: string): number {
  return Number(value);
}

function toLocalDateInput(isoDate: string): string {
  const date = new Date(isoDate);
  return format(date, "yyyy-MM-dd");
}

function toLocalTimeInput(isoDate: string): string {
  const date = new Date(isoDate);
  return format(date, "HH:mm");
}

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUserIdInput, setAdminUserIdInput] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);

  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [eventsStatus, setEventsStatus] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<"type" | "form">("type");
  const [selectedCreateType, setSelectedCreateType] = useState<EventTypeValue | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormValues>({
    title: "",
    description: "",
    date: "",
    time: "",
    cost: "",
    spotsAvailable: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<EventTypeValue | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editPrice, setEditPrice] = useState("50");
  const [editCapacity, setEditCapacity] = useState("16");
  const [editSpots, setEditSpots] = useState("16");
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadAdminUsers() {
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id, created_at, created_by")
      .order("created_at", { ascending: false });

    if (error) {
      setAdminStatus(error.message);
      return;
    }

    setAdminUsers(data || []);
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("id, name, description, event_date, event_type, price, capacity, spots_remaining")
      .order("event_date", { ascending: true });

    if (error) {
      setEventsStatus(error.message);
      return;
    }

    const normalized = (data || []).map((row) => ({
      ...row,
      price: Number(row.price),
    }));

    setEvents(normalized as ManagedEvent[]);
  }

  useEffect(() => {
    async function initialize() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push(`/login?next=${encodeURIComponent("/admin")}`);
        return;
      }

      setUser(currentUser);

      const { data: adminCheck, error: adminCheckError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .limit(1);

      if (adminCheckError) {
        setAccessMessage(
          "Admin checks are not available yet. Apply migration 005 to enable the admin dashboard."
        );
        setLoading(false);
        return;
      }

      if (!adminCheck || adminCheck.length === 0) {
        setAccessMessage("You are signed in, but your account is not an admin yet.");
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await Promise.all([loadAdminUsers(), loadEvents()]);
      setLoading(false);
    }

    initialize();
  }, [router]);

  const handleAddAdmin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    const userId = adminUserIdInput.trim();
    if (!userId) {
      setAdminStatus("Enter a user UUID to add as admin.");
      return;
    }

    setAdminSaving(true);
    setAdminStatus("");

    const { error } = await supabase.from("admin_users").insert({
      user_id: userId,
      created_by: user.id,
    });

    if (error) {
      setAdminStatus(error.message);
      setAdminSaving(false);
      return;
    }

    setAdminUserIdInput("");
    setAdminStatus("Admin user added.");
    await loadAdminUsers();
    setAdminSaving(false);
  };

  const openCreateModal = () => {
    setEventsStatus("");
    setCreateStep("type");
    setSelectedCreateType(null);
    setCreateForm({
      title: "",
      description: "",
      date: "",
      time: "",
      cost: "",
      spotsAvailable: "",
    });
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creatingEvent) {
      return;
    }
    setCreateModalOpen(false);
  };

  const selectCreateType = (type: EventTypeValue) => {
    const preset = EVENT_PRESETS[type];
    setSelectedCreateType(type);
    setCreateForm({
      title: preset.title,
      description: preset.description,
      date: "",
      time: "",
      cost: preset.cost,
      spotsAvailable: preset.spotsAvailable,
    });
    setCreateStep("form");
  };

  const handleCreateEvent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedCreateType) {
      setEventsStatus("Select an event type first.");
      return;
    }

    if (!createForm.date || !createForm.time) {
      setEventsStatus("Choose both date and time for the event.");
      return;
    }

    const eventDate = new Date(`${createForm.date}T${createForm.time}`);
    if (Number.isNaN(eventDate.getTime())) {
      setEventsStatus("Invalid date/time.");
      return;
    }

    const selectedCost = toNumber(createForm.cost);
    const selectedSpots = toNumber(createForm.spotsAvailable);
    const isPresetType = selectedCreateType === "class" || selectedCreateType === "open_play";

    if (!isPresetType) {
      if (Number.isNaN(selectedCost) || selectedCost < 0) {
        setEventsStatus("Cost must be 0 or greater.");
        return;
      }
      if (Number.isNaN(selectedSpots) || selectedSpots <= 0) {
        setEventsStatus("Spots available must be greater than 0.");
        return;
      }
    }

    if (!createForm.title.trim()) {
      setEventsStatus("Event title is required.");
      return;
    }

    setCreatingEvent(true);
    setEventsStatus("");

    const normalizedPrice =
      selectedCreateType === "class" ? 50 : selectedCreateType === "open_play" ? 30 : selectedCost;
    const normalizedCapacity =
      selectedCreateType === "class" ? 16 : selectedCreateType === "open_play" ? 32 : selectedSpots;

    const eventTypeForDb = selectedCreateType;

    const { error } = await supabase.from("events").insert({
      name: createForm.title.trim(),
      description: createForm.description.trim() || null,
      event_date: eventDate.toISOString(),
      event_type: eventTypeForDb,
      price: normalizedPrice,
      capacity: normalizedCapacity,
      spots_remaining: normalizedCapacity,
      spots_available: normalizedCapacity,
    });

    if (error) {
      setEventsStatus(error.message);
      setCreatingEvent(false);
      return;
    }

    setEventsStatus("Event created.");
    setCreateModalOpen(false);
    await loadEvents();
    setCreatingEvent(false);
  };

  const beginEdit = (item: ManagedEvent) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description || "");
    setEditType(item.event_type);
    setEditDate(toLocalDateInput(item.event_date));
    setEditTime(toLocalTimeInput(item.event_date));
    setEditPrice(String(item.price));
    setEditCapacity(String(item.capacity));
    setEditSpots(String(item.spots_remaining));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setEditType(null);
    setEditDate("");
    setEditTime("");
    setEditPrice("50");
    setEditCapacity("16");
    setEditSpots("16");
  };

  const handleSaveEdit = async (eventId: string) => {
    if (!editDate || !editTime) {
      setEventsStatus("Choose both date and time when editing an event.");
      return;
    }

    const eventDate = new Date(`${editDate}T${editTime}`);
    if (Number.isNaN(eventDate.getTime())) {
      setEventsStatus("Invalid edit date/time.");
      return;
    }

    const isPresetType = editType === "class" || editType === "open_play";
    const nextPrice = isPresetType
      ? editType === "class"
        ? 50
        : 30
      : Number(editPrice);
    const nextCapacity = isPresetType
      ? editType === "class"
        ? 16
        : 32
      : Number(editCapacity);
    const nextSpots = Number(editSpots);

    if (!isPresetType) {
      if (Number.isNaN(nextPrice) || nextPrice < 0) {
        setEventsStatus("Cost must be 0 or greater.");
        return;
      }
      if (Number.isNaN(nextCapacity) || nextCapacity <= 0) {
        setEventsStatus("Capacity must be greater than 0.");
        return;
      }
    }

    if (Number.isNaN(nextSpots) || nextSpots < 0 || nextSpots > nextCapacity) {
      setEventsStatus(`Spots remaining must be between 0 and ${nextCapacity}.`);
      return;
    }

    if (!editName.trim()) {
      setEventsStatus("Event title is required.");
      return;
    }

    setSavingEdit(true);
    setEventsStatus("");

    const { error } = await supabase
      .from("events")
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        event_date: eventDate.toISOString(),
        price: nextPrice,
        capacity: nextCapacity,
        spots_remaining: nextSpots,
      })
      .eq("id", eventId);

    if (error) {
      setEventsStatus(error.message);
      setSavingEdit(false);
      return;
    }

    setEventsStatus("Event updated.");
    await loadEvents();
    cancelEdit();
    setSavingEdit(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] flex items-center justify-center px-4">
        <p className="text-[color:var(--wasatch-gray)]">Loading admin dashboard...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <Card>
            <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-red)] mb-3">Admin Access Required</h1>
            <p className="text-[color:var(--wasatch-gray)] mb-3">{accessMessage}</p>
            <p className="text-[color:var(--wasatch-gray)] text-sm">
              Ask an existing admin to add your user ID in the Admin Users section, or bootstrap the first admin manually in Supabase.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)]">Manager Dashboard</h1>
          <p className="text-[color:var(--wasatch-gray)] mt-1">Manage admins and create or edit events.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Admin Users</h2>
            <form onSubmit={handleAddAdmin} className="space-y-3 mb-4">
              <label className="block text-sm font-medium text-[color:var(--wasatch-gray)]">Add Admin by User UUID</label>
              <input
                type="text"
                value={adminUserIdInput}
                onChange={(e) => setAdminUserIdInput(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <Button type="submit" variant="primary" disabled={adminSaving}>
                {adminSaving ? "Adding..." : "Add Admin"}
              </Button>
            </form>

            {adminStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mb-3">{adminStatus}</p> : null}

            <div className="space-y-2">
              {adminUsers.length === 0 ? (
                <p className="text-[color:var(--wasatch-gray)] text-sm">No admin users found.</p>
              ) : (
                adminUsers.map((adminRow) => (
                  <div key={adminRow.user_id} className="rounded-xl border border-[color:var(--wasatch-gray)]/30 bg-white px-3 py-2">
                    <p className="text-xs text-[color:var(--wasatch-gray)] break-all">{adminRow.user_id}</p>
                    <p className="text-xs text-[color:var(--wasatch-gray)] mt-1">
                      Added {format(parseISO(adminRow.created_at), "MMM d, yyyy h:mm a")}
+                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Create Event</h2>
            <p className="text-[color:var(--wasatch-gray)] mb-4">
              Create Class, Open Play, or Custom events with the right defaults pre-filled.
            </p>
            <Button variant="secondary" onClick={openCreateModal}>Create New Event</Button>

            {eventsStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mt-3">{eventsStatus}</p> : null}
          </Card>
        </div>

        <Card>
          <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Event Management</h2>

          {events.length === 0 ? (
            <p className="text-[color:var(--wasatch-gray)]">No events yet. Create your first event above.</p>
          ) : (
            <div className="space-y-3">
              {events.map((item) => {
                const isEditing = editingId === item.id;
                const isPresetType = item.event_type === "class" || item.event_type === "open_play";
                const maxSpots = isPresetType ? (item.event_type === "class" ? 16 : 32) : item.capacity;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white px-4 py-4 space-y-3"
                  >
                    {!isEditing ? (
                      <>
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <h3 className="font-serif text-xl font-bold text-[color:var(--wasatch-blue)]">{item.name}</h3>
                            <p className="text-sm text-[color:var(--wasatch-gray)]">
                              {format(parseISO(item.event_date), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                            </p>
                            <p className="text-xs text-[color:var(--wasatch-blue)] mt-1">{toEventTypeLabel(item.event_type)}</p>
                          </div>
                          <Button variant="outline" onClick={() => beginEdit(item)}>
                            Edit Event
                          </Button>
                        </div>
                        <p className="text-[color:var(--wasatch-gray)]">{item.description || "No description."}</p>
                        <div className="text-sm text-[color:var(--wasatch-gray)]">
                          <span className="mr-3">Price: ${item.price}</span>
                          <span className="mr-3">Capacity: {item.capacity}</span>
                          <span>Spots Remaining: {item.spots_remaining}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Class Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Description</label>
                            <textarea
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              rows={3}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Date</label>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Time</label>
                            <input
                              type="time"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Event Type</label>
                            <input
                              type="text"
                              value={toEventTypeLabel(editType)}
                              readOnly
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)]/50 bg-[color:var(--wasatch-bg2)] px-4 py-2 text-[color:var(--wasatch-gray)]"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Cost ($)</label>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              readOnly={editType === "class" || editType === "open_play"}
                              className={`w-full rounded-2xl border px-4 py-2 ${
                                editType === "class" || editType === "open_play"
                                  ? "border-[color:var(--wasatch-gray)]/50 bg-[color:var(--wasatch-bg2)] text-[color:var(--wasatch-gray)]"
                                  : "border-[color:var(--wasatch-gray)] bg-white"
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Capacity</label>
                            <input
                              type="number"
                              min={1}
                              step="1"
                              value={editCapacity}
                              onChange={(e) => setEditCapacity(e.target.value)}
                              readOnly={editType === "class" || editType === "open_play"}
                              className={`w-full rounded-2xl border px-4 py-2 ${
                                editType === "class" || editType === "open_play"
                                  ? "border-[color:var(--wasatch-gray)]/50 bg-[color:var(--wasatch-bg2)] text-[color:var(--wasatch-gray)]"
                                  : "border-[color:var(--wasatch-gray)] bg-white"
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Spots Remaining</label>
                            <input
                              type="number"
                              min={0}
                              max={maxSpots}
                              value={editSpots}
                              onChange={(e) => setEditSpots(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" onClick={() => handleSaveEdit(item.id)} disabled={savingEdit}>
                            {savingEdit ? "Saving..." : "Save Changes"}
                          </Button>
                          <Button variant="outline" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <Card>
              {createStep === "type" ? (
                <>
                  <h3 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-2">Create New Event</h3>
                  <p className="text-[color:var(--wasatch-gray)] mb-4">What type of event are you creating?</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button variant="primary" onClick={() => selectCreateType("class")}>Class</Button>
                    <Button variant="secondary" onClick={() => selectCreateType("open_play")}>Open Play</Button>
                    <Button variant="outline" onClick={() => selectCreateType("custom")}>Custom</Button>
                  </div>

                  <div className="mt-4">
                    <Button variant="outline" onClick={closeCreateModal}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-2">Create New Event</h3>
                  <p className="text-[color:var(--wasatch-gray)] mb-4">
                    Event type: <span className="font-semibold text-[color:var(--wasatch-blue)]">{toEventTypeLabel(selectedCreateType)}</span>
                  </p>

                  <form onSubmit={handleCreateEvent} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Title</label>
                      <input
                        type="text"
                        value={createForm.title}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Description</label>
                      <textarea
                        value={createForm.description}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                        rows={3}
                        className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Date</label>
                        <input
                          type="date"
                          value={createForm.date}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, date: e.target.value }))}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Time</label>
                        <input
                          type="time"
                          value={createForm.time}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, time: e.target.value }))}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Cost ($)</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={createForm.cost}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, cost: e.target.value }))}
                          readOnly={selectedCreateType === "class" || selectedCreateType === "open_play"}
                          className={`w-full rounded-2xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)] ${
                            selectedCreateType === "class" || selectedCreateType === "open_play"
                              ? "border-[color:var(--wasatch-gray)]/50 bg-[color:var(--wasatch-bg2)] text-[color:var(--wasatch-gray)]"
                              : "border-[color:var(--wasatch-gray)] bg-white"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Spots Available</label>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={createForm.spotsAvailable}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, spotsAvailable: e.target.value }))}
                          readOnly={selectedCreateType === "class" || selectedCreateType === "open_play"}
                          className={`w-full rounded-2xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)] ${
                            selectedCreateType === "class" || selectedCreateType === "open_play"
                              ? "border-[color:var(--wasatch-gray)]/50 bg-[color:var(--wasatch-bg2)] text-[color:var(--wasatch-gray)]"
                              : "border-[color:var(--wasatch-gray)] bg-white"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="submit" variant="secondary" disabled={creatingEvent}>
                        {creatingEvent ? "Creating..." : "Create Event"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setCreateStep("type")}>
                        Back
                      </Button>
                      <Button type="button" variant="outline" onClick={closeCreateModal}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </main>
  );
}
