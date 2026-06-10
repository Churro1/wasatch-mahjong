import { sendEmail } from "@/lib/sendEmail";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type OrderDetails = {
  id: string;
  confirmation_email_sent_at: string | null;
  checkout_order_attendees:
    | Array<{
        full_name: string;
        email: string | null;
        is_buyer: boolean;
      }>
    | null;
  events:
    | {
        name: string;
        event_date: string;
      }
    | Array<{
        name: string;
        event_date: string;
      }>
    | null;
};

type EmailRecipient = {
  email: string;
  name: string;
};

function buildBuyerConfirmationEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  attendeeCount: number;
  totalAmount: number;
}) {
  return `
    <h1>Wasatch Mahjong Confirmation</h1>
    <p>Hi ${params.attendeeName},</p>
    <p>Your registration for <strong>${params.eventName}</strong> is confirmed.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    <p><strong>Attendees on Order:</strong> ${params.attendeeCount}</p>
    <p><strong>Total Paid:</strong> $${(params.totalAmount / 100).toFixed(2)}</p>
    <h2>Day Of</h2>
    <ul>
      <li>Show up 15 minutes early to get signed in and settled.</li>
      <li>No need to bring tiles.</li>
      <li>Bring a card if you want.</li>
    </ul>
    <h2>Cancellation Policy</h2>
    <p>Cancellations require at least 24 hours notice and include a $10 cancellation fee.</p>
  `;
}

function buildGuestConfirmationEmailHtml(params: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  buyerName: string;
}) {
  return `
    <h1>Wasatch Mahjong Confirmation</h1>
    <p>Hi ${params.attendeeName},</p>
    <p><strong>${params.buyerName}</strong> has registered you for <strong>${params.eventName}</strong>.</p>
    <p><strong>Date:</strong> ${params.eventDate}</p>
    <h2>Day Of</h2>
    <ul>
      <li>Show up 15 minutes early to get signed in and settled.</li>
      <li>No need to bring tiles.</li>
      <li>Bring a card if you want.</li>
    </ul>
    <h2>Cancellation Policy</h2>
    <p>Cancellations require at least 24 hours notice and include a $10 cancellation fee.</p>
  `;
}

export async function sendOrderConfirmationEmails(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  orderId: string;
  buyerEmail: string | null;
  attendeeCount: number;
  totalAmount: number;
}): Promise<{ sentCount: number; confirmationEmailSentAt: string | null }> {
  const { supabaseAdmin, orderId, buyerEmail, attendeeCount, totalAmount } = params;

  const { data: orderDetails, error: orderDetailsError } = await supabaseAdmin
    .from("checkout_orders")
    .select("id, confirmation_email_sent_at, checkout_order_attendees(full_name, email, is_buyer), events(name, event_date)")
    .eq("id", orderId)
    .single();

  if (orderDetailsError || !orderDetails) {
    console.error("Failed to load order details for confirmation email", {
      orderId,
      error: orderDetailsError?.message,
    });
    return { sentCount: 0, confirmationEmailSentAt: null };
  }

  const order = orderDetails as OrderDetails;
  if (order.confirmation_email_sent_at) {
    return { sentCount: 0, confirmationEmailSentAt: order.confirmation_email_sent_at };
  }

  const eventSummary = order.events ? (Array.isArray(order.events) ? order.events[0] : order.events) : null;
  const uniqueEmails = new Set<string>();
  const recipients: EmailRecipient[] = [];
  const buyerAttendee = (order.checkout_order_attendees || []).find((attendee) => attendee.is_buyer) || null;
  const buyerEmailFromOrder = buyerAttendee?.email?.trim().toLowerCase() || "";
  const buyerEmailFromFinalize = typeof buyerEmail === "string" ? buyerEmail.trim().toLowerCase() : "";
  const normalizedBuyerEmail = buyerEmailFromFinalize || buyerEmailFromOrder;
  const buyerName = buyerAttendee?.full_name || "there";

  if (normalizedBuyerEmail) {
    uniqueEmails.add(normalizedBuyerEmail);
    recipients.push({ email: normalizedBuyerEmail, name: buyerName });
  }

  for (const attendee of order.checkout_order_attendees || []) {
    if (!attendee.email) {
      continue;
    }
    const email = attendee.email.trim().toLowerCase();
    if (!email || uniqueEmails.has(email)) {
      continue;
    }
    uniqueEmails.add(email);
    recipients.push({ email, name: attendee.full_name });
  }

  let sentCount = 0;
  for (const recipient of recipients) {
    try {
      const isBuyer = recipient.email === normalizedBuyerEmail;
      const emailHtml = isBuyer
        ? buildBuyerConfirmationEmailHtml({
            attendeeName: recipient.name,
            eventName: eventSummary?.name || "Wasatch Mahjong Event",
            eventDate: eventSummary?.event_date || "",
            attendeeCount,
            totalAmount,
          })
        : buildGuestConfirmationEmailHtml({
            attendeeName: recipient.name,
            eventName: eventSummary?.name || "Wasatch Mahjong Event",
            eventDate: eventSummary?.event_date || "",
            buyerName,
          });

      await sendEmail({
        to: recipient.email,
        subject: `Wasatch Mahjong Confirmation: ${eventSummary?.name || "Your Event"}`,
        html: emailHtml,
      });
      sentCount += 1;
    } catch (recipientEmailError) {
      console.error("Failed to send confirmation email to recipient", {
        orderId,
        recipientEmail: recipient.email,
        error: recipientEmailError,
      });
    }
  }

  const confirmationEmailSentAt = sentCount > 0 ? new Date().toISOString() : null;
  if (confirmationEmailSentAt) {
    await supabaseAdmin.from("checkout_orders").update({ confirmation_email_sent_at: confirmationEmailSentAt }).eq("id", orderId);
  }

  return { sentCount, confirmationEmailSentAt };
}