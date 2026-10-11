import { securityReady, json } from "@/lib/booking-security";
import { databaseReady, env } from "@/lib/booking-db";
import { sendQueuedEmailsSoon } from "@/lib/booking-outbox";

export async function GET() {
  let enabled = securityReady() && databaseReady();
  if (enabled) {
    try { await env.DB.prepare("SELECT code FROM secure_bookings LIMIT 1").first(); } catch { enabled = false; }
  }
  // Every visit to the booking pages also nudges any emails waiting for a retry,
  // so delivery doesn't depend only on the scheduler (Vercel Hobby cron is daily).
  if (enabled) sendQueuedEmailsSoon();
  return json({ enabled, siteKey: enabled ? process.env.TURNSTILE_SITE_KEY : null });
}
