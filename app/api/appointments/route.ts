import { bookingSchema, estimate } from "@/lib/booking-validation";
import { db, requireBooking, limitRequest, limit } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, seal, token, unseal, verifyBot } from "@/lib/booking-security";
import { emailJobs, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { camRequestEmail, requestReceivedEmail, type BookingDetails } from "@/lib/booking-emails";

const TAKEN = "That time was just requested by someone else. Please choose another slot.";

async function slotTaken(date: string, time: string) {
  return Boolean(await db.prepare(`SELECT 1 AS taken FROM secure_bookings WHERE date = ? AND time = ? AND status IN ('pending', 'confirmed')
    UNION SELECT 1 FROM appointments WHERE date = ?`).bind(date, time, date).first());
}

// A customer requests a detailing slot. The slot is held as "pending" until Cam
// approves or declines it; the customer is told so on screen and by email.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "create", 5);
    const parsed = bookingSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Please check your service, date and contact details.");
    const requestKey = request.headers.get("idempotency-key");
    if (!requestKey || !/^[a-f0-9-]{36}$/i.test(requestKey)) throw new HttpError(400, "A valid request key is required.");
    const { turnstileToken, ...details } = parsed.data;
    const fingerprint = await digest(JSON.stringify(details));
    const calculated = estimate(parsed.data);
    const existing = await db.prepare("SELECT code, fingerprint, status FROM secure_bookings WHERE request_key = ?").bind(requestKey).first();
    // A retried request returns the original result without PII or tokens.
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new HttpError(409, "This request key was already used. Start a new booking.");
      return json({ confirmationCode: existing.code, ...calculated, status: existing.status, notificationStatus: "queued" });
    }
    // A retry of this same request may have just taken the slot itself.
    const replayOrTaken = async () => {
      const replay = await db.prepare("SELECT code, fingerprint, status FROM secure_bookings WHERE request_key = ?").bind(requestKey).first();
      if (replay?.fingerprint === fingerprint) return json({ confirmationCode: replay.code, ...calculated, status: replay.status, notificationStatus: "queued" });
      if (replay) throw new HttpError(409, "This request key was already used. Start a new booking.");
      return null;
    };
    if (await slotTaken(details.date, details.time)) { const replay = await replayOrTaken(); if (replay) return replay; throw new HttpError(409, TAKEN); }
    await verifyBot(turnstileToken, "booking");
    await limit("recipient-email", details.email, 3, 86400);
    await limit("recipient-phone", details.phone, 3, 86400);
    await limit("booking-budget", "global", 20, 86400);
    const now = Math.floor(Date.now() / 1000);
    const code = `CAM-${token().slice(0, 12).toUpperCase()}`;
    const accessToken = token();
    const adminToken = token();
    const record: BookingDetails & Record<string, unknown> = { ...details, ...calculated };
    const emails = await emailJobs(code, [
      [`${code}-received`, requestReceivedEmail(code, record, accessToken)],
      [`${code}-cam`, camRequestEmail(code, record, adminToken)],
    ]);
    // Two single-statement writes (each atomic) rather than a batch, because the D1
    // REST API used on Vercel doesn't document batches as transactional. If queuing
    // the emails fails, the hold is released so nobody is left waiting silently.
    let inserted;
    try {
      inserted = await db.prepare(`INSERT INTO secure_bookings
        (code, request_key, fingerprint, date, time, status, email_hash, details, token_hash, token_expires, admin_token_hash, created_at, delete_after)
        SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE date = ?) RETURNING code`)
        .bind(code, requestKey, fingerprint, details.date, details.time, await digest(details.email), await seal(record),
          await digest(accessToken), now + 86400, await digest(adminToken), now,
          Math.floor(Date.parse(details.date + "T23:59:59Z") / 1000) + 90 * 86400, details.date).first();
    } catch (error) {
      const replay = await replayOrTaken();
      if (replay) return replay;
      if (await slotTaken(details.date, details.time)) throw new HttpError(409, TAKEN);
      throw error;
    }
    if (!inserted) throw new HttpError(409, TAKEN);
    try {
      await emails.run();
    } catch (error) {
      await db.prepare("DELETE FROM secure_bookings WHERE code = ?").bind(code).run().catch(() => {});
      throw error;
    }
    sendQueuedEmailsSoon();
    return json({ confirmationCode: code, ...calculated, status: "pending", notificationStatus: "queued" }, 201);
  } catch (error) { return failure(error); }
}

// The customer's private link (token in the Authorization header) shows the
// request and its status. Address, email and phone are never returned.
export async function GET(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "lookup", 30);
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) throw new HttpError(401, "Open the private link sent to your email.");
    const row = await db.prepare("SELECT code, date, time, status, details FROM secure_bookings WHERE token_hash = ? AND token_expires > ?")
      .bind(await digest(authorization.slice(7)), Math.floor(Date.now() / 1000)).first();
    if (!row) throw new HttpError(401, "This link is invalid or expired. Request a new email link.");
    const details = await unseal(String(row.details));
    return json({ appointment: { confirmation_code: row.code, date: row.date, time: row.time, status: row.status,
      package_name: details.packageName, total: details.total, vehicle: details.vehicle } });
  } catch (error) { return failure(error); }
}
