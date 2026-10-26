import { customerCancelSchema } from "@/lib/booking-validation";
import { db, limitRequest, requireBooking } from "@/lib/booking-store";
import { failure, HttpError, json, readJson, unseal } from "@/lib/booking-security";
import { sessionEmailHash } from "@/lib/customer-session";
import { cancelBooking } from "@/lib/booking-payments";
import { slotToUtc } from "@/lib/calendar";
import type { BookingDetails } from "@/lib/booking-emails";

// Every booking made with the signed-in email, newest first. Shows the customer
// their own details (service, vehicle, address) but not contact data.
export async function GET(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "account", 120);
    const emailHash = await sessionEmailHash(request);
    const rows = await db.prepare(`SELECT b.code, b.date, b.time, b.status, b.details, p.deposit_cents, p.cancelled_by, p.refunded_at
      FROM secure_bookings b LEFT JOIN booking_payments p ON p.code = b.code
      WHERE b.email_hash = ? AND b.status IN ('confirmed', 'cancelled') ORDER BY b.date DESC, b.time DESC LIMIT 50`).bind(emailHash).all();
    const now = Date.now();
    const appointments = await Promise.all((rows.results ?? []).map(async row => {
      const d = await unseal(String(row.details)) as BookingDetails;
      const upcoming = slotToUtc(d.date, d.time).getTime() > now;
      return { code: row.code, date: d.date, time: d.time, status: row.status, upcoming, canCancel: row.status === "confirmed" && upcoming,
        packageName: d.packageName, addOns: d.addOns, total: d.total, vehicle: d.vehicle, address: d.address,
        deposit: Number(row.deposit_cents ?? 0) / 100, cancelledBy: row.cancelled_by ?? null, refunded: Boolean(row.refunded_at) };
    }));
    return json({ appointments });
  } catch (error) { return failure(error); }
}

// The customer cancels one of their upcoming bookings. The deposit is kept, as
// agreed when booking; the slot opens up and Camotive is notified.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "account-cancel", 20);
    const emailHash = await sessionEmailHash(request);
    const parsed = customerCancelSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const row = await db.prepare("SELECT status, date, time FROM secure_bookings WHERE code = ? AND email_hash = ?").bind(parsed.data.code, emailHash).first();
    if (!row) throw new HttpError(404, "We couldn't find that booking.");
    if (row.status !== "confirmed") throw new HttpError(409, "This booking is already cancelled.");
    if (slotToUtc(String(row.date), row.time as BookingDetails["time"]).getTime() <= Date.now()) throw new HttpError(409, "This appointment has already started. Please call (210) 573-0671.");
    if (!await cancelBooking(parsed.data.code, "customer")) throw new HttpError(409, "This booking was already changed.");
    return json({ cancelled: parsed.data.code });
  } catch (error) { return failure(error); }
}
