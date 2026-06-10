import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PassProduct = {
  slug: string;
  name: string;
  priceCents: number;
  totalUses: number;
  shortDescription: string;
  benefits: string[];
  openPlayOnly: boolean;
  selfOnly: boolean;
};

export type PassRecord = {
  id: string;
  code: string;
  pass_slug: string;
  pass_name: string;
  total_uses: number;
  remaining_uses: number;
  currency: string;
  status: "active" | "redeemed" | "void" | "expired";
  issued_by_user_id: string | null;
  purchaser_email: string | null;
  purchaser_name: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  notes: string | null;
  expires_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  purchase_source: "purchase" | "admin";
  open_play_only: boolean;
  self_only: boolean;
  issued_at: string;
  redeemed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export const PASS_PRODUCTS: PassProduct[] = [
  {
    slug: "social-six-pass",
    name: "Social Six Pass",
    priceCents: 10000,
    totalUses: 6,
    shortDescription: "Pre-pay for five open play nights and get one free!.",
    benefits: [
      "Valid for 6 open play registrations",
      "Exclusive to the pass holder",
      "Convenient and fast checkout",
      "Does not expire",
    ],
    openPlayOnly: true,
    selfOnly: true,
  },
];

export function getPassProductBySlug(slug: string | null | undefined) {
  const normalizedSlug = (slug || "").trim().toLowerCase();
  return PASS_PRODUCTS.find((product) => product.slug === normalizedSlug) || null;
}

export function normalizePassCode(value: string | null | undefined) {
  return (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function generatePassCode() {
  return `PASS${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export function formatPassCode(value: string) {
  const normalized = normalizePassCode(value);
  return normalized.match(/.{1,4}/g)?.join("-") || normalized;
}

export async function ensurePassFromStripeSession(params: {
  supabaseAdmin: SupabaseAdminClient;
  session: {
    id: string;
    payment_intent?: string | { id?: string | null } | null;
    payment_status?: string | null;
    currency?: string | null;
    customer_email?: string | null;
    metadata?: Record<string, string | undefined> | null;
  };
}) {
  const { supabaseAdmin, session } = params;
  if (session.metadata?.purchaseType !== "pass") {
    return null;
  }

  const passSlug = session.metadata?.passSlug;
  const passProduct = getPassProductBySlug(passSlug);
  if (!passProduct) {
    throw new Error("Pass product not found.");
  }

  const { data: existingPass, error: existingError } = await supabaseAdmin
    .from("passes")
    .select(
      "id, code, pass_slug, pass_name, total_uses, remaining_uses, currency, status, issued_by_user_id, purchaser_email, purchaser_name, recipient_name, recipient_email, notes, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, purchase_source, open_play_only, self_only, issued_at, redeemed_at, created_at, updated_at"
    )
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingPass) {
    return existingPass as PassRecord;
  }

  const purchaserEmail = session.metadata?.purchaserEmail || session.customer_email || null;
  const purchaserName = session.metadata?.purchaserName || null;
  const recipientName = session.metadata?.recipientName || purchaserName || null;
  const recipientEmail = session.metadata?.recipientEmail || purchaserEmail;
  const notes = session.metadata?.notes || null;
  const issuedByUserId = session.metadata?.purchaserUserId || null;
  const currency = (session.currency || session.metadata?.currency || "usd").toLowerCase();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePassCode();
    const { data: insertedPass, error: insertError } = await supabaseAdmin
      .from("passes")
      .insert({
        code,
        pass_slug: passProduct.slug,
        pass_name: passProduct.name,
        total_uses: passProduct.totalUses,
        remaining_uses: passProduct.totalUses,
        currency,
        status: "active",
        issued_by_user_id: issuedByUserId,
        purchaser_email: purchaserEmail,
        purchaser_name: purchaserName,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        notes,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        purchase_source: "purchase",
        open_play_only: passProduct.openPlayOnly,
        self_only: passProduct.selfOnly,
      })
      .select(
        "id, code, pass_slug, pass_name, total_uses, remaining_uses, currency, status, issued_by_user_id, purchaser_email, purchaser_name, recipient_name, recipient_email, notes, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, purchase_source, open_play_only, self_only, issued_at, redeemed_at, created_at, updated_at"
      )
      .single();

    if (insertedPass) {
      return insertedPass as PassRecord;
    }

    if (!insertError) {
      break;
    }

    if (!/unique/i.test(insertError.message) || attempt === 4) {
      throw new Error(insertError.message);
    }
  }

  throw new Error("Failed to create pass record.");
}