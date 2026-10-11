import { bookingSchema, estimate } from "@/lib/booking-validation";
import { db, requireBooking, limitRequest, limit } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, seal, token, unseal, verifyBot } from "@/lib/booking-security";
import { accessEmail, emailJobs, sendQueuedEmailsSoon } from "@/lib/booking-outbox";

async function dateTaken(date: string) {
  return Boolean(await db.prepare("SELECT date FROM secure_bookings WHERE date = ? UNION SELECT date FROM appointments WHERE date = ?").bind(date, date).first());
}

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
    const existing = await db.prepare("SELECT code, fingerprint FROM secure_bookings WHERE request_key = ?").bind(requestKey).first();
    // Return no PII or access token on replay; random key alone never authorizes lookup.
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new HttpError(409, "This request key was already used. Start a new booking.");
      return json({ confirmationCode: existing.code, ...estimate(parsed.data), notificationStatus: "queued" });
    }
    await verifyBot(turnstileToken, "booking");
    await limit("recipient-email", details.email, 3, 86400);
    await limit("recipient-phone", details.phone, 3, 86400);
    await limit("booking-budget", "global", 20, 86400);
    const now = Math.floor(Date.now() / 1000);
    const code = `CAM-${token().slice(0, 12).toUpperCase()}`;
    const accessToken = token();
    const calculated = estimate(parsed.data);
    const payload = await seal({ ...details, ...calculated });
    // One mobile appointment per day: conservative until actual staffing/durations are configured.
    // The legacy date check preserves old reservations without restoring insecure lookup.
    const emails = await emailJobs(code, [
      [`${code}-customer`, accessEmail(code, details.email, accessToken)],
      [`${code}-business`, {
        to: process.env.CAM_BOOKING_EMAIL!, subject: `New Camotive booking: ${code}`,
        text: `${calculated.packageName}\n${details.date} at ${details.time}\n${details.name}\n${details.vehicle}\n${details.address}\n${details.phone}\n${details.email}\nEstimate: $${calculated.total}`,
      }],
    ]);
    // Two single-statement writes instead of one batch, because the D1 REST API
    // (used on Vercel) does not document batches as transactional. Each statement
    // is atomic; if the second fails, the first is undone below.
    let inserted;
    try {
      inserted = await db.prepare(`INSERT INTO secure_bookings
        (code, request_key, fingerprint, date, time, email_hash, details, token_hash, token_expires, created_at, delete_after)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE date = ?) RETURNING code`)
        .bind(code, requestKey, fingerprint, details.date, details.time, await digest(details.email), payload,
          await digest(accessToken), now + 86400, now, Math.floor(Date.parse(details.date + "T23:59:59Z") / 1000) + 90 * 86400, details.date).first();
    } catch (error) {
      const replay = await db.prepare("SELECT code, fingerprint FROM secure_bookings WHERE request_key = ?").bind(requestKey).first();
      if (replay?.fingerprint === fingerprint) return json({ confirmationCode: replay.code, ...calculated, notificationStatus: "queued" });
      if (await dateTaken(details.date)) throw new HttpError(409, "That date is no longer available. Please choose another day.");
      throw error;
    }
    if (!inserted) throw new HttpError(409, "That date is no longer available. Please choose another day.");
    try {
      await emails.run();
    } catch (error) {
      // Never leave a booking that nobody will be told about. If this cleanup also
      // fails, booking maintenance removes bookings that have no queued emails.
      await db.prepare("DELETE FROM secure_bookings WHERE code = ?").bind(code).run().catch(() => {});
      throw error;
    }
    sendQueuedEmailsSoon();
    return json({ confirmationCode: code, ...calculated, notificationStatus: "queued" }, 201);
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "lookup", 30);
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) throw new HttpError(401, "Open the private link sent to your email.");
    const row = await db.prepare("SELECT code, date, time, details FROM secure_bookings WHERE token_hash = ? AND token_expires > ?")
      .bind(await digest(authorization.slice(7)), Math.floor(Date.now() / 1000)).first();
    if (!row) throw new HttpError(401, "This link is invalid or expired. Request a new email link.");
    const details = await unseal(String(row.details));
    return json({ appointment: { confirmation_code: row.code, date: row.date, time: row.time,
      package_name: details.packageName, total: details.total, vehicle: details.vehicle } });
  } catch (error) { return failure(error); }
}
