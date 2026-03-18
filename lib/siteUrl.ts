import { NextRequest } from "next/server";

function toOrigin(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export function getSiteOrigin(req: NextRequest): string {
  const configuredOrigin =
    toOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    toOrigin(process.env.SITE_URL) ||
    toOrigin(process.env.RENDER_EXTERNAL_URL);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return req.nextUrl.origin;
}