import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type EventCodeRow = {
  id: string;
  is_private: boolean;
  event_code: string | null;
};

export async function POST(req: NextRequest) {
  const { eventId, eventCode } = await req.json();

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  const normalizedCode = typeof eventCode === "string" ? eventCode.trim().toUpperCase() : "";

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("id, is_private, event_code")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const eventRow = data as EventCodeRow;
  if (!eventRow.is_private) {
    return NextResponse.json({ valid: true, requiresCode: false });
  }

  if (!normalizedCode) {
    return NextResponse.json({ error: "Event code is required for this private event." }, { status: 400 });
  }

  if (!eventRow.event_code || normalizedCode !== eventRow.event_code) {
    return NextResponse.json({ error: "Invalid event code." }, { status: 401 });
  }

  return NextResponse.json({ valid: true, requiresCode: true });
}
