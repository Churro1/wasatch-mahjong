import { requireEnv } from "@/lib/env";

type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: "resend";
};

async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let payload: { id?: string; message?: string; error?: string } = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as { id?: string; message?: string; error?: string };
    } catch {
      payload = { message: responseText };
    }
  }

  if (!response.ok) {
    const details = payload.error || payload.message || "Unknown Resend API error.";
    throw new Error(`Resend API request failed (${response.status}): ${details}`);
  }

  return {
    messageId: payload.id || "",
    accepted: [params.to],
    rejected: [],
    provider: "resend",
  };
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const fromAddress = requireEnv("EMAIL_FROM");

  return sendViaResend({
    apiKey,
    from: fromAddress,
    to,
    subject,
    html,
  });
}
