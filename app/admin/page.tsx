"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type EventTypeValue = "class" | "open_play" | "guided_play" |"custom";

type ManagedEvent = {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  event_type: EventTypeValue | null;
  price: number;
  capacity: number;
  spots_remaining: number;
  series_id: string | null;
  series_position: number | null;
  signups: Array<{
    id: string;
    order_id: string | null;
    attendee_name: string;
    attendee_email: string | null;
    is_buyer: boolean;
    payment_status: string;
    signup_status: string;
  }>;
};
type ManagedEventRow = Omit<ManagedEvent, "price"> & {
  price: string | number;
};

type EventPreset = {
  id: string;
  name: string;
  event_type: EventTypeValue;
  default_title: string;
  default_description: string | null;
  default_price: number;
  default_capacity: number;
  is_active: boolean;
  created_at: string;
};
type EventPresetRow = Omit<EventPreset, "default_price" | "default_capacity"> & {
  default_price: string | number;
  default_capacity: string | number;
};

type CreateFormValues = {
  title: string;
  description: string;
  date: string;
  time: string;
  cost: string;
  spotsAvailable: string;
};

type RepeatPattern = "daily" | "weekly" | "biweekly" | "monthly" | "custom";
type RepeatEndType = "count" | "date";
type RecurrenceUnit = "day" | "week" | "month";

type Coupon = {
  id: string;
  code: string;
  discountType: "dollar" | "percentage" | "bogo";
  discountValue: number;
  bogoBuyQuantity: number;
  bogoGetQuantity: number;
  expiryDate: string | null;
  maxUsesPerUser: number;
  isActive: boolean;
  isExpired: boolean;
  createdAt: string;
};

type CouponUsage = {
  userId: string;
  usageCount: number;
  uses: Array<{
    usedAt: string;
    discountAmount: number;
    orderId: string | null;
  }>;
};

const DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const TYPE_DEFAULT_TITLES: Record<EventTypeValue, string> = {
  class: "Mahjong Class",
  open_play: "Open Play",
  guided_play: "Guided Play",
  custom: "Special Mahjong Event",
};

function toEventTypeLabel(type: EventTypeValue | null): string {
  if (type === "class") {
    return "Class";
  }
  if (type === "open_play") {
    return "Open Play";
  }
  if (type === "guided_play") {
    return "Guided Play";
  }
  return "Custom";
}

function toNumber(value: string): number {
  return Number(value);
}

function toDateDayValue(dateInput: string): number {
  const parsed = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().getDay();
  }
  return parsed.getDay();
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
  const cancellationNoticeMs = 24 * 60 * 60 * 1000;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUserIdInput, setAdminUserIdInput] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [exportingAccounts, setExportingAccounts] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailStatus, setTestEmailStatus] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [eventsStatus, setEventsStatus] = useState("");
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<"type" | "form">("type");
  const [selectedCreateType, setSelectedCreateType] = useState<EventTypeValue | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormValues>({
    title: "",
    description: "",
    date: "",
    time: "",
    cost: "",
    spotsAvailable: "",
  });

  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatSeriesName, setRepeatSeriesName] = useState("");
  const [repeatPattern, setRepeatPattern] = useState<RepeatPattern>("weekly");
  const [repeatCustomUnit, setRepeatCustomUnit] = useState<RecurrenceUnit>("week");
  const [repeatCustomInterval, setRepeatCustomInterval] = useState("1");
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [repeatEndType, setRepeatEndType] = useState<RepeatEndType>("count");
  const [repeatCount, setRepeatCount] = useState("8");
  const [repeatUntilDate, setRepeatUntilDate] = useState("");

  const [presets, setPresets] = useState<EventPreset[]>([]);
  const [presetsStatus, setPresetsStatus] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetDeletingId, setPresetDeletingId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetType, setPresetType] = useState<EventTypeValue>("class");
  const [presetTitle, setPresetTitle] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetPrice, setPresetPrice] = useState("");
  const [presetCapacity, setPresetCapacity] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<EventTypeValue | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editCapacity, setEditCapacity] = useState("1");
  const [editSpots, setEditSpots] = useState("1");
  const [savingEdit, setSavingEdit] = useState(false);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsStatus, setCouponsStatus] = useState("");
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponFormStep, setCouponFormStep] = useState<"form" | "confirm">("form");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscountType, setCouponDiscountType] = useState<"dollar" | "percentage" | "bogo">("dollar");
  const [couponDiscountValue, setCouponDiscountValue] = useState("");
  const [couponBogoBuyQuantity, setCouponBogoBuyQuantity] = useState("1");
  const [couponBogoGetQuantity, setCouponBogoGetQuantity] = useState("1");
  const [couponExpiryDate, setCouponExpiryDate] = useState("");
  const [couponMaxUses, setCouponMaxUses] = useState("1");
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [viewingCouponUsageId, setViewingCouponUsageId] = useState<string | null>(null);
  const [couponUsage, setCouponUsage] = useState<{ coupon: { id: string; code: string; discountType: string; discountValue: number }; usage: CouponUsage[] } | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);

  const activePresets = useMemo(
    () => presets.filter((preset) => preset.is_active),
    [presets]
  );

  const presetOptionsForType = useMemo(() => {
    if (!selectedCreateType) {
      return activePresets;
    }
    return activePresets.filter((preset) => preset.event_type === selectedCreateType);
  }, [activePresets, selectedCreateType]);

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
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("id, name, description, event_date, event_type, price, capacity, spots_remaining, series_id, series_position, signups(id, order_id, attendee_name, attendee_email, is_buyer, payment_status, signup_status)")
      .gt("event_date", nowIso)
      .order("event_date", { ascending: true });

    if (error) {
      setEventsStatus(error.message);
      return;
    }

    const normalized = (data || []).map((row: ManagedEventRow): ManagedEvent => ({
      ...row,
      price: Number(row.price),
    }));

    setEvents(normalized as ManagedEvent[]);
  }

  async function loadPresets() {
    const { data, error } = await supabase
      .from("event_presets")
      .select(
        "id, name, event_type, default_title, default_description, default_price, default_capacity, is_active, created_at"
      )
      .order("name", { ascending: true });

    if (error) {
      setPresetsStatus(error.message);
      return;
    }

    const normalized = (data || []).map((row: EventPresetRow) => ({
      ...row,
      default_price: Number(row.default_price),
      default_capacity: Number(row.default_capacity),
    }));

    setPresets(normalized as EventPreset[]);
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
      setTestEmailTo(currentUser.email || "");

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
      await Promise.all([loadAdminUsers(), loadEvents(), loadPresets(), loadCoupons()]);
      setLoading(false);
    }

    initialize();
  }, [router]);

  const handleAddAdmin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    const identifier = adminUserIdInput.trim();
    if (!identifier) {
      setAdminStatus("Enter an email address or user UUID to add as admin.");
      return;
    }

    setAdminSaving(true);
    setAdminStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setAdminStatus("Your session expired. Please sign in again.");
      setAdminSaving(false);
      return;
    }

    const response = await fetch("/api/admin/add-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ identifier }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setAdminStatus(payload.error || "Unable to add admin user.");
      setAdminSaving(false);
      return;
    }

    setAdminUserIdInput("");
    setAdminStatus(
      payload.email
        ? `Admin user added for ${payload.email}.`
        : `Admin user added for ${payload.userId}.`
    );
    await loadAdminUsers();
    setAdminSaving(false);
  };

  const handleExportAccountEmails = async () => {
    setExportingAccounts(true);
    setAdminStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setAdminStatus("Your session expired. Please sign in again.");
      setExportingAccounts(false);
      return;
    }

    const response = await fetch("/api/admin/export-account-emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      let payload: { error?: string } = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as { error?: string };
        } catch {
          payload = { error: "Unable to export account emails." };
        }
      }
      setAdminStatus(payload.error || "Unable to export account emails.");
      setExportingAccounts(false);
      return;
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] || "wasatch-mahjong-accounts.csv";

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

    setAdminStatus("Account email export downloaded.");
    setExportingAccounts(false);
  };

  const handleSendTestEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const to = testEmailTo.trim();
    if (!to) {
      setTestEmailStatus("Enter an email address to test delivery.");
      return;
    }

    setSendingTestEmail(true);
    setTestEmailStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setTestEmailStatus("Your session expired. Please sign in again.");
      setSendingTestEmail(false);
      return;
    }

    const response = await fetch("/api/admin/test-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to }),
    });

    const responseText = await response.text();
    let payload: { message?: string; error?: string; details?: string } = {};
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as { message?: string; error?: string; details?: string };
      } catch {
        payload = { error: "Test email failed.", details: "Server returned a non-JSON response." };
      }
    }

    if (!response.ok) {
      setTestEmailStatus(payload.details ? `${payload.error} ${payload.details}` : payload.error || "Test email failed.");
      setSendingTestEmail(false);
      return;
    }

    setTestEmailStatus(payload.message || "Test email sent.");
    setSendingTestEmail(false);
  };

  const openCreateModal = () => {
    setEventsStatus("");
    setCreateStep("type");
    setSelectedCreateType(null);
    setSelectedPresetId("");
    setCreateForm({
      title: "",
      description: "",
      date: "",
      time: "",
      cost: "",
      spotsAvailable: "",
    });
    setIsRepeating(false);
    setRepeatSeriesName("");
    setRepeatPattern("weekly");
    setRepeatCustomUnit("week");
    setRepeatCustomInterval("1");
    setRepeatWeekdays([]);
    setRepeatEndType("count");
    setRepeatCount("8");
    setRepeatUntilDate("");
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creatingEvent) {
      return;
    }
    setCreateModalOpen(false);
  };

  const applyPresetToCreateForm = (preset: EventPreset) => {
    setSelectedCreateType(preset.event_type);
    setSelectedPresetId(preset.id);
    setCreateForm({
      title: preset.default_title,
      description: preset.default_description || "",
      date: createForm.date,
      time: createForm.time,
      cost: String(preset.default_price),
      spotsAvailable: String(preset.default_capacity),
    });
  };

  const selectCreateType = (type: EventTypeValue) => {
    const firstPreset = activePresets.find((preset) => preset.event_type === type);
    setSelectedCreateType(type);
    if (firstPreset) {
      setSelectedPresetId(firstPreset.id);
      setCreateForm({
        title: firstPreset.default_title,
        description: firstPreset.default_description || "",
        date: "",
        time: "",
        cost: String(firstPreset.default_price),
        spotsAvailable: String(firstPreset.default_capacity),
      });
    } else {
      setSelectedPresetId("");
      setCreateForm({
        title: TYPE_DEFAULT_TITLES[type],
        description: "",
        date: "",
        time: "",
        cost: "",
        spotsAvailable: "",
      });
    }

    setRepeatWeekdays((current) => {
      if (current.length > 0) {
        return current;
      }
      return [];
    });

    setCreateStep("form");
  };

  const handleLoadPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) {
      return;
    }
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    applyPresetToCreateForm(preset);
  };

  const handleStartCreateFromPreset = (preset: EventPreset) => {
    openCreateModal();
    setCreateStep("form");
    setSelectedCreateType(preset.event_type);
    setSelectedPresetId(preset.id);
    setCreateForm({
      title: preset.default_title,
      description: preset.default_description || "",
      date: "",
      time: "",
      cost: String(preset.default_price),
      spotsAvailable: String(preset.default_capacity),
    });
  };

  const toggleRepeatWeekday = (weekday: number) => {
    setRepeatWeekdays((current) => {
      if (current.includes(weekday)) {
        return current.filter((day) => day !== weekday);
      }
      return [...current, weekday].sort((a, b) => a - b);
    });
  };

  const recurrenceNeedsWeekdays =
    isRepeating && (repeatPattern === "weekly" || repeatPattern === "biweekly" || (repeatPattern === "custom" && repeatCustomUnit === "week"));

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

    if (Number.isNaN(selectedCost) || selectedCost < 0) {
      setEventsStatus("Cost must be 0 or greater.");
      return;
    }
    if (Number.isNaN(selectedSpots) || selectedSpots <= 0) {
      setEventsStatus("Spots available must be greater than 0.");
      return;
    }

    if (!createForm.title.trim()) {
      setEventsStatus("Event title is required.");
      return;
    }

    setCreatingEvent(true);
    setEventsStatus("");

    if (!isRepeating) {
      const { error } = await supabase.from("events").insert({
        name: createForm.title.trim(),
        description: createForm.description.trim() || null,
        event_date: eventDate.toISOString(),
        event_type: selectedCreateType,
        price: selectedCost,
        capacity: selectedSpots,
        spots_remaining: selectedSpots,
        spots_available: selectedSpots,
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
      return;
    }

    let recurrenceUnit: RecurrenceUnit = "week";
    let intervalCount = 1;

    if (repeatPattern === "daily") {
      recurrenceUnit = "day";
      intervalCount = 1;
    } else if (repeatPattern === "weekly") {
      recurrenceUnit = "week";
      intervalCount = 1;
    } else if (repeatPattern === "biweekly") {
      recurrenceUnit = "week";
      intervalCount = 2;
    } else if (repeatPattern === "monthly") {
      recurrenceUnit = "month";
      intervalCount = 1;
    } else {
      recurrenceUnit = repeatCustomUnit;
      intervalCount = toNumber(repeatCustomInterval);
    }

    if (Number.isNaN(intervalCount) || intervalCount <= 0) {
      setEventsStatus("Repeat interval must be greater than 0.");
      setCreatingEvent(false);
      return;
    }

    let weekdays: number[] | null = null;
    if (recurrenceNeedsWeekdays) {
      const fallbackWeekday = toDateDayValue(createForm.date);
      const sourceDays = repeatWeekdays.length > 0 ? repeatWeekdays : [fallbackWeekday];
      weekdays = [...new Set(sourceDays)].sort((a, b) => a - b);
      if (weekdays.length === 0) {
        setEventsStatus("Choose at least one weekday for weekly repeating events.");
        setCreatingEvent(false);
        return;
      }
    }

    let endAt: string | null = null;
    let occurrenceCount: number | null = null;

    if (repeatEndType === "date") {
      if (!repeatUntilDate) {
        setEventsStatus("Choose a repeat end date.");
        setCreatingEvent(false);
        return;
      }
      const repeatEnd = new Date(`${repeatUntilDate}T${createForm.time}`);
      if (Number.isNaN(repeatEnd.getTime())) {
        setEventsStatus("Invalid repeat end date.");
        setCreatingEvent(false);
        return;
      }
      if (repeatEnd < eventDate) {
        setEventsStatus("Repeat end date must be after the start date.");
        setCreatingEvent(false);
        return;
      }
      endAt = repeatEnd.toISOString();
    } else {
      occurrenceCount = toNumber(repeatCount);
      if (Number.isNaN(occurrenceCount) || occurrenceCount <= 0) {
        setEventsStatus("Repeat occurrence count must be greater than 0.");
        setCreatingEvent(false);
        return;
      }
    }

    const { data, error } = await supabase.rpc("create_event_series_and_generate_events", {
      p_series_name: repeatSeriesName.trim() || createForm.title.trim(),
      p_name: createForm.title.trim(),
      p_description: createForm.description.trim() || null,
      p_event_type: selectedCreateType,
      p_price: selectedCost,
      p_capacity: selectedSpots,
      p_start_at: eventDate.toISOString(),
      p_recurrence_unit: recurrenceUnit,
      p_interval_count: intervalCount,
      p_weekdays: weekdays,
      p_end_at: endAt,
      p_occurrence_count: occurrenceCount,
    });

    if (error) {
      setEventsStatus(error.message);
      setCreatingEvent(false);
      return;
    }

    const createdCount = Array.isArray(data) ? data.length : 0;
    setEventsStatus(
      createdCount > 0
        ? `Created ${createdCount} recurring events.`
        : "Series was created but no occurrences matched the selected schedule."
    );
    setCreateModalOpen(false);
    await loadEvents();
    setCreatingEvent(false);
  };

  const handleSavePreset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    const trimmedName = presetName.trim();
    const trimmedTitle = presetTitle.trim();
    const normalizedPrice = toNumber(presetPrice);
    const normalizedCapacity = toNumber(presetCapacity);

    if (!trimmedName) {
      setPresetsStatus("Preset name is required.");
      return;
    }
    if (!trimmedTitle) {
      setPresetsStatus("Preset title is required.");
      return;
    }
    if (Number.isNaN(normalizedPrice) || normalizedPrice < 0) {
      setPresetsStatus("Preset price must be 0 or greater.");
      return;
    }
    if (Number.isNaN(normalizedCapacity) || normalizedCapacity <= 0) {
      setPresetsStatus("Preset capacity must be greater than 0.");
      return;
    }

    setPresetSaving(true);
    setPresetsStatus("");

    const { error } = await supabase.from("event_presets").insert({
      name: trimmedName,
      event_type: presetType,
      default_title: trimmedTitle,
      default_description: presetDescription.trim() || null,
      default_price: normalizedPrice,
      default_capacity: normalizedCapacity,
      created_by: user.id,
      updated_by: user.id,
    });

    if (error) {
      setPresetsStatus(error.message);
      setPresetSaving(false);
      return;
    }

    setPresetName("");
    setPresetTitle("");
    setPresetDescription("");
    setPresetPrice("");
    setPresetCapacity("");
    setPresetsStatus("Preset saved.");
    await loadPresets();
    setPresetSaving(false);
  };

  const handleDeletePreset = async (presetId: string) => {
    const confirmed = window.confirm("Delete this preset?");
    if (!confirmed) {
      return;
    }

    setPresetDeletingId(presetId);
    setPresetsStatus("");

    const { error } = await supabase
      .from("event_presets")
      .delete()
      .eq("id", presetId);

    if (error) {
      setPresetsStatus(error.message);
      setPresetDeletingId(null);
      return;
    }

    if (selectedPresetId === presetId) {
      setSelectedPresetId("");
    }

    setPresetsStatus("Preset deleted.");
    await loadPresets();
    setPresetDeletingId(null);
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
    setEditPrice("0");
    setEditCapacity("1");
    setEditSpots("1");
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

    const nextPrice = Number(editPrice);
    const nextCapacity = Number(editCapacity);
    const nextSpots = Number(editSpots);

    if (Number.isNaN(nextPrice) || nextPrice < 0) {
      setEventsStatus("Cost must be 0 or greater.");
      return;
    }
    if (Number.isNaN(nextCapacity) || nextCapacity <= 0) {
      setEventsStatus("Capacity must be greater than 0.");
      return;
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

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = window.confirm("Delete this event?");
    if (!confirmed) {
      return;
    }

    setDeletingEventId(eventId);
    setEventsStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setEventsStatus("Your session expired. Please sign in again.");
      setDeletingEventId(null);
      return;
    }

    const response = await fetch("/api/admin/delete-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ eventId }),
    });

    const responseText = await response.text();
    let payload: { message?: string; error?: string } = {};
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as { message?: string; error?: string };
      } catch {
        payload = { error: "Unable to parse server response." };
      }
    }

    if (!response.ok) {
      setEventsStatus(payload.error || "Could not delete this event.");
      setDeletingEventId(null);
      return;
    }

    setEventsStatus(payload.message || "Event deleted.");
    await loadEvents();
    setDeletingEventId(null);
  };

  const handleExportContacts = async (eventId: string) => {
    setExportingEventId(eventId);
    setEventsStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setEventsStatus("Your session expired. Please sign in again.");
      setExportingEventId(null);
      return;
    }

    const response = await fetch("/api/admin/export-event-contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ eventId }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      let payload: { error?: string } = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as { error?: string };
        } catch {
          payload = { error: "Could not export contacts." };
        }
      }
      setEventsStatus(payload.error || "Could not export contacts.");
      setExportingEventId(null);
      return;
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] || "event-contacts.csv";

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

    setEventsStatus("Contact export downloaded.");
    setExportingEventId(null);
  };

  const handleCancelOrder = async (orderId: string, eventDate: string) => {
    const confirmed = window.confirm(
      "Cancel this paid order? Any eligible refund will be reduced by the $10 cancellation fee."
    );
    if (!confirmed) {
      return;
    }

    const reason = window.prompt("Optional cancellation note:", "")?.trim() || "";
    const currentTime = new Date().getTime();
    const isInside24Hours = parseISO(eventDate).getTime() - currentTime < cancellationNoticeMs;
    let adminRefundOverride = false;

    if (isInside24Hours) {
      adminRefundOverride = window.confirm(
        "This event is within 24 hours. Click OK to issue a courtesy refund minus the $10 cancellation fee, or Cancel to cancel without refund."
      );
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setEventsStatus("Your session expired. Please sign in again.");
      return;
    }

    setCancellingOrderId(orderId);
    setEventsStatus("");

    const response = await fetch("/api/checkout/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orderId, reason, adminRefundOverride }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setEventsStatus(payload.error || "We could not cancel that order.");
      setCancellingOrderId(null);
      return;
    }

    setEventsStatus(payload.message || "Order cancelled.");
    await loadEvents();
    setCancellingOrderId(null);
  };

  async function loadCoupons() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setCouponsStatus("Your session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/coupons", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      setCouponsStatus("Failed to load coupons.");
      return;
    }

    const payload = await response.json();
    setCoupons(payload.coupons || []);
    setCouponsStatus("");
  }

  const handleOpenCouponModal = () => {
    setCouponCode("");
    setCouponDiscountType("dollar");
    setCouponDiscountValue("");
    setCouponBogoBuyQuantity("1");
    setCouponBogoGetQuantity("1");
    setCouponExpiryDate("");
    setCouponMaxUses("1");
    setCouponFormStep("form");
    setCouponsStatus("");
    setCouponModalOpen(true);
  };

  const handleCloseCouponModal = () => {
    if (!creatingCoupon) {
      setCouponModalOpen(false);
    }
  };

  const handleCreateCoupon = async () => {
    const code = couponCode.trim().toUpperCase();

    if (!code) {
      setCouponsStatus("Coupon code is required.");
      return;
    }

    if (couponDiscountType === "bogo") {
      const buyQty = Number(couponBogoBuyQuantity);
      const getQty = Number(couponBogoGetQuantity);

      if (!Number.isInteger(buyQty) || buyQty < 1) {
        setCouponsStatus("Buy quantity must be a whole number of at least 1.");
        return;
      }

      if (!Number.isInteger(getQty) || getQty < 1) {
        setCouponsStatus("Get quantity must be a whole number of at least 1.");
        return;
      }
    } else {
      if (!couponDiscountValue) {
        setCouponsStatus("Discount value is required.");
        return;
      }

      const value = Number(couponDiscountValue);
      if (Number.isNaN(value) || value <= 0) {
        setCouponsStatus("Discount value must be greater than 0.");
        return;
      }

      if (couponDiscountType === "percentage") {
        if (!Number.isInteger(value) || value < 1 || value > 100) {
          setCouponsStatus("Percentage discount must be a whole number from 1 to 100.");
          return;
        }
      }
    }

    const maxUses = Number(couponMaxUses);
    if (Number.isNaN(maxUses) || maxUses < 1) {
      setCouponsStatus("Max uses must be at least 1.");
      return;
    }

    setCouponFormStep("confirm");
  };

  const handleConfirmCreateCoupon = async () => {
    setCreatingCoupon(true);
    setCouponsStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setCouponsStatus("Your session expired. Please sign in again.");
      setCreatingCoupon(false);
      return;
    }

    const response = await fetch("/api/admin/create-coupon", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        code: couponCode.trim().toUpperCase(),
        discountType: couponDiscountType,
        discountValue: couponDiscountType === "bogo" ? 1 : Number(couponDiscountValue),
        bogoBuyQuantity: couponDiscountType === "bogo" ? Number(couponBogoBuyQuantity) : 1,
        bogoGetQuantity: couponDiscountType === "bogo" ? Number(couponBogoGetQuantity) : 1,
        expiryDate: couponExpiryDate || null,
        maxUsesPerUser: Number(couponMaxUses) || 1,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setCouponsStatus(payload.error || "Failed to create coupon.");
      setCreatingCoupon(false);
      return;
    }

    setCouponsStatus("Coupon created successfully!");
    setCouponModalOpen(false);
    await loadCoupons();
    setCreatingCoupon(false);
  };

  const handleViewCouponUsage = async (couponId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setCouponsStatus("Your session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/coupons/${couponId}/usage`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      setCouponsStatus("Failed to load coupon usage.");
      return;
    }

    const payload = await response.json();
    setCouponUsage(payload);
    setViewingCouponUsageId(couponId);
  };

  const handleDeleteCoupon = async (couponId: string) => {
    const confirmed = window.confirm("Deactivate this coupon? It will no longer be usable.");
    if (!confirmed) {
      return;
    }

    setDeletingCouponId(couponId);
    setCouponsStatus("");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      setCouponsStatus("Your session expired. Please sign in again.");
      setDeletingCouponId(null);
      return;
    }

    const response = await fetch("/api/admin/delete-coupon", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ couponId }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setCouponsStatus(payload.error || "Failed to deactivate coupon.");
      setDeletingCouponId(null);
      return;
    }

    setCouponsStatus("Coupon deactivated.");
    await loadCoupons();
    setDeletingCouponId(null);
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
              Ask an existing admin to add you by email or user ID in the Admin Access section, or bootstrap the first admin manually in Supabase.
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
          <p className="text-[color:var(--wasatch-gray)] mt-1">Create, edit, and manage event bookings.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Create Event</h2>
            <p className="text-[color:var(--wasatch-gray)] mb-4">
              Create one-off or repeating events using manual values or saved presets.
            </p>
            <Button variant="secondary" onClick={openCreateModal}>Create New Event</Button>

            {eventsStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mt-3">{eventsStatus}</p> : null}
          </Card>

          <Card>
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-4">Preset Manager</h2>

            <form onSubmit={handleSavePreset} className="space-y-3 mb-4">
              <div>
                <label htmlFor="preset-name" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Preset Name</label>
                <input
                  id="preset-name"
                  name="presetName"
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  placeholder="Thursday Beginner Class"
                  required
                />
              </div>

              <div>
                <label htmlFor="preset-type" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Type</label>
                <select
                  id="preset-type"
                  name="presetType"
                  value={presetType}
                  onChange={(e) => setPresetType(e.target.value as EventTypeValue)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                >
                  <option value="class">Class</option>
                  <option value="open_play">Open Play</option>
                  <option value="guided_play">Guided Play</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label htmlFor="preset-title" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Default Title</label>
                <input
                  id="preset-title"
                  name="presetTitle"
                  type="text"
                  value={presetTitle}
                  onChange={(e) => setPresetTitle(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                  required
                />
              </div>

              <div>
                <label htmlFor="preset-description" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Default Description</label>
                <textarea
                  id="preset-description"
                  name="presetDescription"
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="preset-price" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Default Price</label>
                  <input
                    id="preset-price"
                    name="presetPrice"
                    type="number"
                    min={0}
                    step="1"
                    value={presetPrice}
                    onChange={(e) => setPresetPrice(e.target.value)}
                    className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="preset-capacity" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Default Capacity</label>
                  <input
                    id="preset-capacity"
                    name="presetCapacity"
                    type="number"
                    min={1}
                    step="1"
                    value={presetCapacity}
                    onChange={(e) => setPresetCapacity(e.target.value)}
                    className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                    required
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" disabled={presetSaving}>
                {presetSaving ? "Saving..." : "Save Preset"}
              </Button>
            </form>

            {presetsStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mb-3">{presetsStatus}</p> : null}

            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {activePresets.length === 0 ? (
                <p className="text-sm text-[color:var(--wasatch-gray)]">No presets yet.</p>
              ) : (
                activePresets.map((preset) => (
                  <div key={preset.id} className="rounded-xl border border-[color:var(--wasatch-gray)]/30 bg-white p-3">
                    <p className="font-semibold text-[color:var(--wasatch-blue)]">{preset.name}</p>
                    <p className="text-xs text-[color:var(--wasatch-gray)] mt-1">
                      {toEventTypeLabel(preset.event_type)} | ${preset.default_price} | {preset.default_capacity} spots
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        onClick={() => handleStartCreateFromPreset(preset)}
                      >
                        Load
                      </Button>
                      <Button
                        variant="outline"
                        disabled={presetDeletingId === preset.id}
                        onClick={() => handleDeletePreset(preset.id)}
                      >
                        {presetDeletingId === preset.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
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
                const maxSpots = item.capacity;

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
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => handleExportContacts(item.id)} disabled={exportingEventId === item.id}>
                              {exportingEventId === item.id ? "Exporting..." : "Export Contacts"}
                            </Button>
                            <Button variant="outline" onClick={() => beginEdit(item)}>
                              Edit Event
                            </Button>
                            <Button
                              variant="outline"
                              disabled={deletingEventId === item.id}
                              onClick={() => handleDeleteEvent(item.id)}
                            >
                              {deletingEventId === item.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </div>
                        <p className="text-[color:var(--wasatch-gray)]">{item.description || "No description."}</p>
                        <div className="text-sm text-[color:var(--wasatch-gray)]">
                          <span className="mr-3">Price: ${item.price}</span>
                          <span className="mr-3">Capacity: {item.capacity}</span>
                          <span>Spots Remaining: {item.spots_remaining}</span>
                          {item.series_id ? <span className="ml-3">Series #{item.series_position || "-"}</span> : null}
                        </div>
                        <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/20 bg-[color:var(--wasatch-bg2)]/40 p-3">
                          <p className="font-semibold text-[color:var(--wasatch-blue)] mb-2">Roster</p>
                          {item.signups.length === 0 ? (
                            <p className="text-sm text-[color:var(--wasatch-gray)]">No attendees registered yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {item.signups.map((signup) => (
                                <div key={signup.id} className="text-sm text-[color:var(--wasatch-gray)]">
                                  <span className="font-medium text-[color:var(--wasatch-blue)]">{signup.attendee_name}</span>
                                  <span className="ml-2">{signup.attendee_email || "No email"}</span>
                                  <span className="ml-2">{signup.payment_status}</span>
                                  <span className="ml-2">{signup.signup_status}</span>
                                  {signup.is_buyer && signup.order_id && signup.signup_status === "active" && parseISO(item.event_date) > new Date() ? (
                                    <Button
                                      variant="outline"
                                      className="ml-2"
                                      disabled={cancellingOrderId === signup.order_id}
                                      onClick={() => handleCancelOrder(signup.order_id as string, item.event_date)}
                                    >
                                      {cancellingOrderId === signup.order_id ? "Cancelling..." : "Cancel Order"}
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <label htmlFor="edit-name" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Class Name</label>
                            <input
                              id="edit-name"
                              name="editName"
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label htmlFor="edit-description" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Description</label>
                            <textarea
                              id="edit-description"
                              name="editDescription"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              rows={3}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-date" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Date</label>
                            <input
                              id="edit-date"
                              name="editDate"
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-time" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Time</label>
                            <input
                              id="edit-time"
                              name="editTime"
                              type="time"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-type" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Event Type</label>
                            <input
                              id="edit-type"
                              name="editType"
                              type="text"
                              value={toEventTypeLabel(editType)}
                              readOnly
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)]/50 bg-[color:var(--wasatch-bg2)] px-4 py-2 text-[color:var(--wasatch-gray)]"
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-price" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Cost ($)</label>
                            <input
                              id="edit-price"
                              name="editPrice"
                              type="number"
                              min={0}
                              step="1"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-capacity" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Capacity</label>
                            <input
                              id="edit-capacity"
                              name="editCapacity"
                              type="number"
                              min={1}
                              step="1"
                              value={editCapacity}
                              onChange={(e) => setEditCapacity(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            />
                          </div>

                          <div>
                            <label htmlFor="edit-spots" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Spots Remaining</label>
                            <input
                              id="edit-spots"
                              name="editSpots"
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

        <Card>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)]">Coupon Management</h2>
            <Button variant="secondary" onClick={handleOpenCouponModal}>
              Create New Coupon
            </Button>
          </div>

          {couponsStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mb-4">{couponsStatus}</p> : null}

          {coupons.length === 0 ? (
            <p className="text-[color:var(--wasatch-gray)]">No coupons created yet.</p>
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon) => {
                const discountDisplay =
                  coupon.discountType === "percentage"
                    ? `${coupon.discountValue}% off`
                    : coupon.discountType === "bogo"
                      ? `Buy ${coupon.bogoBuyQuantity} Get ${coupon.bogoGetQuantity}`
                      : `$${coupon.discountValue} off`;

                const expiryDisplay = coupon.expiryDate
                  ? format(parseISO(coupon.expiryDate), "MMM d, yyyy")
                  : "No expiry";

                const statusBadge = coupon.isExpired
                  ? "Expired"
                  : !coupon.isActive
                    ? "Inactive"
                    : "Active";
                const statusColor = coupon.isExpired || !coupon.isActive ? "text-[color:var(--wasatch-red)]" : "text-green-600";

                return (
                  <div
                    key={coupon.id}
                    className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white px-4 py-4 space-y-2"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <h3 className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)]">{coupon.code}</h3>
                        <p className="text-sm text-[color:var(--wasatch-gray)]">{discountDisplay}</p>
                        <p className="text-xs text-[color:var(--wasatch-gray)] mt-1">
                          Expires: {expiryDisplay} | Max uses per user: {coupon.maxUsesPerUser}
                        </p>
                        <p className={`text-xs font-semibold mt-1 ${statusColor}`}>{statusBadge}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleViewCouponUsage(coupon.id)}
                          className="text-sm"
                        >
                          View Usage
                        </Button>
                        {coupon.isActive && (
                          <Button
                            variant="outline"
                            disabled={deletingCouponId === coupon.id}
                            onClick={() => handleDeleteCoupon(coupon.id)}
                            className="text-sm"
                          >
                            {deletingCouponId === coupon.id ? "Deactivating..." : "Deactivate"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-3">Admin Access</h2>
          <p className="text-[color:var(--wasatch-gray)] text-sm mb-4">
            Add another admin by email or user UUID. This section sits below the event tools on purpose.
          </p>

          <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4 mb-5">
            <h3 className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)] mb-2">Email Test</h3>
            <p className="text-sm text-[color:var(--wasatch-gray)] mb-3">
              Send a test email to confirm outbound delivery and credentials.
            </p>

            <form onSubmit={handleSendTestEmail} className="space-y-3 max-w-2xl">
              <label htmlFor="test-email-to" className="block text-sm font-medium text-[color:var(--wasatch-gray)]">Recipient Email</label>
              <input
                id="test-email-to"
                name="testEmailTo"
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                placeholder="you@example.com"
                required
              />
              <Button type="submit" variant="secondary" disabled={sendingTestEmail}>
                {sendingTestEmail ? "Sending..." : "Send Test Email"}
              </Button>
            </form>

            {testEmailStatus ? <p className="text-sm text-[color:var(--wasatch-blue)] mt-3">{testEmailStatus}</p> : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4">
              <form onSubmit={handleAddAdmin} className="space-y-3">
                <label htmlFor="admin-identifier" className="block text-sm font-medium text-[color:var(--wasatch-gray)]">Add Admin by Email or UUID</label>
                <input
                  id="admin-identifier"
                  name="adminIdentifier"
                  type="text"
                  value={adminUserIdInput}
                  onChange={(e) => setAdminUserIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                  placeholder="name@example.com or user UUID"
                />
                <Button type="submit" variant="primary" disabled={adminSaving}>
                  {adminSaving ? "Adding..." : "Add Admin"}
                </Button>
              </form>
            </div>

            <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 bg-white p-4">
              <h3 className="font-serif text-lg font-bold text-[color:var(--wasatch-blue)] mb-2">Export All Account Emails</h3>
              <p className="text-sm text-[color:var(--wasatch-gray)] mb-3">
                Download a spreadsheet of every Wasatch Mahjong account email.
              </p>
              <Button variant="secondary" onClick={handleExportAccountEmails} disabled={exportingAccounts}>
                {exportingAccounts ? "Exporting..." : "Export Account Emails"}
              </Button>
            </div>
          </div>

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
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

      </div>

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center px-4 py-6">
            <div className="w-full max-w-2xl">
              <Card className="max-h-[calc(100vh-3rem)] overflow-y-auto">
              {createStep === "type" ? (
                <>
                  <h3 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)] mb-2">Create New Event</h3>
                  <p className="text-[color:var(--wasatch-gray)] mb-4">What type of event are you creating?</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button variant="primary" onClick={() => selectCreateType("class")}>Class</Button>
                    <Button variant="secondary" onClick={() => selectCreateType("open_play")}>Open Play</Button>
                    <Button variant="secondary" onClick={() => selectCreateType("guided_play")}>Guided Play</Button>
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

                  <div className="mb-4">
                    <label htmlFor="create-selected-preset" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Load Preset</label>
                    <select
                      id="create-selected-preset"
                      name="selectedPresetId"
                      value={selectedPresetId}
                      onChange={(e) => handleLoadPreset(e.target.value)}
                      className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                    >
                      <option value="">No preset</option>
                      {presetOptionsForType.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <form onSubmit={handleCreateEvent} className="space-y-3">
                    <div>
                      <label htmlFor="create-title" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Title</label>
                      <input
                        id="create-title"
                        name="createTitle"
                        type="text"
                        value={createForm.title}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="create-description" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Description</label>
                      <textarea
                        id="create-description"
                        name="createDescription"
                        value={createForm.description}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                        rows={3}
                        className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="create-date" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Date</label>
                        <input
                          id="create-date"
                          name="createDate"
                          type="date"
                          value={createForm.date}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, date: e.target.value }))}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="create-time" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Time</label>
                        <input
                          id="create-time"
                          name="createTime"
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
                        <label htmlFor="create-cost" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Cost ($)</label>
                        <input
                          id="create-cost"
                          name="createCost"
                          type="number"
                          min={0}
                          step="1"
                          value={createForm.cost}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, cost: e.target.value }))}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="create-spots" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Spots Available</label>
                        <input
                          id="create-spots"
                          name="createSpotsAvailable"
                          type="number"
                          min={1}
                          step="1"
                          value={createForm.spotsAvailable}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, spotsAvailable: e.target.value }))}
                          className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--wasatch-blue)]"
                          required
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--wasatch-gray)]/30 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[color:var(--wasatch-blue)]">Repeating Event</p>
                        <label className="inline-flex items-center gap-2 text-sm text-[color:var(--wasatch-gray)]">
                          <input
                            name="isRepeating"
                            type="checkbox"
                            checked={isRepeating}
                            onChange={(e) => {
                              setIsRepeating(e.target.checked);
                              if (e.target.checked && createForm.date && repeatWeekdays.length === 0) {
                                setRepeatWeekdays([toDateDayValue(createForm.date)]);
                              }
                            }}
                          />
                          Enable
                        </label>
                      </div>

                      {isRepeating ? (
                        <>
                          <div>
                            <label htmlFor="repeat-series-name" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Series Name (optional)</label>
                            <input
                              id="repeat-series-name"
                              name="repeatSeriesName"
                              type="text"
                              value={repeatSeriesName}
                              onChange={(e) => setRepeatSeriesName(e.target.value)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                              placeholder="Spring Thursday Series"
                            />
                          </div>

                          <div>
                            <label htmlFor="repeat-pattern" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Repeat Pattern</label>
                            <select
                              id="repeat-pattern"
                              name="repeatPattern"
                              value={repeatPattern}
                              onChange={(e) => {
                                const value = e.target.value as RepeatPattern;
                                setRepeatPattern(value);
                                if (
                                  (value === "weekly" || value === "biweekly") &&
                                  createForm.date &&
                                  repeatWeekdays.length === 0
                                ) {
                                  setRepeatWeekdays([toDateDayValue(createForm.date)]);
                                }
                              }}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="biweekly">Every 2 Weeks</option>
                              <option value="monthly">Monthly</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>

                          {repeatPattern === "custom" ? (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label htmlFor="repeat-custom-unit" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Custom Unit</label>
                                <select
                                  id="repeat-custom-unit"
                                  name="repeatCustomUnit"
                                  value={repeatCustomUnit}
                                  onChange={(e) => setRepeatCustomUnit(e.target.value as RecurrenceUnit)}
                                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                                >
                                  <option value="day">Day</option>
                                  <option value="week">Week</option>
                                  <option value="month">Month</option>
                                </select>
                              </div>
                              <div>
                                <label htmlFor="repeat-custom-interval" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Every N Units</label>
                                <input
                                  id="repeat-custom-interval"
                                  name="repeatCustomInterval"
                                  type="number"
                                  min={1}
                                  step="1"
                                  value={repeatCustomInterval}
                                  onChange={(e) => setRepeatCustomInterval(e.target.value)}
                                  className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                                />
                              </div>
                            </div>
                          ) : null}

                          {recurrenceNeedsWeekdays ? (
                            <div>
                              <p className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Weekdays</p>
                              <div className="flex flex-wrap gap-2">
                                {DAY_OPTIONS.map((day) => {
                                  const isSelected = repeatWeekdays.includes(day.value);
                                  return (
                                    <button
                                      key={day.value}
                                      type="button"
                                      onClick={() => toggleRepeatWeekday(day.value)}
                                      className={`px-3 py-1 rounded-full border text-sm ${
                                        isSelected
                                          ? "bg-[color:var(--wasatch-blue)] text-white border-[color:var(--wasatch-blue)]"
                                          : "bg-white text-[color:var(--wasatch-gray)] border-[color:var(--wasatch-gray)]/40"
                                      }`}
                                    >
                                      {day.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          <div>
                            <label htmlFor="repeat-end-type" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">End Condition</label>
                            <select
                              id="repeat-end-type"
                              name="repeatEndType"
                              value={repeatEndType}
                              onChange={(e) => setRepeatEndType(e.target.value as RepeatEndType)}
                              className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                            >
                              <option value="count">After Number of Occurrences</option>
                              <option value="date">On End Date</option>
                            </select>
                          </div>

                          {repeatEndType === "count" ? (
                            <div>
                              <label htmlFor="repeat-count" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">Occurrences</label>
                              <input
                                id="repeat-count"
                                name="repeatCount"
                                type="number"
                                min={1}
                                step="1"
                                value={repeatCount}
                                onChange={(e) => setRepeatCount(e.target.value)}
                                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                              />
                            </div>
                          ) : (
                            <div>
                              <label htmlFor="repeat-until-date" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">End Date</label>
                              <input
                                id="repeat-until-date"
                                name="repeatUntilDate"
                                type="date"
                                value={repeatUntilDate}
                                onChange={(e) => setRepeatUntilDate(e.target.value)}
                                className="w-full rounded-2xl border border-[color:var(--wasatch-gray)] bg-white px-4 py-2"
                              />
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="submit" variant="secondary" disabled={creatingEvent}>
                        {creatingEvent ? "Creating..." : isRepeating ? "Create Series" : "Create Event"}
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
        </div>
      ) : null}

      {couponModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)]">
                {couponFormStep === "form" ? "Create New Coupon" : "Review Coupon"}
              </h2>
              {!creatingCoupon && (
                <button
                  onClick={handleCloseCouponModal}
                  className="text-xl text-[color:var(--wasatch-gray)] hover:text-[color:var(--wasatch-red)]"
                >
                  ✕
                </button>
              )}
            </div>

            {couponsStatus && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  couponsStatus.includes("success") || couponsStatus.includes("successfully")
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {couponsStatus}
              </div>
            )}

            {couponFormStep === "form" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateCoupon();
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="coupon-code" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                    Coupon Code *
                  </label>
                  <input
                    id="coupon-code"
                    type="text"
                    placeholder="e.g., SAVE20"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    disabled={creatingCoupon}
                    className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="discount-type" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                    Discount Type *
                  </label>
                  <select
                    id="discount-type"
                    value={couponDiscountType}
                    onChange={(e) => {
                      const nextType = e.target.value as "dollar" | "percentage" | "bogo";
                      setCouponDiscountType(nextType);
                      if (nextType === "percentage") {
                        setCouponDiscountValue("");
                      }
                    }}
                    disabled={creatingCoupon}
                    className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                  >
                    <option value="dollar">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="bogo">Buy X Get Y</option>
                  </select>
                </div>

                {couponDiscountType !== "bogo" && (
                  <div>
                    <label htmlFor="discount-value" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                      {couponDiscountType === "percentage" ? "Percentage (1-100)" : "Dollar Amount"} *
                    </label>
                    <input
                      id="discount-value"
                      type="number"
                      placeholder={couponDiscountType === "percentage" ? "e.g., 20" : "e.g., 5"}
                      min={couponDiscountType === "percentage" ? "1" : "0.01"}
                      max={couponDiscountType === "percentage" ? "100" : undefined}
                      step={couponDiscountType === "percentage" ? "1" : "0.01"}
                      value={couponDiscountValue}
                      onChange={(e) => setCouponDiscountValue(e.target.value)}
                      disabled={creatingCoupon}
                      className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>
                )}

                {couponDiscountType === "bogo" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="bogo-buy-quantity" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                        Buy Quantity *
                      </label>
                      <input
                        id="bogo-buy-quantity"
                        type="number"
                        min="1"
                        step="1"
                        value={couponBogoBuyQuantity}
                        onChange={(e) => setCouponBogoBuyQuantity(e.target.value)}
                        disabled={creatingCoupon}
                        className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="bogo-get-quantity" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                        Get Quantity *
                      </label>
                      <input
                        id="bogo-get-quantity"
                        type="number"
                        min="1"
                        step="1"
                        value={couponBogoGetQuantity}
                        onChange={(e) => setCouponBogoGetQuantity(e.target.value)}
                        disabled={creatingCoupon}
                        className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="expiry-date" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                    Expiry Date (Optional)
                  </label>
                  <input
                    id="expiry-date"
                    type="date"
                    value={couponExpiryDate}
                    onChange={(e) => setCouponExpiryDate(e.target.value)}
                    disabled={creatingCoupon}
                    className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="max-uses" className="block text-sm font-medium text-[color:var(--wasatch-gray)] mb-1">
                    Times Per User *
                  </label>
                  <input
                    id="max-uses"
                    type="number"
                    placeholder="e.g., 1"
                    min="1"
                    step="1"
                    value={couponMaxUses}
                    onChange={(e) => setCouponMaxUses(e.target.value)}
                    disabled={creatingCoupon}
                    className="w-full rounded-lg border border-[color:var(--wasatch-gray)] bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={creatingCoupon} className="flex-1">
                    Review
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCloseCouponModal} disabled={creatingCoupon} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <div>
                    <p className="text-xs text-[color:var(--wasatch-gray)]">Code</p>
                    <p className="font-semibold text-[color:var(--wasatch-blue)]">{couponCode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[color:var(--wasatch-gray)]">Discount</p>
                    <p className="font-semibold">
                      {couponDiscountType === "bogo"
                        ? `Buy ${couponBogoBuyQuantity} Get ${couponBogoGetQuantity}`
                        : couponDiscountType === "percentage"
                          ? `${couponDiscountValue}% off`
                          : `$${couponDiscountValue} off`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[color:var(--wasatch-gray)]">Expires</p>
                    <p className="font-semibold">
                      {couponExpiryDate ? format(parseISO(couponExpiryDate), "MMM d, yyyy") : "No expiry"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[color:var(--wasatch-gray)]">Max Uses Per User</p>
                    <p className="font-semibold">{couponMaxUses}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" disabled={creatingCoupon} onClick={handleConfirmCreateCoupon} className="flex-1">
                    {creatingCoupon ? "Creating..." : "Create Coupon"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={creatingCoupon}
                    onClick={() => setCouponFormStep("form")}
                    className="flex-1"
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {viewingCouponUsageId && couponUsage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-2xl font-bold text-[color:var(--wasatch-red)]">
                Coupon Usage: {couponUsage.coupon.code}
              </h2>
              <button
                onClick={() => {
                  setViewingCouponUsageId(null);
                  setCouponUsage(null);
                }}
                className="text-xl text-[color:var(--wasatch-gray)] hover:text-[color:var(--wasatch-red)]"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-gray-50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[color:var(--wasatch-gray)]">Discount Type</p>
                  <p className="font-semibold text-[color:var(--wasatch-blue)]">{couponUsage.coupon.discountType}</p>
                </div>
                <div>
                  <p className="text-[color:var(--wasatch-gray)]">Discount Value</p>
                  <p className="font-semibold text-[color:var(--wasatch-blue)]">{couponUsage.coupon.discountValue}</p>
                </div>
              </div>
            </div>

            {couponUsage.usage.length === 0 ? (
              <p className="text-[color:var(--wasatch-gray)]">This coupon has not been used yet.</p>
            ) : (
              <div className="space-y-3">
                <h3 className="font-semibold text-[color:var(--wasatch-blue)]">Usage Details</h3>
                {couponUsage.usage.map((usage) => (
                  <div
                    key={usage.userId}
                    className="rounded-lg border border-[color:var(--wasatch-gray)]/30 bg-white p-3 text-sm space-y-3"
                  >
                    <div>
                      <p className="text-[color:var(--wasatch-gray)]">User ID</p>
                      <p className="font-mono text-xs break-all">{usage.userId}</p>
                      <p className="text-xs text-[color:var(--wasatch-gray)] mt-1">Uses: {usage.usageCount}</p>
                    </div>

                    <div className="space-y-2">
                      {usage.uses.map((singleUse, useIndex) => (
                        <div key={`${usage.userId}-${useIndex}`} className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[color:var(--wasatch-gray)]">Used At</p>
                            <p>{format(parseISO(singleUse.usedAt), "MMM d, yyyy • HH:mm")}</p>
                          </div>
                          <div>
                            <p className="text-[color:var(--wasatch-gray)]">Discount Amount</p>
                            <p className="font-semibold">${singleUse.discountAmount.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[color:var(--wasatch-gray)]">Order ID</p>
                            <p className="font-mono text-xs">{singleUse.orderId || "N/A"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-[color:var(--wasatch-gray)]/20">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setViewingCouponUsageId(null);
                  setCouponUsage(null);
                }}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
