import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/sendEmail";

function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown email error.";
  }

  const message = error.message || "Unknown email error.";
  const lower = message.toLowerCase();

  // Avoid echoing secrets while still giving useful diagnostics.
  if (message.includes("Missing required environment variable")) {
    return message;
  }

  if (lower.includes("invalid login") || lower.includes("auth")) {
    return "Email authentication failed. Verify RESEND_API_KEY.";
  }

  if (lower.includes("resend")) {
    return "Resend API request failed. Verify RESEND_API_KEY and that EMAIL_FROM uses a verified sender/domain.";
  }

  if (lower.includes("abort") || lower.includes("timeout")) {
    return "Request to Resend timed out. Check deployment egress/network and retry.";
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

  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());

  if (!hasResend) {
    return NextResponse.json(
      {
        error: "Test email failed.",
        details: "Missing RESEND_API_KEY in deployment environment variables.",
      },
      { status: 500 }
    );
  }

  if (hasResend && !process.env.EMAIL_FROM?.trim()) {
    return NextResponse.json(
      {
        error: "Test email failed.",
        details: "EMAIL_FROM is required when using RESEND_API_KEY.",
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
      provider: info.provider,
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
