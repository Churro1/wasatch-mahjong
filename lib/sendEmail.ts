import nodemailer from "nodemailer";
import { requireEnv } from "@/lib/env";

function getTransportConfig() {
  const gmailUser = requireEnv("GMAIL_USER");
  const gmailPass = requireEnv("GMAIL_PASS");

  return {
    gmailUser,
    transporter: nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    }),
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
}) {
  const { gmailUser, transporter } = getTransportConfig();

  const mailOptions = {
    from: gmailUser,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
}
