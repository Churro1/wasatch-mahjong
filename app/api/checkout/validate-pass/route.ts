import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePassCode } from "@/lib/passes";

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

  const { passCode, eventId, attendeeCount } = await req.json();

  const normalizedCode = normalizePassCode(passCode);

  if (!normalizedCode) {
    return NextResponse.json({ error: "Pass code is required." }, { status: 400 });
  }

  if (!eventId) {
    return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
  }

  if (!attendeeCount || attendeeCount <= 0) {
    return NextResponse.json({ error: "Attendee count must be greater than zero." }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, event_type")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { data: pass, error: passError } = await supabaseAdmin
    .from("passes")
    .select("id, code, pass_name, remaining_uses, status, open_play_only, self_only, recipient_email")
    .eq("code", normalizedCode)
    .single();

  if (passError || !pass) {
    return NextResponse.json({ error: "Pass code not found." }, { status: 404 });
  }

  if (pass.status !== "active") {
    return NextResponse.json({ error: "This pass is not active." }, { status: 400 });
  }

  if (pass.remaining_uses <= 0) {
    return NextResponse.json({ error: "This pass has no remaining uses." }, { status: 400 });
  }

  if (pass.open_play_only && event.event_type !== "open_play") {
    return NextResponse.json({ error: "This pass can only be used for Open Play events." }, { status: 400 });
  }

  if (pass.self_only && pass.recipient_email !== user.email) {
    return NextResponse.json({ error: "This pass is restricted to the recipient only." }, { status: 400 });
  }

  const appliedUses = Math.min(attendeeCount, pass.remaining_uses);

  return NextResponse.json({
    pass: {
      code: pass.code,
      passName: pass.pass_name,
      remainingUses: pass.remaining_uses,
      availableUses: pass.remaining_uses,
      appliedUses,
      openPlayOnly: pass.open_play_only,
      selfOnly: pass.self_only,
    },
  });
}
