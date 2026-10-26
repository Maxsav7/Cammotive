import { requireBooking } from "@/lib/booking-store";
import { failure, HttpError, json } from "@/lib/booking-security";
import { confirmPaid, releaseHold } from "@/lib/booking-payments";
import { verifyWebhook, type CheckoutSession } from "@/lib/stripe";

// Stripe calls this when a deposit is paid or a Checkout Session expires. Every
// request must carry a valid, recent Stripe signature. Handlers are idempotent, so
// Stripe's retries (and duplicate deliveries) are harmless. A non-2xx response makes
// Stripe retry, which is what we want if the database is briefly unavailable.
export async function POST(request: Request) {
  try {
    requireBooking();
    const raw = await request.text();
    if (raw.length > 256 * 1024) throw new HttpError(413, "Too large.");
    if (!await verifyWebhook(raw, request.headers.get("stripe-signature"))) throw new HttpError(400, "Invalid signature.");
    const event = JSON.parse(raw) as { type: string; data: { object: CheckoutSession } };
    const session = event.data?.object;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await confirmPaid(session);
    else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") await releaseHold(session.id);
    return json({ received: true });
  } catch (error) { return failure(error); }
}
