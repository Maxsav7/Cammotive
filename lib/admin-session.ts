// Sign-in for Cam's dashboard (/admin). Only the owner's address can sign in:
// CAM_BOOKING_EMAIL, plus any extra addresses in ADMIN_EMAILS (comma-separated).
// It works like customer sign-in (a 6-digit code emailed to that address), but
// admin codes and sessions are keyed separately ("admin:" + email), so a customer
// session can never open the dashboard. Removing an address from the settings
// ends its sessions immediately.
import { db } from "./booking-store";
import { digest, HttpError, token } from "./booking-security";

export const ADMIN_SESSION_DAYS = 7;

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
  const row = await db.prepare("SELECT email_hash FROM customer_sessions WHERE token_hash = ? AND expires > ?")
    .bind(await digest(authorization.slice(7)), Math.floor(Date.now() / 1000)).first();
  const allowed = await Promise.all(adminEmails().map(adminKey));
  if (!row || !allowed.includes(String(row.email_hash))) throw new HttpError(401, "Your session ended. Please sign in again.");
}
