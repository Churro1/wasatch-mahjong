const REQUIRED_PRODUCTION_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

let hasValidatedStartupEnv = false;

export function validateStartupEnv() {
  if (hasValidatedStartupEnv) {
    return;
  }

  hasValidatedStartupEnv = true;

  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = REQUIRED_PRODUCTION_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });

  if (missing.length === 0) {
    const hasSmtpCredentials = Boolean(
      process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()
    );
    const hasGmailCredentials = Boolean(
      process.env.GMAIL_USER?.trim() && process.env.GMAIL_PASS?.trim()
    );

    if (hasSmtpCredentials || hasGmailCredentials) {
      return;
    }

    throw new Error(
      [
        "Missing required production email credentials:",
        "- Set SMTP_USER and SMTP_PASS, or",
        "- Set GMAIL_USER and GMAIL_PASS",
      ].join("\n")
    );
  }

  throw new Error(
    [
      "Missing required production environment variables:",
      ...missing.map((name) => `- ${name}`),
      "Set these in your deployment platform before starting the app.",
    ].join("\n")
  );
}