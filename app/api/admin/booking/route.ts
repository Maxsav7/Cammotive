import { decisionSchema } from "@/lib/booking-validation";
import { db, limitRequest, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, unseal } from "@/lib/booking-security";
import type { BookingDetails } from "@/lib/booking-emails";
import { cancelBooking } from "@/lib/booking-payments";

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
    if (row.status !== "confirmed") throw new HttpError(409, `This booking is ${row.status}.`);
    // Cancelling refunds the deposit, releases the slot, emails the customer and
    // removes the event from Cam's calendar.
    if (!await cancelBooking(code, "camotive")) throw new HttpError(409, "This booking was already changed.");
    row.status = "cancelled";
    return json(view());
  } catch (error) { return failure(error); }
}
