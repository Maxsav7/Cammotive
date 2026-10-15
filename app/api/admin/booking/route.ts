import { decisionSchema } from "@/lib/booking-validation";
import { db, limitRequest, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, unseal } from "@/lib/booking-security";
import { emailJobs, sendQueuedEmailsSoon, type OutboxJob } from "@/lib/booking-outbox";
import { cancelledEmail, type BookingDetails } from "@/lib/booking-emails";
import { googleCalendarReady } from "@/lib/google-calendar";

// Cam's private link (from the new-booking email) opens one booking, where he can
// cancel it. The admin token is a 256-bit secret sent only to Cam, stored here
// only as a keyed hash.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "admin", 60);
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) throw new HttpError(401, "Open this page from the link in your booking email.");
    const parsed = decisionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const { code, action } = parsed.data;
    const adminHash = await digest(authorization.slice(7));
    const row = await db.prepare("SELECT code, date, time, status, details FROM secure_bookings WHERE code = ? AND admin_token_hash = ? AND delete_after > ?")
      .bind(code, adminHash, Math.floor(Date.now() / 1000)).first();
    if (!row) throw new HttpError(401, "This link is invalid or the booking no longer exists.");
    const details = await unseal(String(row.details)) as BookingDetails;
    const view = () => ({ booking: { ...details, code: row.code, date: row.date, time: row.time, status: row.status } });
    if (action === "view") return json(view());
    if (row.status !== "confirmed" && row.status !== "pending") throw new HttpError(409, `This booking was already ${row.status}.`);
    // Cancelling releases the slot (the active-slot index only covers pending/confirmed),
    // emails the customer and removes the event from Cam's calendar.
    const updated = await db.prepare("UPDATE secure_bookings SET status = 'cancelled', decided_at = ? WHERE code = ? AND status IN ('pending', 'confirmed') RETURNING code")
      .bind(Math.floor(Date.now() / 1000), code).first();
    if (!updated) throw new HttpError(409, "This booking was already changed.");
    const jobs: [string, OutboxJob][] = [[`${code}-cancelled`, cancelledEmail(code, details)]];
    if (googleCalendarReady()) jobs.push([`${code}-calendar-delete`, { kind: "calendar", op: "delete", code }]);
    try {
      await (await emailJobs(code, jobs)).run();
    } catch (error) {
      // Undo, so Cam can retry rather than leave the customer unaware.
      await db.prepare("UPDATE secure_bookings SET status = ? WHERE code = ? AND status = 'cancelled'").bind(row.status, code).run().catch(() => {});
      throw error;
    }
    row.status = "cancelled";
    sendQueuedEmailsSoon();
    return json(view());
  } catch (error) { return failure(error); }
}
