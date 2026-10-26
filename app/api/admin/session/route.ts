import { z } from "zod";
import { db, limit, limitRequest, requireDashboard } from "@/lib/booking-store";
import { digest, failure, HttpError, json, readJson } from "@/lib/booking-security";
import { adminEmails, adminKey, createAdminSession } from "@/lib/admin-session";

const schema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), code: z.string().trim().regex(/^\d{6}$/) }).strict();
const WRONG = "That code isn't right or has expired. Request a new one.";

// Exchanges the emailed code (5 tries, single use) for a 7-day dashboard session.
export async function POST(request: Request) {
  try {
    requireDashboard();
    await limitRequest(request, "admin-signin", 20);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, WRONG);
    const { email, code } = parsed.data;
    if (!adminEmails().includes(email)) throw new HttpError(401, WRONG);
    const key = await adminKey(email);
    await limit("admin-signin-attempts", key, 10, 3600);
    const row = await db.prepare("UPDATE customer_codes SET attempts = attempts + 1 WHERE email_hash = ? AND expires > ? AND attempts < 5 RETURNING code_hash")
      .bind(key, Math.floor(Date.now() / 1000)).first();
    if (!row || row.code_hash !== await digest(`signin:${key}:${code}`)) throw new HttpError(401, WRONG);
    await db.prepare("DELETE FROM customer_codes WHERE email_hash = ?").bind(key).run();
    return json({ session: await createAdminSession(email) }, 201);
  } catch (error) { return failure(error); }
}
