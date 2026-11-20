import { env, databaseReady, clientAddress } from "@/lib/booking-db";
import { dashboardReady, digest, HttpError, securityReady } from "./booking-security";
export const db = env.DB;
export function requireBooking() {
  if (!securityReady() || !databaseReady()) throw new HttpError(503, "Online booking is temporarily unavailable. Please call (210) 573-0671.");
}
export function requireDashboard() {
  if (!dashboardReady() || !databaseReady()) throw new HttpError(503, "The dashboard isn't set up yet. See VERCEL.md.");
}
const TOO_MANY = "Too many requests. Please try later or call Camotive.";
// Counters this server instance has already seen full, with when their window ends.
// Every database call uses Cam's Cloudflare API quota (1,200 per 5 minutes, shared
// with his dashboard), so a flood past a limit is refused here without spending it.
// Exported so tests can clear it between cases.
export const fullLimits = new Map<string, number>();
// Atomic shared fixed-window counters; keyed hashes avoid storing raw IP/email.
export async function limit(scope: string, identity: string, maximum: number, seconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / seconds);
  const key = await digest(`limit:${scope}:${identity}:${window}`);
  if ((fullLimits.get(key) ?? 0) > now) throw new HttpError(429, TOO_MANY);
  const row = await db.prepare(`INSERT INTO booking_limits (key, count, expires) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
    .bind(key, (window + 1) * seconds, maximum).first();
  if (!row) {
    if (fullLimits.size > 5000) for (const [k, ends] of fullLimits) if (ends <= now) fullLimits.delete(k);
    if (fullLimits.size <= 5000) fullLimits.set(key, (window + 1) * seconds);
    throw new HttpError(429, TOO_MANY);
  }
}
export async function limitRequest(request: Request, scope: string, maximum: number, seconds = 3600) {
  await limit(scope, clientAddress(request), maximum, seconds);
}
