import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/sendEmail";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  try {
    await sendEmail({
      to: email,
      subject: "Welcome to Wasatch Mahjong!",
      html: `<h1>Welcome!</h1><p>Thank you for signing up for Wasatch Mahjong. We're excited to have you!</p>`
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
