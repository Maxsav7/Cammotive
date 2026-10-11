import { recoverySchema } from "@/lib/booking-validation";
import { db, requireBooking, limit, limitRequest } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, token, verifyBot } from "@/lib/booking-security";
import { accessEmail, emailJob, sendQueuedEmailsSoon } from "@/lib/booking-outbox";

export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "recovery", 5);
    const parsed = recoverySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Check your email and reference. For older bookings, call Camotive.");
    const { code, email, turnstileToken } = parsed.data;
    await verifyBot(turnstileToken, "recovery");
    await limit("recovery-recipient", email, 3, 86400);
    await limit("recovery-budget", "global", 30, 86400);
    const row = await db.prepare("SELECT code FROM secure_bookings WHERE code = ? AND email_hash = ? AND delete_after > ?")
      .bind(code, await digest(email), Math.floor(Date.now() / 1000)).first();
    if (row) {
      const accessToken = token();
      await db.batch([
        db.prepare("UPDATE secure_bookings SET token_hash = ?, token_expires = ? WHERE code = ?")
          .bind(await digest(accessToken), Math.floor(Date.now() / 1000) + 86400, code),
        await emailJob(code, `${code}-access-${token()}`, accessEmail(code, email, accessToken)),
      ]);
      sendQueuedEmailsSoon();
    }
    // Identical result for matching and nonmatching identities.
    return json({ message: "If those details match, a private link will be emailed shortly. Older bookings require a call to Camotive." }, 202);
  } catch (error) { return failure(error); }
}
