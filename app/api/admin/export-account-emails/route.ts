import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

  const allUsers: Array<{ id: string; email: string | null; created_at: string | null }> = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users = data.users || [];
    for (const account of users) {
      allUsers.push({
        id: account.id,
        email: account.email || null,
        created_at: account.created_at || null,
      });
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  const header = ["email", "user_id", "created_at"];
  const rows: string[] = [header.map(escapeCsvValue).join(",")];

  for (const account of allUsers) {
    if (!account.email) {
      continue;
    }

    rows.push(
      [account.email, account.id, account.created_at || ""]
        .map((value) => escapeCsvValue(String(value)))
        .join(",")
    );
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `${sanitizeFilePart("wasatch-mahjong-accounts")}-${datePart}.csv`;
  const csvBody = `\uFEFF${rows.join("\n")}`;

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
