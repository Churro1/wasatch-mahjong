import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/sendEmail";
import { PassRecord, formatPassCode } from "@/lib/passes";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPassEmailHtml(params: {
  recipientName: string;
  code: string;
  passName: string;
  totalUses: number;
}) {
  return `
    <h1>Wasatch Mahjong Pass</h1>
    <p>Hi ${escapeHtml(params.recipientName)},</p>
    <p>Thank you for purchasing the <strong>${escapeHtml(params.passName)}</strong>. This pass is valid for <strong>${params.totalUses}</strong> uses.</p>
    <p><strong>Your Pass Code is:</strong> ${escapeHtml(formatPassCode(params.code))}</p>
    <p>Enter this code at checkout to apply your pass to a booking.</p>
    <p>If you have questions, reply to this email or contact Wasatch Mahjong through the website.</p>
  `;
}

export async function sendPassDeliveryEmail(params: {
  supabaseAdmin: SupabaseAdminClient;
  pass: PassRecord;
}) {
  const { supabaseAdmin, pass } = params;

  if (pass.email_sent_at) {
    return 0;
  }

  const recipients = new Map<string, string>();
  if (pass.recipient_email) {
    recipients.set(pass.recipient_email.trim().toLowerCase(), pass.recipient_name || "there");
  }

  if (pass.purchaser_email) {
    const purchaserEmail = pass.purchaser_email.trim().toLowerCase();
    if (purchaserEmail && !recipients.has(purchaserEmail)) {
      recipients.set(purchaserEmail, pass.recipient_name || "there");
    }
  }

  let sentCount = 0;
  for (const [email, recipientName] of recipients.entries()) {
    try {
      await sendEmail({
        to: email,
        subject: `Your Wasatch Mahjong ${pass.pass_name}`,
        html: buildPassEmailHtml({
          recipientName,
          code: pass.code,
          passName: pass.pass_name,
          totalUses: pass.total_uses,
        }),
      });
      sentCount += 1;
    } catch (error) {
      console.error("Failed to send pass email", {
        passId: pass.id,
        email,
        error,
      });
    }
  }

  if (sentCount > 0) {
    await supabaseAdmin
      .from("passes")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", pass.id);
  }

  return sentCount;
}
