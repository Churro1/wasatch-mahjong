import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

  const { identifier } = await req.json();
  const normalizedIdentifier = typeof identifier === "string" ? identifier.trim() : "";

  if (!normalizedIdentifier) {
    return NextResponse.json({ error: "Enter an email address or user UUID." }, { status: 400 });
  }

  let targetUserId = normalizedIdentifier;
  let targetEmail: string | null = null;

  if (!isUuid(normalizedIdentifier)) {
    const normalizedEmail = normalizedIdentifier.toLowerCase();
    const { data: listedUsers, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listUsersError) {
      return NextResponse.json({ error: listUsersError.message }, { status: 500 });
    }

    const matchedUser = listedUsers.users.find(
      (listedUser) => listedUser.email?.trim().toLowerCase() === normalizedEmail
    );

    if (!matchedUser) {
      return NextResponse.json({ error: "No user with that email address was found." }, { status: 404 });
    }

    targetUserId = matchedUser.id;
    targetEmail = matchedUser.email || normalizedIdentifier;
  }

  const { error: insertError } = await supabaseAdmin.from("admin_users").insert({
    user_id: targetUserId,
    created_by: user.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    userId: targetUserId,
    email: targetEmail,
  });
}