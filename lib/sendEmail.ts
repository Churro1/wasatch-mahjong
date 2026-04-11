import { requireEnv } from "@/lib/env";
import dns from "node:dns";
import nodemailer from "nodemailer";

try {
  // Render deployments may not have reliable IPv6 egress; prefer IPv4 for SMTP lookups.
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore in environments that do not support changing default DNS order.
}

type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: "smtp";
};

let transporter: nodemailer.Transporter | null = null;

function isSecureSmtp(port: number, secureEnv: string | undefined) {
  if (typeof secureEnv === "string" && secureEnv.trim().length > 0) {
    return secureEnv.trim().toLowerCase() === "true";
  }

  // Port 465 is implicit TLS by convention.
  return port === 465;
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = requireEnv("SMTP_HOST");
  const portValue = requireEnv("SMTP_PORT");
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");
  const port = Number.parseInt(portValue, 10);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error("SMTP_PORT must be a valid positive integer.");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecureSmtp(port, process.env.SMTP_SECURE),
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

async function sendViaSmtp(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const smtp = getTransporter();
  const info = await smtp.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  const accepted = (info.accepted || []).map((value: string | { address: string }) =>
    typeof value === "string" ? value : value.address
  );
  const rejected = (info.rejected || []).map((value: string | { address: string }) =>
    typeof value === "string" ? value : value.address
  );

  return {
    messageId: info.messageId || "",
    accepted,
    rejected,
    provider: "smtp",
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
  const fromAddress = requireEnv("EMAIL_FROM");

  return sendViaSmtp({
    from: fromAddress,
    to,
    subject,
    html,
  });
}
