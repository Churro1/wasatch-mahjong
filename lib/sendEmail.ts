import dns from "node:dns";
import nodemailer from "nodemailer";
import { requireAnyEnv } from "@/lib/env";

let hasSetDnsOrder = false;
let cachedTransporter: nodemailer.Transporter | null = null;
let cachedFromAddress = "";

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

function parsePort(value: string | undefined, fallback: number) {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("SMTP_PORT must be a valid port number between 1 and 65535.");
  }
  return parsed;
}

function setIpv4PreferredDnsOrder() {
  if (hasSetDnsOrder) {
    return;
  }

  hasSetDnsOrder = true;

  // Render and other hosts can fail on IPv6-only resolution paths (ENETUNREACH).
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    // Ignore when the Node runtime does not support changing DNS result order.
  }
}

function getTransportConfig() {
  setIpv4PreferredDnsOrder();

  const smtpUser = requireAnyEnv(["SMTP_USER", "GMAIL_USER"]);
  const smtpPass = requireAnyEnv(["SMTP_PASS", "GMAIL_PASS"]);
  const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const smtpSecure = parseBoolean(process.env.SMTP_SECURE, true);
  const smtpPort = parsePort(process.env.SMTP_PORT, smtpSecure ? 465 : 587);
  const fromAddress = process.env.EMAIL_FROM?.trim() || smtpUser;

  return {
    fromAddress,
    transporter: nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: !smtpSecure,
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        minVersion: "TLSv1.2",
        servername: smtpHost,
      },
    }),
  };
}

function getTransporter() {
  if (cachedTransporter) {
    return { fromAddress: cachedFromAddress, transporter: cachedTransporter };
  }

  const config = getTransportConfig();
  cachedTransporter = config.transporter;
  cachedFromAddress = config.fromAddress;
  return config;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const { fromAddress, transporter } = getTransporter();

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
}
