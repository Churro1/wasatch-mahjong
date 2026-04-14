import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escapeCsvValue(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminUser?.user_id) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { eventId } = await req.json();
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";

  if (!isUuid(normalizedEventId)) {
    return NextResponse.json({ error: "Valid event ID is required." }, { status: 400 });
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, name, event_date")
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  if (!eventRow) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from("checkout_orders")
    .select("id, checkout_order_attendees(full_name, email, phone, is_buyer)")
    .eq("event_id", normalizedEventId)
    .eq("status", "paid")
    .order("created_at", { ascending: true });

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const header = [
    "event_id",
    "event_name",
    "event_date",
    "order_id",
    "attendee_name",
    "attendee_email",
    "attendee_phone",
    "is_buyer",
  ];

  const rows: string[] = [header.map(escapeCsvValue).join(",")];

  for (const order of orders || []) {
    const attendees = order.checkout_order_attendees || [];
    for (const attendee of attendees) {
      rows.push(
        [
          eventRow.id,
          eventRow.name,
          eventRow.event_date,
          order.id,
          attendee.full_name || "",
          attendee.email || "",
          attendee.phone || "",
          attendee.is_buyer ? "yes" : "no",
        ]
          .map((value) => escapeCsvValue(String(value)))
          .join(",")
      );
    }
  }

  const csvBody = `\uFEFF${rows.join("\n")}`;
  const safeEventName = sanitizeFilePart(eventRow.name || "event");
  const safeDate = eventRow.event_date.slice(0, 10);
  const filename = `${safeEventName || "event"}-${safeDate}-contacts.csv`;

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
