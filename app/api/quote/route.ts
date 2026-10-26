import { quoteSchema } from "@/lib/booking-validation";
import { quoteServices } from "@/lib/booking-catalog";
import { db, limit, limitRequest, requireBooking } from "@/lib/booking-store";
import { failure, HttpError, json, readJson, seal, token, verifyBot } from "@/lib/booking-security";
import { emailJobs, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { camQuoteEmail, quoteReceivedEmail } from "@/lib/booking-emails";

// Ceramic coating and paint correction are quoted before booking.
// The request is kept, encrypted, for Cam's dashboard (deleted after 180 days),
// and emailed to Cam with an acknowledgement to the customer.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "quote", 5);
    const parsed = quoteSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Please check your vehicle and contact details.");
    const { turnstileToken, ...quote } = parsed.data;
    await verifyBot(turnstileToken, "quote");
    await limit("quote-recipient", quote.email, 3, 86400);
    await limit("quote-budget", "global", 30, 86400);
    const reference = `Q-${token().slice(0, 8).toUpperCase()}`;
    const details = { ...quote, service: quoteServices[quote.service] };
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO quote_requests (reference, details, status, created_at, delete_after) VALUES (?, ?, 'new', ?, ?)")
      .bind(reference, await seal(details), now, now + 180 * 86400).run();
    try {
      await (await emailJobs(null, [[`${reference}-cam`, camQuoteEmail(reference, details)], [`${reference}-ack`, quoteReceivedEmail(reference, details)]])).run();
    } catch (error) {
      await db.prepare("DELETE FROM quote_requests WHERE reference = ?").bind(reference).run().catch(() => {});
      throw error;
    }
    sendQueuedEmailsSoon();
    return json({ reference, message: "Request received. We'll reply within one business day." }, 201);
  } catch (error) { return failure(error); }
}
