import { db, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, unseal } from "@/lib/booking-security";
import { dispatchEmails, emailJob } from "@/lib/booking-outbox";
import { reminderEmail, type BookingDetails } from "@/lib/booking-emails";
import { addDays, chicagoDay } from "@/lib/booking-validation";
import { ensureNotified } from "@/lib/booking-payments";

// Queues a reminder for each confirmed appointment tomorrow (Chicago time). The
// flag is claimed first so an overlapping run can't send a second reminder.
async function queueReminders() {
  const tomorrow = addDays(chicagoDay(), 1);
  const due = await db.prepare("SELECT code FROM secure_bookings WHERE date = ? AND status = 'confirmed' AND reminder_sent = 0 LIMIT 25").bind(tomorrow).all();
  let queued = 0;
  for (const { code } of due.results ?? []) {
    const claimed = await db.prepare("UPDATE secure_bookings SET reminder_sent = 1 WHERE code = ? AND reminder_sent = 0 RETURNING details").bind(code).first();
    if (!claimed) continue;
    try {
      const details = await unseal(String(claimed.details)) as BookingDetails;
      await (await emailJob(String(code), `${code}-reminder`, reminderEmail(String(code), details))).run();
      queued++;
    } catch {
      await db.prepare("UPDATE secure_bookings SET reminder_sent = 0 WHERE code = ?").bind(code).run().catch(() => {});
      console.error("booking_reminder_queue_failed");
    }
  }
  return queued;
}

// Retries queued emails and purges expired data. Emails are normally sent right
// after booking; this is the safety net. Callers:
// - Vercel Cron (vercel.json) sends GET with `Authorization: Bearer <CRON_SECRET>`.
// - Any other scheduler can POST with `Authorization: Bearer <BOOKING_CRON_SECRET>`.
export const maxDuration = 60;

async function authorized(request: Request) {
  const supplied = request.headers.get("authorization") ?? "";
  if (supplied.length > 256) return false;
  const hashed = await digest(supplied);
  for (const secret of [process.env.BOOKING_CRON_SECRET, process.env.CRON_SECRET]) {
    // Compare keyed hashes rather than raw strings to avoid timing differences.
    if (secret && secret.length >= 32 && hashed === await digest(`Bearer ${secret}`)) return true;
  }
  return false;
}

async function maintain(request: Request) {
  try {
    requireBooking();
    if (!await authorized(request)) throw new HttpError(401, "Unauthorized.");
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare("DELETE FROM booking_limits WHERE expires < ?").bind(now),
      db.prepare("DELETE FROM secure_bookings WHERE delete_after < ?").bind(now),
      // Holds whose payment window has passed (normally Stripe's "expired" webhook does this).
      db.prepare(`UPDATE secure_bookings SET status = 'expired' WHERE status = 'pending' AND created_at < ?
        AND NOT EXISTS (SELECT 1 FROM booking_payments p WHERE p.code = secure_bookings.code AND p.hold_expires > ?)`).bind(now - 120, now),
      // Unpaid, abandoned bookings never became appointments: keep their details only briefly.
      db.prepare("DELETE FROM secure_bookings WHERE status = 'expired' AND created_at < ?").bind(now - 2 * 86400),
      db.prepare("DELETE FROM customer_codes WHERE expires < ?").bind(now),
      db.prepare("DELETE FROM customer_sessions WHERE expires < ?").bind(now),
      db.prepare("UPDATE booking_outbox SET status = 'failed', payload = '' WHERE status = 'pending' AND (deadline <= ? OR (attempts >= 5 AND lease_until < ?))").bind(now, now),
      db.prepare("DELETE FROM booking_outbox WHERE status IN ('sent', 'failed') AND deadline < ?").bind(now - 7 * 86400),
    ]);
    // A paid booking whose confirmation wasn't queued (interrupted mid-way): queue it now.
    const unnotified = await db.prepare(`SELECT code FROM secure_bookings b WHERE status = 'confirmed' AND created_at > ?
      AND NOT EXISTS (SELECT 1 FROM booking_outbox o WHERE o.id = b.code || '-booked') LIMIT 10`).bind(now - 6 * 86400).all();
    for (const { code } of unnotified.results ?? []) await ensureNotified(String(code)).catch(() => console.error("booking_notify_retry_failed"));
    const reminders = await queueReminders();
    const sent = await dispatchEmails(10);
    const failed = await db.prepare("SELECT count(*) AS count FROM booking_outbox WHERE status = 'failed'").first();
    const count = Number(failed?.count ?? 0);
    if (count > 0) console.error(`booking_email_failed_count=${count}`); // Shows up in Vercel logs for alerting.
    return json({ sent, reminders, failed: count });
  } catch (error) { return failure(error); }
}

export const GET = maintain;
export const POST = maintain;
