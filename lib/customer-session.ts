// Sessions for "My appointments", created after the customer proves they own the
// email address (a one-time code, or the private link in their confirmation).
// The token lives only in the browser tab; the database keeps its keyed hash.
import { db } from "./booking-store";
import { digest, HttpError, token } from "./booking-security";

const SESSION_SECONDS = 60 * 60;

export async function createSession(emailHash: string) {
  const value = token();
  await db.prepare("INSERT INTO customer_sessions (token_hash, email_hash, expires) VALUES (?, ?, ?)")
    .bind(await digest(value), emailHash, Math.floor(Date.now() / 1000) + SESSION_SECONDS).run();
  return value;
}

export async function sessionEmailHash(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) throw new HttpError(401, "Please sign in again.");
  const row = await db.prepare("SELECT email_hash FROM customer_sessions WHERE token_hash = ? AND expires > ?")
    .bind(await digest(authorization.slice(7)), Math.floor(Date.now() / 1000)).first();
  if (!row) throw new HttpError(401, "Your session ended. Please sign in again.");
  return String(row.email_hash);
}
