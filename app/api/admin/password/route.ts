import { z } from "zod";
import { db, limit, limitRequest, requireDashboard } from "@/lib/booking-store";
import { failure, HttpError, json, readJson } from "@/lib/booking-security";
import { adminEmails, adminKey, endAdminSessions, requireAdmin } from "@/lib/admin-session";
import { hashPassword, PASSWORD_RULE, validPassword, verifyPassword } from "@/lib/admin-password";
import { emailJob, sendQueuedEmailsSoon } from "@/lib/booking-outbox";
import { adminPasswordChangedEmail } from "@/lib/booking-emails";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) }).strict();

// Change the password while signed in. Needs the current password; signs out
// every other device and emails the owner.
export async function POST(request: Request) {
  try {
    requireDashboard();
    await limitRequest(request, "admin-password", 10);
    const { tokenHash, emailHash } = await requireAdmin(request);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "Enter your current and new password.");
    if (!validPassword(parsed.data.newPassword)) throw new HttpError(400, PASSWORD_RULE);
    await limit("admin-signin-attempts", emailHash, 10, 3600);
    const row = await db.prepare("SELECT password_hash FROM admin_credentials WHERE email_hash = ?").bind(emailHash).first();
    if (!row || !await verifyPassword(parsed.data.currentPassword, String(row.password_hash))) throw new HttpError(401, "Your current password isn't right.");
    await db.prepare("UPDATE admin_credentials SET password_hash = ?, updated_at = ? WHERE email_hash = ?")
      .bind(await hashPassword(parsed.data.newPassword), Math.floor(Date.now() / 1000), emailHash).run();
    await endAdminSessions(emailHash, tokenHash);
    const owner = (await Promise.all(adminEmails().map(async e => [e, await adminKey(e)] as const))).find(([, k]) => k === emailHash)?.[0];
    if (owner) { await (await emailJob(null, `admin-password-${crypto.randomUUID()}`, adminPasswordChangedEmail(owner))).run(); sendQueuedEmailsSoon(); }
    return json({ changed: true });
  } catch (error) { return failure(error); }
}
