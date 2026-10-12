import { decisionSchema } from "@/lib/booking-validation";
import { db, limitRequest, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, unseal } from "@/lib/booking-security";
import { emailJob, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { confirmedEmail, declinedEmail, type BookingDetails } from "@/lib/booking-emails";

// Cam's private link (from the new-request email) opens one booking. The admin
// token is a 256-bit secret sent only to Cam, stored here only as a keyed hash.
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
    if (row.status !== "pending") throw new HttpError(409, `This request was already ${row.status}.`);
    const now = Math.floor(Date.now() / 1000);
    if (action === "approve") {
      const updated = await db.prepare("UPDATE secure_bookings SET status = 'confirmed', decided_at = ? WHERE code = ? AND status = 'pending' RETURNING code").bind(now, code).first();
      if (!updated) throw new HttpError(409, "This request was already decided.");
      await (await emailJob(code, `${code}-confirmed`, confirmedEmail(code, details))).run();
      row.status = "confirmed";
    } else {
      // Declining releases the slot (the active-slot index only covers pending/confirmed).
      const updated = await db.prepare("UPDATE secure_bookings SET status = 'declined', decided_at = ? WHERE code = ? AND status = 'pending' RETURNING code").bind(now, code).first();
      if (!updated) throw new HttpError(409, "This request was already decided.");
      await (await emailJob(code, `${code}-declined`, declinedEmail(code, details))).run();
      row.status = "declined";
    }
    sendQueuedEmailsSoon();
    return json(view());
  } catch (error) { return failure(error); }
}
