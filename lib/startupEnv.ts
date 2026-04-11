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

    const hasSendGridKey = Boolean(process.env.SENDGRID_API_KEY?.trim());
    const hasFromAddress = Boolean(process.env.EMAIL_FROM?.trim());

    if (hasSendGridKey && hasFromAddress) {
      return;
    }

    throw new Error(
      [
        "Missing required production email credentials:",
        "- Set SENDGRID_API_KEY",
        "- Set EMAIL_FROM",
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