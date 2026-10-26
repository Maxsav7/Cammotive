import { availabilitySchema, addDays, bookableDay } from "@/lib/booking-validation";
import { bookingTimes } from "@/lib/booking-catalog";
import { db, limitRequest } from "@/lib/booking-store";
import { databaseReady } from "@/lib/booking-db";
import { failure, HttpError, json, securityReady } from "@/lib/booking-security";
import { ACTIVE, activeParams } from "@/lib/booking-payments";
import { busyPeriods, googleCalendarReady, overlaps, slotWindow } from "@/lib/google-calendar";

// Busy times on Cam's Google Calendar, when sync is set up. If Google can't be
// reached, availability falls back to bookings alone rather than failing.
async function calendarBusy(from: string, to: string) {
  if (!googleCalendarReady()) return [];
  try {
    return await busyPeriods(new Date(slotWindow(from, bookingTimes[0])[0]), new Date(slotWindow(to, bookingTimes[bookingTimes.length - 1])[1]));
  } catch {
    console.error("google_calendar_busy_check_failed");
    return [];
  }
}

// Open/taken state for each slot. Bookings and busy time on Cam's calendar count
// as taken; nothing about who booked, or why Cam is busy, is returned.
// The calendar is shown even before online payment is set up (`enabled: false`):
// customers can still pick a time and send it by text. It then uses whatever is
// available (the database and Google Calendar, if configured; otherwise the
// schedule alone), and never fails just because booking is switched off.
export async function GET(request: Request) {
  try {
    const live = securityReady() && databaseReady();
    if (live) await limitRequest(request, "availability", 300);
    const url = new URL(request.url);
    const parsed = availabilitySchema.safeParse({ from: url.searchParams.get("from"), days: url.searchParams.get("days") ?? "35" });
    if (!parsed.success) throw new HttpError(400, "Choose a valid date range.");
    const { from, days } = parsed.data;
    const to = addDays(from, days - 1);
    let taken = new Set<string>(), blocked = new Set<string>();
    if (databaseReady()) {
      try {
        const [active, legacy] = await Promise.all([
          db.prepare(`SELECT b.date, b.time FROM secure_bookings b WHERE b.date BETWEEN ? AND ? AND ${ACTIVE}`).bind(from, to, ...activeParams()).all(),
          db.prepare("SELECT DISTINCT date FROM appointments WHERE date BETWEEN ? AND ?").bind(from, to).all(),
        ]);
        taken = new Set((active.results ?? []).map(r => `${r.date} ${r.time}`));
        blocked = new Set((legacy.results ?? []).map(r => String(r.date)));
      } catch (error) { if (live) throw error; }
    }
    const busy = await calendarBusy(from, to);
    const result = Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const open = bookableDay(date) && !blocked.has(date);
      return { date, slots: bookingTimes.map(time => ({ time, state: !open ? "unavailable" : taken.has(`${date} ${time}`) || overlaps(busy, slotWindow(date, time)) ? "taken" : "open" })) };
    });
    return json({ enabled: live, days: result });
  } catch (error) { return failure(error); }
}
