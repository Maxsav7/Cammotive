import { bookingSchema, estimate } from "@/lib/booking-validation";
import { db, requireBooking, limitRequest, limit } from "@/lib/booking-store";
import { configuredOrigin, digest, failure, HttpError, json, readJson, seal, token } from "@/lib/booking-security";
import { verifyBot } from "@/lib/booking-security";
import type { BookingDetails } from "@/lib/booking-emails";
import { slotBusyOnCalendar } from "@/lib/google-calendar";
import { ACTIVE, activeParams, camToken, customerToken, isBlocked, releaseStaleHolds } from "@/lib/booking-payments";
import { createDepositCheckout } from "@/lib/stripe";
import { depositDollars, holdMinutes } from "@/lib/booking-catalog";
import { longDate } from "@/lib/booking-emails";

const TAKEN = "That time was just taken. Please choose another slot.";

async function slotTaken(date: string, time: string) {
  return Boolean(await db.prepare(`SELECT 1 AS taken FROM secure_bookings b WHERE b.date = ? AND b.time = ? AND ${ACTIVE}
    UNION SELECT 1 FROM appointments WHERE date = ?`).bind(date, time, ...activeParams(), date).first());
}

// What a retried request (same Idempotency-Key) gets back: the same payment page
// while the hold is live, or the booking's outcome. Never PII or tokens. A retry
// that arrives while the first request is still creating the Stripe session (a
// double click) waits briefly for it rather than reporting the slot as taken.
async function replay(requestKey: string, fingerprint: string, calculated: object) {
  for (let attempt = 0; ; attempt++) {
    const row = await db.prepare(`SELECT b.code, b.fingerprint, b.status, b.created_at, p.checkout_url, p.hold_expires FROM secure_bookings b
      LEFT JOIN booking_payments p ON p.code = b.code WHERE b.request_key = ?`).bind(requestKey).first();
    if (!row) return null;
    if (row.fingerprint !== fingerprint) throw new HttpError(409, "This request key was already used. Start a new booking.");
    if (row.status === "confirmed") return json({ confirmationCode: row.code, ...calculated, deposit: depositDollars, status: "confirmed" });
    if (row.status === "pending" && row.checkout_url && Number(row.hold_expires) > Date.now() / 1000)
      return json({ confirmationCode: row.code, ...calculated, deposit: depositDollars, status: "pending", checkoutUrl: row.checkout_url });
    const starting = row.status === "pending" && !row.checkout_url && Number(row.created_at) > Date.now() / 1000 - 30;
    if (!starting || attempt >= 40) throw new HttpError(409, "This booking wasn't paid in time, so the slot was released. Please choose a time again.");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

// A customer books a detailing slot. The slot is held for 30 minutes while they pay
// the deposit on Stripe's Checkout page; payment confirms it (see the Stripe
// webhook), and only then are the confirmation emails and calendar event sent.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "create", 10);
    const parsed = bookingSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Please check your service, date and contact details.");
    const requestKey = request.headers.get("idempotency-key");
    if (!requestKey || !/^[a-f0-9-]{36}$/i.test(requestKey)) throw new HttpError(400, "A valid request key is required.");
    const { turnstileToken, ...details } = parsed.data;
    const fingerprint = await digest(JSON.stringify(details));
    const calculated = estimate(parsed.data);
    const previous = await replay(requestKey, fingerprint, calculated);
    if (previous) return previous;
    await releaseStaleHolds(details.date, details.time);
    if (await slotTaken(details.date, details.time)) {
      const again = await replay(requestKey, fingerprint, calculated); // our own concurrent request may hold it
      if (again) return again;
      throw new HttpError(409, TAKEN);
    }
    if (await slotBusyOnCalendar(details.date, details.time)) throw new HttpError(409, TAKEN);
    if (await isBlocked(details.date, details.time)) throw new HttpError(409, TAKEN);
    await verifyBot(turnstileToken, "booking");
    await limit("recipient-email", details.email, 4, 86400);
    await limit("recipient-phone", details.phone, 4, 86400);
    await limit("booking-budget", "global", 30, 86400);
    const now = Math.floor(Date.now() / 1000);
    const code = `CAM-${token().slice(0, 12).toUpperCase()}`;
    const record: BookingDetails & Record<string, unknown> = { ...details, ...calculated };
    // 1. Hold the slot. The partial unique index makes this atomic: of two people
    //    racing for one slot, exactly one insert succeeds.
    let held;
    try {
      held = await db.prepare(`INSERT INTO secure_bookings
        (code, request_key, fingerprint, date, time, status, email_hash, details, token_hash, token_expires, admin_token_hash, created_at, delete_after)
        SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE date = ?) RETURNING code`)
        .bind(code, requestKey, fingerprint, details.date, details.time, await digest(details.email), await seal(record),
          await digest(await customerToken(code)), Math.floor(Date.parse(details.date + "T23:59:59Z") / 1000) + 30 * 86400,
          await digest(await camToken(code)), now, Math.floor(Date.parse(details.date + "T23:59:59Z") / 1000) + 400 * 86400, details.date).first();
    } catch (error) {
      const again = await replay(requestKey, fingerprint, calculated);
      if (again) return again;
      if (await slotTaken(details.date, details.time)) throw new HttpError(409, TAKEN);
      throw error;
    }
    if (!held) throw new HttpError(409, TAKEN);
    // 2. Create the deposit payment. If anything fails, release the hold.
    try {
      const origin = configuredOrigin()!;
      const expiresAt = now + holdMinutes * 60 + 60; // Stripe needs at least 30 minutes
      const releaseToken = (await digest(`release:${code}`)).slice(0, 32);
      const session = await createDepositCheckout({
        code, email: details.email, amountCents: depositDollars * 100,
        title: `Deposit: ${calculated.packageName.replace(" · ", ", ")}`,
        description: `${longDate(details.date)} at ${details.time}. Goes toward your total; non-refundable if you cancel.`,
        successUrl: `${origin}/book?paid={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/book?unpaid=${code}&release=${releaseToken}`,
        expiresAt,
      });
      if (!session.url) throw new Error("Checkout has no URL");
      await db.prepare("INSERT INTO booking_payments (code, checkout_id, checkout_url, hold_expires, deposit_cents) VALUES (?, ?, ?, ?, ?)")
        .bind(code, session.id, session.url, expiresAt + 300, depositDollars * 100).run();
      return json({ confirmationCode: code, ...calculated, deposit: depositDollars, status: "pending", checkoutUrl: session.url }, 201);
    } catch (error) {
      await db.prepare("DELETE FROM secure_bookings WHERE code = ? AND status = 'pending'").bind(code).run().catch(() => {});
      throw error;
    }
  } catch (error) { return failure(error); }
}
