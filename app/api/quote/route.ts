import { quoteSchema } from "@/lib/booking-validation";
import { quoteServices } from "@/lib/booking-catalog";
import { limit, limitRequest, requireBooking } from "@/lib/booking-store";
import { failure, HttpError, json, readJson, token, verifyBot } from "@/lib/booking-security";
import { emailJobs, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { camQuoteEmail, quoteReceivedEmail } from "@/lib/booking-emails";

// Ceramic coating, paint correction and tint are quoted by Cam before booking.
// Nothing is stored except the encrypted emails in the outbox (erased once sent).
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
    await (await emailJobs(null, [[`${reference}-cam`, camQuoteEmail(reference, details)], [`${reference}-ack`, quoteReceivedEmail(reference, details)]])).run();
    sendQueuedEmailsSoon();
    return json({ reference, message: "Request received. Cam will reply within one business day." }, 201);
  } catch (error) { return failure(error); }
}
