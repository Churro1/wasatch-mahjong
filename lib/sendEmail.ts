import { requireEnv } from "@/lib/env";
import sgMail from "@sendgrid/mail";

type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: "sendgrid";
};

// Initialize SendGrid client with API key
function getSendGridClient() {
  const apiKey = requireEnv("SENDGRID_API_KEY");
  sgMail.setApiKey(apiKey);
  return sgMail;
}

async function sendViaSendGrid(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const sendGrid = getSendGridClient();

  try {
    const response = await sendGrid.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    // SendGrid returns an array of responses; take the first
    const firstResponse = response[0];
    const messageId = firstResponse.headers["x-message-id"] || "";

    return {
      messageId,
      accepted: [params.to],
      rejected: [],
      provider: "sendgrid",
    };
  } catch (error) {
    // If SendGrid rejects, return error in rejected field
    const rejected = error instanceof Error && "response" in error ? [params.to] : [params.to];
    throw error;
  }
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
  const fromAddress = requireEnv("EMAIL_FROM");

  return sendViaSendGrid({
    from: fromAddress,
    to,
    subject,
    html,
  });
}
