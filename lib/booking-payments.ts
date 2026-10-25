// The deposit lifecycle of an online booking, shared by the booking API, the
// Stripe webhook, the page customers return to after paying, and maintenance.
//
//   pending (slot held while paying) ──paid──▶ confirmed ──▶ cancelled
//          └──── hold runs out / payment abandoned ──▶ expired
//
// A pending booking only blocks its slot while its hold is live (or for its first
// two minutes, before the Stripe session exists). Payment confirms it and only
// then are the confirmation emails and calendar event queued.
import { db } from "./booking-store";
import { digest, unseal } from "./booking-security";
import { emailJobs, sendQueuedEmailsSoon, type OutboxJob } from "./booking-outbox";
import { bookedEmail, camBookingEmail, camCancelledEmail, cancelledEmail, slotLostEmail, type BookingDetails } from "./booking-emails";
import { googleCalendarReady } from "./google-calendar";
import { refundDeposit, type CheckoutSession } from "./stripe";

const now = () => Math.floor(Date.now() / 1000);

// Bookings that occupy their slot right now. `?` is the current time.
export const ACTIVE = `(b.status = 'confirmed' OR (b.status = 'pending' AND (b.created_at > ? - 120
  OR EXISTS (SELECT 1 FROM booking_payments p WHERE p.code = b.code AND p.hold_expires > ?))))`;
export const activeParams = () => { const t = now(); return [t, t]; };

// Private links are derived from the booking code with the server's secret, so they
// never need storing or rotating; only their keyed hash is in the database.
export const customerToken = (code: string) => digest(`customer-link:${code}`);
export const camToken = (code: string) => digest(`cam-link:${code}`);

// Frees a slot whose hold ran out, so it can be booked again (the active-slot index
// would otherwise refuse the new booking).
export async function releaseStaleHolds(date: string, time: string) {
  const t = now();
  await db.prepare(`UPDATE secure_bookings SET status = 'expired' WHERE date = ? AND time = ? AND status = 'pending' AND created_at <= ? - 120
    AND NOT EXISTS (SELECT 1 FROM booking_payments p WHERE p.code = secure_bookings.code AND p.hold_expires > ?)`).bind(date, time, t, t).run();
}

// Confirmation emails, Cam's notification and the calendar event for a paid booking.
// Safe to call repeatedly: it only queues if nothing was queued yet, and a racing
// second call fails on the outbox primary key instead of sending twice.
export async function ensureNotified(code: string) {
  if (await db.prepare("SELECT 1 AS queued FROM booking_outbox WHERE id = ?").bind(`${code}-booked`).first()) return;
  const row = await db.prepare("SELECT details FROM secure_bookings WHERE code = ? AND status = 'confirmed'").bind(code).first();
  if (!row) return;
  const d = await unseal(String(row.details)) as BookingDetails;
  const jobs: [string, OutboxJob][] = [
    [`${code}-booked`, bookedEmail(code, d, await customerToken(code))],
    [`${code}-cam`, camBookingEmail(code, d, await camToken(code))],
  ];
  if (googleCalendarReady()) jobs.push([`${code}-calendar`, { kind: "calendar", op: "create", event: {
    code, date: d.date, time: d.time, title: `${d.packageName}: ${d.name}`, location: d.address,
    description: [`${d.packageName}${d.addOns ? ` + ${d.addOns}` : ""}`, `Estimate $${d.total}, $50 deposit paid`, "",
      d.name, d.phone, d.email, d.vehicle, "", `Reference ${code}. Booked online at Camotive.`].join("\n"),
  } }]);
  try { await (await emailJobs(code, jobs)).run(); }
  catch (error) {
    if (await db.prepare("SELECT 1 AS queued FROM booking_outbox WHERE id = ?").bind(`${code}-booked`).first()) return; // a concurrent call won
    throw error;
  }
  sendQueuedEmailsSoon();
}

// Called when Stripe says the deposit is paid (webhook, or the return page checking
// Stripe directly). Idempotent.
export async function confirmPaid(session: CheckoutSession) {
  if (session.payment_status !== "paid") return null;
  const payment = await db.prepare("SELECT code, paid_at FROM booking_payments WHERE checkout_id = ?").bind(session.id).first();
  if (!payment) return null;
  const code = String(payment.code);
  if (!payment.paid_at) await db.prepare("UPDATE booking_payments SET paid_at = ?, payment_intent = ? WHERE code = ? AND paid_at IS NULL")
    .bind(now(), session.payment_intent, code).run();
  try {
    await db.prepare("UPDATE secure_bookings SET status = 'confirmed', decided_at = ? WHERE code = ? AND status IN ('pending', 'expired')").bind(now(), code).run();
  } catch (error) {
    // If the hold had run out and someone else booked the slot, the active-slot index
    // refuses this one: refund in full and tell the customer. Any other failure is
    // rethrown so Stripe retries the webhook.
    const booking = await db.prepare("SELECT date, time FROM secure_bookings WHERE code = ?").bind(code).first();
    const rival = booking && await db.prepare("SELECT 1 AS taken FROM secure_bookings WHERE date = ? AND time = ? AND code != ? AND status IN ('pending', 'confirmed')")
      .bind(booking.date, booking.time, code).first();
    if (!rival) throw error;
    await refundLostSlot(code, session.payment_intent);
    return code;
  }
  await ensureNotified(code);
  return code;
}

async function refundLostSlot(code: string, paymentIntent: string | null) {
  const claimed = await db.prepare("UPDATE secure_bookings SET status = 'refunded' WHERE code = ? AND status IN ('pending', 'expired') RETURNING details").bind(code).first();
  if (!claimed) return;
  if (paymentIntent) await refundDeposit(paymentIntent, code);
  await db.prepare("UPDATE booking_payments SET refunded_at = ? WHERE code = ?").bind(now(), code).run();
  const d = await unseal(String(claimed.details)) as BookingDetails;
  await (await emailJobs(code, [[`${code}-slot-lost`, slotLostEmail(code, d)], [`${code}-slot-lost-cam`, { ...slotLostEmail(code, d), to: process.env.CAM_BOOKING_EMAIL!, subject: `Refunded automatically: ${code} paid after its hold expired` }]])).run();
  sendQueuedEmailsSoon();
}

// Stripe ended the Checkout Session unpaid: release the slot.
export async function releaseHold(checkoutId: string) {
  await db.prepare(`UPDATE secure_bookings SET status = 'expired'
    WHERE status = 'pending' AND code = (SELECT code FROM booking_payments WHERE checkout_id = ?)`).bind(checkoutId).run();
}

// Cancels a confirmed booking. If Camotive cancels, the deposit is refunded first
// (so a refund failure leaves the booking in place to retry); if the customer
// cancels, the deposit is kept, as agreed when booking.
export async function cancelBooking(code: string, by: "customer" | "camotive") {
  const row = await db.prepare(`SELECT b.status, b.details, p.payment_intent, p.refunded_at FROM secure_bookings b
    LEFT JOIN booking_payments p ON p.code = b.code WHERE b.code = ?`).bind(code).first();
  if (!row || row.status !== "confirmed") return null;
  if (by === "camotive" && row.payment_intent && !row.refunded_at) {
    await refundDeposit(String(row.payment_intent), code);
    await db.prepare("UPDATE booking_payments SET refunded_at = ? WHERE code = ?").bind(now(), code).run();
  }
  const updated = await db.prepare("UPDATE secure_bookings SET status = 'cancelled', decided_at = ? WHERE code = ? AND status = 'confirmed' RETURNING code").bind(now(), code).first();
  if (!updated) return null;
  await db.prepare("UPDATE booking_payments SET cancelled_by = ? WHERE code = ?").bind(by, code).run();
  const d = await unseal(String(row.details)) as BookingDetails;
  const jobs: [string, OutboxJob][] = [[`${code}-cancelled`, cancelledEmail(code, d, by)]];
  if (by === "customer") jobs.push([`${code}-cancelled-cam`, camCancelledEmail(code, d)]);
  if (googleCalendarReady()) jobs.push([`${code}-calendar-delete`, { kind: "calendar", op: "delete", code }]);
  try {
    await (await emailJobs(code, jobs)).run();
  } catch (error) {
    // Undo, so the cancel can be retried rather than leave anyone unaware.
    await db.prepare("UPDATE secure_bookings SET status = 'confirmed' WHERE code = ? AND status = 'cancelled'").bind(code).run().catch(() => {});
    throw error;
  }
  sendQueuedEmailsSoon();
  return d;
}
