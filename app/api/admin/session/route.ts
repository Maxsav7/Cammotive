import { z } from "zod";
import { db, limit, limitRequest, requireDashboard } from "@/lib/booking-store";
import { configuredOrigin, digest, failure, HttpError, json, readJson } from "@/lib/booking-security";
import { adminEmails, adminKey, createAdminSession, endAdminSessions, requireAdmin } from "@/lib/admin-session";
import { hashPassword, PASSWORD_RULE, validPassword, verifyPassword } from "@/lib/admin-password";
import { emailJob, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { adminPasswordChangedEmail } from "@/lib/booking-emails";

const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const schema = z.union([
  // Everyday sign-in.
  z.object({ email, password: z.string().min(1).max(200) }).strict(),
  // First-time setup or "forgot password": the emailed code proves inbox access, then sets a new password.
  z.object({ email, code: z.string().trim().regex(/^\d{6}$/), newPassword: z.string().max(200) }).strict(),
]);
const WRONG_CODE = "That code isn't right or has expired. Request a new one.";
const WRONG_PASSWORD = "That email and password don't match. Try again, or reset your password.";

export async function POST(request: Request) {
  try {
    requireDashboard();
    await limitRequest(request, "admin-signin", 20);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Enter your email and password.");
    const body = parsed.data;
    const isOwner = adminEmails().includes(body.email);
    const key = await adminKey(body.email);
    await limit("admin-signin-attempts", key, 10, 3600);

    if ("password" in body) {
      const row = isOwner ? await db.prepare("SELECT password_hash FROM admin_credentials WHERE email_hash = ?").bind(key).first() : null;
      // Same work and the same answer whether or not the account exists.
      const ok = await verifyPassword(body.password, String(row?.password_hash ?? "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"));
      if (!isOwner || !row || !ok) throw new HttpError(401, WRONG_PASSWORD);
      return json({ session: await createAdminSession(body.email) }, 201);
    }

    if (!validPassword(body.newPassword)) throw new HttpError(400, PASSWORD_RULE);
    if (!isOwner) throw new HttpError(401, WRONG_CODE);
    const row = await db.prepare("UPDATE customer_codes SET attempts = attempts + 1 WHERE email_hash = ? AND expires > ? AND attempts < 5 RETURNING code_hash")
      .bind(key, Math.floor(Date.now() / 1000)).first();
    if (!row || row.code_hash !== await digest(`signin:${key}:${body.code}`)) throw new HttpError(401, WRONG_CODE);
    await db.prepare("DELETE FROM customer_codes WHERE email_hash = ?").bind(key).run();
    await db.prepare(`INSERT INTO admin_credentials (email_hash, password_hash, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(email_hash) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`)
      .bind(key, await hashPassword(body.newPassword), Math.floor(Date.now() / 1000)).run();
    // A reset signs out every other device.
    await endAdminSessions(key);
    await (await emailJob(null, `admin-password-${crypto.randomUUID()}`, adminPasswordChangedEmail(body.email))).run();
    sendQueuedEmailsSoon();
    return json({ session: await createAdminSession(body.email) }, 201);
  } catch (error) { return failure(error); }
}

// Sign out: ends this session on the server, or every session with ?everywhere=1.
export async function DELETE(request: Request) {
  try {
    requireDashboard();
    if (request.headers.get("origin") !== configuredOrigin()) throw new HttpError(403, "Request origin is not allowed.");
    const { tokenHash, emailHash } = await requireAdmin(request);
    if (new URL(request.url).searchParams.get("everywhere") === "1") await endAdminSessions(emailHash);
    else await db.prepare("DELETE FROM customer_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return json({ signedOut: true });
  } catch (error) { return failure(error); }
}
