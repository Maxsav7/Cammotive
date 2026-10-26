import { z } from "zod";
import { db, limitRequest, requireDashboard } from "@/lib/booking-store";
import { failure, HttpError, json, readJson, unseal } from "@/lib/booking-security";
import { requireAdmin } from "@/lib/admin-session";
import { cancelBooking, rescheduleBooking } from "@/lib/booking-payments";
import { addDays, chicagoDay, isoDay } from "@/lib/booking-validation";
import { bookingTimes, slotStart } from "@/lib/booking-catalog";
import type { BookingDetails, QuoteDetails } from "@/lib/booking-emails";

const order = (a: { date: string; time: string }, b: { date: string; time: string }) =>
  a.date.localeCompare(b.date) || (slotStart[a.time] ?? "").localeCompare(slotStart[b.time] ?? "");

// Everything Cam's dashboard shows: upcoming jobs with full customer details,
// the last 30 days (done and cancelled), blocked-off time and quote requests.
export async function GET(request: Request) {
  try {
    requireDashboard();
    await limitRequest(request, "admin-dashboard", 240);
    await requireAdmin(request);
    const today = chicagoDay(), since = addDays(today, -30);
    const [rows, blocks, quotes] = await Promise.all([
      db.prepare(`SELECT b.code, b.date, b.time, b.status, b.details, b.created_at, p.deposit_cents, p.paid_at, p.refunded_at, p.cancelled_by
        FROM secure_bookings b LEFT JOIN booking_payments p ON p.code = b.code
        WHERE b.status IN ('confirmed', 'cancelled') AND b.date >= ? ORDER BY b.date LIMIT 300`).bind(since).all(),
      db.prepare("SELECT date, time FROM blocked_slots WHERE date >= ? ORDER BY date").bind(today).all(),
      db.prepare("SELECT reference, details, status, created_at FROM quote_requests WHERE delete_after > ? ORDER BY created_at DESC LIMIT 100")
        .bind(Math.floor(Date.now() / 1000)).all(),
    ]);
    const bookings = await Promise.all((rows.results ?? []).map(async r => {
      const d = await unseal(String(r.details)) as BookingDetails;
      return { code: String(r.code), date: String(r.date), time: String(r.time), status: String(r.status),
        name: d.name, phone: d.phone, email: d.email, vehicle: d.vehicle, address: d.address, packageName: d.packageName, addOns: d.addOns,
        total: d.total, deposit: Number(r.deposit_cents ?? 0) / 100, paid: Boolean(r.paid_at), refunded: Boolean(r.refunded_at),
        cancelledBy: r.cancelled_by ?? null, bookedAt: Number(r.created_at), moved: (d.sequence ?? 0) > 0 };
    }));
    return json({
      today,
      upcoming: bookings.filter(b => b.status === "confirmed" && b.date >= today).sort(order),
      recent: bookings.filter(b => !(b.status === "confirmed" && b.date >= today)).sort((a, b) => order(b, a)),
      blocks: blocks.results ?? [],
      quotes: await Promise.all((quotes.results ?? []).map(async q => ({ reference: q.reference, status: q.status, receivedAt: Number(q.created_at),
        ...(await unseal(String(q.details)) as QuoteDetails) }))),
    });
  } catch (error) { return failure(error); }
}

const code = z.string().regex(/^CAM-[A-F0-9]{12}$/);
const day = isoDay.refine(v => v >= chicagoDay() && v <= addDays(chicagoDay(), 365), "Choose a date from today up to a year ahead.");
const time = z.enum(bookingTimes);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), code }).strict(),
  z.object({ action: z.literal("reschedule"), code, date: day, time }).strict(),
  z.object({ action: z.literal("block"), date: day, times: z.array(z.enum([...bookingTimes, "all"])).min(1).max(4) }).strict(),
  z.object({ action: z.literal("unblock"), date: isoDay, time: z.enum([...bookingTimes, "all"]) }).strict(),
  z.object({ action: z.literal("quote"), reference: z.string().regex(/^Q-[A-F0-9]{8}$/), status: z.enum(["new", "replied"]) }).strict(),
]);

// Cam's actions. Cancelling refunds the deposit; moving emails the customer.
export async function POST(request: Request) {
  try {
    requireDashboard();
    await limitRequest(request, "admin-action", 120);
    await requireAdmin(request);
    const parsed = actionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message?.startsWith("Choose") ? parsed.error.issues[0].message : "Check the date and window.");
    const a = parsed.data;
    if (a.action === "cancel") {
      if (!await cancelBooking(a.code, "camotive")) throw new HttpError(409, "This booking was already cancelled or changed.");
      return json({ done: "cancelled" });
    }
    if (a.action === "reschedule") { await rescheduleBooking(a.code, a.date, a.time); return json({ done: "moved" }); }
    if (a.action === "block") {
      const now = Math.floor(Date.now() / 1000);
      for (const t of a.times.includes("all") ? ["all"] : a.times)
        await db.prepare("INSERT INTO blocked_slots (date, time, created_at) VALUES (?, ?, ?) ON CONFLICT(date, time) DO NOTHING").bind(a.date, t, now).run();
      const booked = await db.prepare("SELECT count(*) AS n FROM secure_bookings WHERE date = ? AND status = 'confirmed'").bind(a.date).first();
      return json({ done: "blocked", existingBookings: Number(booked?.n ?? 0) });
    }
    if (a.action === "unblock") {
      await db.prepare("DELETE FROM blocked_slots WHERE date = ? AND time = ?").bind(a.date, a.time).run();
      return json({ done: "unblocked" });
    }
    const updated = await db.prepare("UPDATE quote_requests SET status = ? WHERE reference = ? RETURNING reference").bind(a.status, a.reference).first();
    if (!updated) throw new HttpError(404, "Quote request not found.");
    return json({ done: "quote" });
  } catch (error) { return failure(error); }
}
