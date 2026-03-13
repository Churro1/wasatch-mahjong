import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rateLimit = enforceRateLimit(`signup-email:${user.id}:${ip}`, 2, 60 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many welcome email requests. Please try later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  try {
    await sendEmail({
      to: user.email,
      subject: "Welcome to Wasatch Mahjong!",
      html: `<h1>Welcome!</h1><p>Thank you for signing up for Wasatch Mahjong. We're excited to have you!</p>`
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Signup welcome email failed", error);
    return NextResponse.json({ error: "We could not send your welcome email right now." }, { status: 500 });
  }
}
