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
//
// The home page asks for this on every visit, and each database call uses Cam's
// Cloudflare API quota. So: one database call per answer, a per-address limit
// whenever the database is set up (not only once booking is live), and a 30-second
// CDN cache, since the answer is the same for everyone. Booking re-checks the slot,
// so a briefly stale "open" can't double-book.
export async function GET(request: Request) {
  try {
    const live = securityReady() && databaseReady();
    if (databaseReady()) {
      try { await limitRequest(request, "availability", 120); }
      catch (error) { if (live || error instanceof HttpError) throw error; }
    }
    const url = new URL(request.url);
    const parsed = availabilitySchema.safeParse({ from: url.searchParams.get("from"), days: url.searchParams.get("days") ?? "35" });
    if (!parsed.success) throw new HttpError(400, "Choose a valid date range.");
    const { from, days } = parsed.data;
    const to = addDays(from, days - 1);
    let taken = new Set<string>(), blocked = new Set<string>(), closed = new Set<string>();
    if (databaseReady()) {
      try {
        const [active, legacy, off] = await db.batch([
          db.prepare(`SELECT b.date, b.time FROM secure_bookings b WHERE b.date BETWEEN ? AND ? AND ${ACTIVE}`).bind(from, to, ...activeParams()),
          db.prepare("SELECT DISTINCT date FROM appointments WHERE date BETWEEN ? AND ?").bind(from, to),
          // Time Cam blocked off.
          db.prepare("SELECT date, time FROM blocked_slots WHERE date BETWEEN ? AND ?").bind(from, to),
        ]);
        closed = new Set((off.results ?? []).map(r => `${r.date} ${r.time}`));
        taken = new Set((active.results ?? []).map(r => `${r.date} ${r.time}`));
        blocked = new Set((legacy.results ?? []).map(r => String(r.date)));
      } catch (error) { if (live) throw error; }
    }
    const busy = await calendarBusy(from, to);
    const result = Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const open = bookableDay(date) && !blocked.has(date);
      return { date, slots: bookingTimes.map(time => ({ time, state: !open ? "unavailable" : taken.has(`${date} ${time}`) || closed.has(`${date} ${time}`) || closed.has(`${date} all`) || overlaps(busy, slotWindow(date, time)) ? "taken" : "open" })) };
    });
    const response = json({ enabled: live, days: result });
    response.headers.set("cache-control", "public, s-maxage=30, stale-while-revalidate=30");
    return response;
  } catch (error) { return failure(error); }
}
