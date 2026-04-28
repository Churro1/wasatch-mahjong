import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/sendEmail";

export type GiftCardRecord = {
  id: string;
  code: string;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  status: "active" | "redeemed" | "void" | "expired";
  issued_by_user_id: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  expires_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  purchase_source: "purchase" | "admin";
  issued_at: string;
  redeemed_at: string | null;
  email_sent_at: string | null;
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export function normalizeGiftCardCode(value: string | null | undefined) {
  return (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function generateGiftCardCode() {
  return `WM${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

export function formatGiftCardCode(value: string) {
  const normalized = normalizeGiftCardCode(value);
  return normalized.match(/.{1,4}/g)?.join("-") || normalized;
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildGiftCardEmailHtml(params: {
  recipientName: string;
  code: string;
  amountCents: number;
  senderName?: string | null;
  message?: string | null;
}) {
  const senderLine = params.senderName ? `<p><strong>From:</strong> ${escapeHtml(params.senderName)}</p>` : "";
  const messageBlock = params.message
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #b21f2d;background:#f8f5f1;">${escapeHtml(params.message)}</blockquote>`
    : "";

  return `
    <h1>Wasatch Mahjong Gift Card</h1>
    <p>Hi ${escapeHtml(params.recipientName)},</p>
    <p>You have a Wasatch Mahjong gift card for <strong>${formatCurrency(params.amountCents)}</strong>.</p>
    ${senderLine}
    ${messageBlock}
    <p><strong>Gift Card Code:</strong> ${escapeHtml(formatGiftCardCode(params.code))}</p>
    <p>Enter this code at checkout to apply the gift card balance to your booking.</p>
    <p>If you have questions, reply to this email or contact Wasatch Mahjong through the website.</p>
  `;
}

export async function sendGiftCardDeliveryEmails(params: {
  supabaseAdmin: SupabaseAdminClient;
  giftCard: GiftCardRecord;
  senderName?: string | null;
}) {
  const { supabaseAdmin, giftCard, senderName } = params;
  if (giftCard.email_sent_at) {
    return 0;
  }

  const recipients = new Map<string, string>();
  if (giftCard.recipient_email) {
    recipients.set(giftCard.recipient_email.trim().toLowerCase(), giftCard.recipient_name || "there");
  }

  if (giftCard.purchaser_email) {
    const purchaserEmail = giftCard.purchaser_email.trim().toLowerCase();
    if (purchaserEmail && !recipients.has(purchaserEmail)) {
      recipients.set(purchaserEmail, giftCard.recipient_name || "there");
    }
  }

  let sentCount = 0;
  for (const [email, recipientName] of recipients.entries()) {
    try {
      await sendEmail({
        to: email,
        subject: "Your Wasatch Mahjong Gift Card",
        html: buildGiftCardEmailHtml({
          recipientName,
          code: giftCard.code,
          amountCents: giftCard.original_amount,
          senderName,
          message: giftCard.message,
        }),
      });
      sentCount += 1;
    } catch (error) {
      console.error("Failed to send gift card email", {
        giftCardId: giftCard.id,
        email,
        error,
      });
    }
  }

  if (sentCount > 0) {
    await supabaseAdmin
      .from("gift_cards")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", giftCard.id);
  }

  return sentCount;
}

export async function ensureGiftCardFromStripeSession(params: {
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
  const purchaseType = session.metadata?.purchaseType;
  if (purchaseType !== "gift_card") {
    return null;
  }

  const { data: existingGiftCard, error: existingError } = await supabaseAdmin
    .from("gift_cards")
    .select("id, code, original_amount, remaining_amount, currency, status, issued_by_user_id, purchaser_email, recipient_name, recipient_email, message, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, purchase_source, issued_at, redeemed_at, email_sent_at")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingGiftCard) {
    return existingGiftCard as GiftCardRecord;
  }

  const parsedAmount = Number(session.metadata?.giftCardAmount);
  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Gift card amount is required.");
  }

  const purchaserEmail = session.metadata?.purchaserEmail || session.customer_email || null;
  const recipientName = session.metadata?.recipientName || null;
  const recipientEmail = session.metadata?.recipientEmail || null;
  const message = session.metadata?.giftCardMessage || null;
  const issuedByUserId = session.metadata?.purchaserUserId || null;
  const currency = (session.currency || session.metadata?.currency || "usd").toLowerCase();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateGiftCardCode();
    const { data: insertedGiftCard, error: insertError } = await supabaseAdmin
      .from("gift_cards")
      .insert({
        code,
        original_amount: parsedAmount,
        remaining_amount: parsedAmount,
        currency,
        status: "active",
        issued_by_user_id: issuedByUserId,
        purchaser_email: purchaserEmail,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        message,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        purchase_source: "purchase",
      })
      .select("id, code, original_amount, remaining_amount, currency, status, issued_by_user_id, purchaser_email, recipient_name, recipient_email, message, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, purchase_source, issued_at, redeemed_at, email_sent_at")
      .single();

    if (insertedGiftCard) {
      return insertedGiftCard as GiftCardRecord;
    }

    if (!insertError) {
      break;
    }

    if (insertError.code !== "23505") {
      throw new Error(insertError.message);
    }
  }

  throw new Error("Failed to generate a unique gift card code.");
}