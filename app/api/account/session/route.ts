import { signInSchema } from "@/lib/booking-validation";
import { db, limit, limitRequest, requireBooking } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson } from "@/lib/booking-security";
import { createSession } from "@/lib/customer-session";

const WRONG = "That code isn't right or has expired. Check the latest email, or request a new code.";

// Signs a customer in to My appointments, with either the emailed 6-digit code
// (5 tries, then a new code is needed) or the private link from a confirmation.
export async function POST(request: Request) {
  try {
    requireBooking();
    await limitRequest(request, "signin", 30);
    const parsed = signInSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, WRONG);
    const now = Math.floor(Date.now() / 1000);
    let emailHash: string;
    if ("access" in parsed.data) {
      const row = await db.prepare("SELECT email_hash FROM secure_bookings WHERE token_hash = ? AND token_expires > ? AND status IN ('confirmed', 'cancelled')")
        .bind(await digest(parsed.data.access), now).first();
      if (!row) throw new HttpError(401, "This link has expired. Enter your email to get a sign-in code.");
      emailHash = String(row.email_hash);
    } else {
      emailHash = await digest(parsed.data.email);
      await limit("signin-attempts", emailHash, 10, 3600);
      // Count the attempt before checking, so parallel guesses can't exceed the limit.
      const row = await db.prepare("UPDATE customer_codes SET attempts = attempts + 1 WHERE email_hash = ? AND expires > ? AND attempts < 5 RETURNING code_hash")
        .bind(emailHash, now).first();
      if (!row || row.code_hash !== await digest(`signin:${emailHash}:${parsed.data.code}`)) throw new HttpError(401, WRONG);
      await db.prepare("DELETE FROM customer_codes WHERE email_hash = ?").bind(emailHash).run();
    }
    return json({ session: await createSession(emailHash) }, 201);
  } catch (error) { return failure(error); }
}
