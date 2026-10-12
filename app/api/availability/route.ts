import { availabilitySchema, addDays, bookableDay } from "@/lib/booking-validation";
import { bookingTimes } from "@/lib/booking-catalog";
import { db, limitRequest } from "@/lib/booking-store";
import { databaseReady } from "@/lib/booking-db";
import { failure, HttpError, json, securityReady } from "@/lib/booking-security";

// Open/taken state for each slot. Pending requests and confirmed bookings both
// count as taken; nothing about who booked is returned.
export async function GET(request: Request) {
  try {
    if (!securityReady() || !databaseReady()) return json({ enabled: false, days: [] });
    await limitRequest(request, "availability", 300);
    const url = new URL(request.url);
    const parsed = availabilitySchema.safeParse({ from: url.searchParams.get("from"), days: url.searchParams.get("days") ?? "35" });
    if (!parsed.success) throw new HttpError(400, "Choose a valid date range.");
    const { from, days } = parsed.data;
    const to = addDays(from, days - 1);
    const [active, legacy] = await Promise.all([
      db.prepare("SELECT date, time FROM secure_bookings WHERE date BETWEEN ? AND ? AND status IN ('pending', 'confirmed')").bind(from, to).all(),
      db.prepare("SELECT DISTINCT date FROM appointments WHERE date BETWEEN ? AND ?").bind(from, to).all(),
    ]);
    const taken = new Set((active.results ?? []).map(r => `${r.date} ${r.time}`));
    const blocked = new Set((legacy.results ?? []).map(r => String(r.date)));
    const result = Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const open = bookableDay(date) && !blocked.has(date);
      return { date, slots: bookingTimes.map(time => ({ time, state: !open ? "unavailable" : taken.has(`${date} ${time}`) ? "taken" : "open" })) };
    });
    return json({ enabled: true, days: result });
  } catch (error) { return failure(error); }
}
