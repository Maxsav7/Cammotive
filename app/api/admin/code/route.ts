import { z } from "zod";
import { db, limit, limitRequest, requireDashboard } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson, verifyBot } from "@/lib/booking-security";
import { emailJob, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { adminCodeEmail } from "@/lib/booking-emails";
import { adminEmails, adminKey } from "@/lib/admin-session";

const schema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), turnstileToken: z.string().min(1).max(2048) }).strict();

// Emails a dashboard sign-in code, but only to an owner address. The response is
// identical either way, so it doesn't reveal which address is the owner's.
export async function POST(request: Request) {
  try {
    requireDashboard();
    await limitRequest(request, "admin-code", 10);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Enter your email.");
    const { email, turnstileToken } = parsed.data;
    await verifyBot(turnstileToken, "recovery");
    await limit("admin-code-budget", "global", 30, 86400);
    if (adminEmails().includes(email)) {
      await limit("admin-code-recipient", email, 6, 3600);
      const key = await adminKey(email);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      await db.prepare(`INSERT INTO customer_codes (email_hash, code_hash, expires, attempts) VALUES (?, ?, ?, 0)
        ON CONFLICT(email_hash) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0`)
        .bind(key, await digest(`signin:${key}:${code}`), Math.floor(Date.now() / 1000) + 15 * 60).run();
      await (await emailJob(null, `admin-signin-${crypto.randomUUID()}`, adminCodeEmail(email, code))).run();
      sendQueuedEmailsSoon();
    }
    return json({ message: "If that's the owner's email, we've sent a 6-digit code. It expires in 15 minutes." }, 202);
  } catch (error) { return failure(error); }
}
