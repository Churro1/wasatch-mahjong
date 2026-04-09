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
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return;
    }

    const hasSmtpHost = Boolean(process.env.SMTP_HOST?.trim());
    const hasSmtpPort = Boolean(process.env.SMTP_PORT?.trim());
    const hasSmtpUser = Boolean(process.env.SMTP_USER?.trim());
    const hasSmtpPass = Boolean(process.env.SMTP_PASS?.trim());
    const hasFromAddress = Boolean(process.env.EMAIL_FROM?.trim());

    if (hasSmtpHost && hasSmtpPort && hasSmtpUser && hasSmtpPass && hasFromAddress) {
      return;
    }

    throw new Error(
      [
        "Missing required production email credentials:",
        "- Set SMTP_HOST",
        "- Set SMTP_PORT",
        "- Set SMTP_USER",
        "- Set SMTP_PASS",
        "- Set EMAIL_FROM",
        "- Optional: set SMTP_SECURE=true for implicit TLS (usually port 465)",
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