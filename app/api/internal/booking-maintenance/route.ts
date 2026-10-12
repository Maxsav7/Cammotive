import { db, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json } from "@/lib/booking-security";
import { dispatchEmails } from "@/lib/booking-outbox";

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
      // A booking with no queued emails means the save was interrupted halfway;
      // nobody was notified, so release the date. Outbox rows live at least 8 days,
      // so only look at bookings younger than that.
      db.prepare(`DELETE FROM secure_bookings WHERE created_at < ? AND created_at > ?
        AND NOT EXISTS (SELECT 1 FROM booking_outbox WHERE booking_outbox.booking_code = secure_bookings.code)`).bind(now - 600, now - 6 * 86400),
      db.prepare("UPDATE booking_outbox SET status = 'failed', payload = '' WHERE status = 'pending' AND (deadline <= ? OR (attempts >= 5 AND lease_until < ?))").bind(now, now),
      db.prepare("DELETE FROM booking_outbox WHERE status IN ('sent', 'failed') AND deadline < ?").bind(now - 7 * 86400),
    ]);
    const sent = await dispatchEmails(10);
    const failed = await db.prepare("SELECT count(*) AS count FROM booking_outbox WHERE status = 'failed'").first();
    const count = Number(failed?.count ?? 0);
    if (count > 0) console.error(`booking_email_failed_count=${count}`); // Shows up in Vercel logs for alerting.
    return json({ sent, failed: count });
  } catch (error) { return failure(error); }
}

export const GET = maintain;
export const POST = maintain;
