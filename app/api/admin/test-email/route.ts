import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/sendEmail";

function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown email error.";
  }

  const message = error.message || "Unknown email error.";

  // Avoid echoing secrets while still giving useful diagnostics.
  if (message.includes("Missing required environment variable")) {
    return message;
  }

  if (message.toLowerCase().includes("invalid login") || message.toLowerCase().includes("auth")) {
    return "Email authentication failed. Verify GMAIL_USER and GMAIL_PASS (App Password).";
  }

  return message;
}

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

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminCheck, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .limit(1);

  if (adminError || !adminCheck || adminCheck.length === 0) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const payload = await req.json();
  const toEmail = typeof payload.to === "string" ? payload.to.trim() : "";

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    return NextResponse.json(
      {
        error: "Test email failed.",
        details: "Missing GMAIL_USER or GMAIL_PASS in deployment environment variables.",
      },
      { status: 500 }
    );
  }

  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }

  try {
    const info = await sendEmail({
      to: toEmail,
      subject: "Wasatch Mahjong Email Test",
      html: `
        <h2>Email Test Successful</h2>
        <p>This is a test email from the Wasatch Mahjong admin dashboard.</p>
        <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
        <p>If you received this message, outgoing email is configured correctly.</p>
      `,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${toEmail}.`,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });
  } catch (error) {
    const details = sanitizeErrorMessage(error);
    console.error("Admin test email failed", error);
    return NextResponse.json(
      {
        error: "Test email failed.",
        details,
      },
      { status: 500 }
    );
  }
}
