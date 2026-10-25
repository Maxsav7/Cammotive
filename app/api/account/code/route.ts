import { codeRequestSchema } from "@/lib/booking-validation";
import { db, limit, limitRequest, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, verifyBot } from "@/lib/booking-security";
import { emailJob, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { loginCodeEmail } from "@/lib/booking-emails";

// Emails a 6-digit sign-in code if this address has bookings. The response is the
// same either way, so it can't be used to find out who has booked.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "signin-code", 10);
    const parsed = codeRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Please enter the email you booked with.");
    const { email, turnstileToken } = parsed.data;
    await verifyBot(turnstileToken, "recovery");
    await limit("signin-recipient", email, 5, 3600);
    await limit("signin-budget", "global", 60, 86400);
    const emailHash = await digest(email);
    const has = await db.prepare("SELECT 1 AS found FROM secure_bookings WHERE email_hash = ? AND status IN ('confirmed', 'cancelled') LIMIT 1").bind(emailHash).first();
    if (has) {
      // Uniform 000000–999999 from 4 random bytes (bias is negligible at this size).
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      await db.prepare(`INSERT INTO customer_codes (email_hash, code_hash, expires, attempts) VALUES (?, ?, ?, 0)
        ON CONFLICT(email_hash) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0`)
        .bind(emailHash, await digest(`signin:${emailHash}:${code}`), Math.floor(Date.now() / 1000) + 15 * 60).run();
      await (await emailJob(null, `signin-${crypto.randomUUID()}`, loginCodeEmail(email, code))).run();
      sendQueuedEmailsSoon();
    }
    return json({ message: "If that email has bookings with us, we've sent a 6-digit code. It expires in 15 minutes." }, 202);
  } catch (error) { return failure(error); }
}
