// Sign-in for Cam's dashboard (/admin). Only the owner's address can sign in:
// CAM_BOOKING_EMAIL, plus any extra addresses in ADMIN_EMAILS (comma-separated).
// Cam signs in with his email and password; a 6-digit code emailed to that address
// sets or resets the password. Admin codes and sessions are keyed separately
// ("admin:" + email), so a customer session can never open the dashboard.
// Sessions last 30 days and renew while in use, so he stays signed in on his
// phone. Removing an address from the settings ends its sessions immediately;
// signing out ends the session on the server, not just on the device.
import { db } from "./booking-store";
import { digest, HttpError, token } from "./booking-security";

export const ADMIN_SESSION_DAYS = 30;

export function adminEmails() {
  return [process.env.CAM_BOOKING_EMAIL, ...(process.env.ADMIN_EMAILS ?? "").split(",")]
    .map(e => (e ?? "").trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+$/.test(e));
}
export const adminKey = (email: string) => digest(`admin:${email.trim().toLowerCase()}`);

export async function createAdminSession(email: string) {
  const value = token();
  await db.prepare("INSERT INTO customer_sessions (token_hash, email_hash, expires) VALUES (?, ?, ?)")
    .bind(await digest(value), await adminKey(email), Math.floor(Date.now() / 1000) + ADMIN_SESSION_DAYS * 86400).run();
  return value;
}

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) throw new HttpError(401, "Please sign in.");
  const tokenHash = await digest(authorization.slice(7));
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare("SELECT email_hash, expires FROM customer_sessions WHERE token_hash = ? AND expires > ?").bind(tokenHash, now).first();
  const allowed = await Promise.all(adminEmails().map(adminKey));
  if (!row || !allowed.includes(String(row.email_hash))) throw new HttpError(401, "Your session ended. Please sign in again.");
  // Keep an active session alive: renew it once it's more than a day old.
  if (Number(row.expires) < now + (ADMIN_SESSION_DAYS - 1) * 86400)
    await db.prepare("UPDATE customer_sessions SET expires = ? WHERE token_hash = ?").bind(now + ADMIN_SESSION_DAYS * 86400, tokenHash).run();
  return { tokenHash, emailHash: String(row.email_hash) };
}

// Ends every dashboard session for this admin, optionally keeping one (the
// session that just changed the password).
export async function endAdminSessions(emailHash: string, keepTokenHash = "") {
  await db.prepare("DELETE FROM customer_sessions WHERE email_hash = ? AND token_hash != ?").bind(emailHash, keepTokenHash).run();
}
