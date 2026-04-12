import { requireEnv } from "@/lib/env";
import { MailerSend, Recipient, EmailParams, Sender } from "mailersend";

type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: "mailersend";
};

// Initialize MailerSend client with API key
function getMailerSendClient() {
  const apiKey = requireEnv("MAILERSEND_API_KEY");
  return new MailerSend({ apiKey });
}

async function sendViaMailerSend(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const mailerSend = getMailerSendClient();

  try {
    const response = await mailerSend.email.send(
      new EmailParams()
        .setFrom(new Sender(params.from))
        .setTo([new Recipient(params.to)])
        .setSubject(params.subject)
        .setHtml(params.html)
    );

    // MailerSend response headers contain the message ID
    const messageId = (response?.headers?.["x-message-id"] as string) || "";

    return {
      messageId,
      accepted: [params.to],
      rejected: [],
      provider: "mailersend",
    };
  } catch (error) {
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

  return sendViaMailerSend({
    from: fromAddress,
    to,
    subject,
    html,
  });
}
