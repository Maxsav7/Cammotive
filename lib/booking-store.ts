import { env, databaseReady, clientAddress } from "@/lib/booking-db";
import { digest, HttpError, securityReady } from "./booking-security";
export const db = env.DB;
export function requireBooking() {
  if (!securityReady() || !databaseReady()) throw new HttpError(503, "Online booking is temporarily unavailable. Please call (210) 573-0671.");
}
// Atomic shared fixed-window counters; keyed hashes avoid storing raw IP/email.
export async function limit(scope: string, identity: string, maximum: number, seconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / seconds);
  const key = await digest(`limit:${scope}:${identity}:${window}`);
  const row = await db.prepare(`INSERT INTO booking_limits (key, count, expires) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
    .bind(key, (window + 1) * seconds, maximum).first();
  if (!row) throw new HttpError(429, "Too many requests. Please try later or call Camotive.");
}
export async function limitRequest(request: Request, scope: string, maximum: number) {
  await limit(scope, clientAddress(request), maximum);
}
