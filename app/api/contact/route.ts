import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = enforceRateLimit(`contact:${ip}`, 5, 10 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many messages sent. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  const payload = await req.json();
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const website = typeof payload.website === "string" ? payload.website.trim() : "";

  if (website.length > 0) {
    return NextResponse.json({ success: true });
  }

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

  const adminEmail = process.env.CONTACT_TO_EMAIL || process.env.GMAIL_USER;
  if (!adminEmail) {
    return NextResponse.json({ error: "Admin email is not configured." }, { status: 500 });
  }

  try {
    await sendEmail({
      to: adminEmail,
      subject: `Contact Form: ${safeName}`,
      html: `
        <h2>New Contact Form Message</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact email delivery failed", error);
    return NextResponse.json({ error: "We could not send your message right now." }, { status: 500 });
  }
}