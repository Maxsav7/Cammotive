import { z } from "zod";
import { db, limitRequest, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, unseal } from "@/lib/booking-security";
import { confirmPaid } from "@/lib/booking-payments";
import { checkoutIdPattern, expireCheckout, getCheckout } from "@/lib/stripe";
import type { BookingDetails } from "@/lib/booking-emails";

// The page customers return to after paying asks here whether the booking is
// confirmed. The webhook normally gets there first; if it hasn't yet, this checks
// with Stripe directly, so a slow webhook never leaves a paid customer waiting.
// The Checkout Session id (unguessable, from Stripe's redirect) is the key; only a
// summary without contact details is returned.
export async function GET(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "checkout-status", 120);
    const id = new URL(request.url).searchParams.get("session_id") ?? "";
    if (!checkoutIdPattern.test(id)) throw new HttpError(400, "Invalid payment reference.");
    const find = () => db.prepare(`SELECT b.code, b.status, b.details, p.deposit_cents FROM booking_payments p JOIN secure_bookings b ON b.code = p.code
      WHERE p.checkout_id = ?`).bind(id).first();
    let row = await find();
    if (!row) throw new HttpError(404, "We couldn't find that booking. Please call (210) 573-0671.");
    if (row.status === "pending" || row.status === "expired") {
      await confirmPaid(await getCheckout(id));
      row = await find();
    }
    const d = await unseal(String(row!.details)) as BookingDetails;
    return json({ code: row!.code, status: row!.status, date: d.date, time: d.time, packageName: d.packageName, addOns: d.addOns,
      total: d.total, deposit: Number(row!.deposit_cents) / 100 });
  } catch (error) { return failure(error); }
}

// "Back" from Stripe's page without paying: release the held slot right away so the
// customer (or anyone) can pick it again. The release token comes from the cancel
// URL Stripe redirects to; the Checkout is expired first so it can't be paid later.
const releaseSchema = z.object({ code: z.string().regex(/^CAM-[A-F0-9]{12}$/), release: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "checkout-release", 30);
    const parsed = releaseSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const { code, release } = parsed.data;
    if ((await digest(`release:${code}`)).slice(0, 32) !== release) throw new HttpError(403, "Invalid request.");
    const row = await db.prepare("SELECT b.status, p.checkout_id FROM secure_bookings b JOIN booking_payments p ON p.code = b.code WHERE b.code = ?").bind(code).first();
    if (row?.status === "pending") {
      try { await expireCheckout(String(row.checkout_id)); }
      catch {
        // Already completed or expired at Stripe: let the webhook decide.
        const session = await getCheckout(String(row.checkout_id));
        if (session.payment_status === "paid") { await confirmPaid(session); return json({ released: false, status: "confirmed" }); }
      }
      await db.prepare("UPDATE secure_bookings SET status = 'expired' WHERE code = ? AND status = 'pending'").bind(code).run();
    }
    return json({ released: true });
  } catch (error) { return failure(error); }
}
