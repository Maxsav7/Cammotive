import { dashboardReady, securityReady, json } from "@/lib/booking-security";
import { databaseReady, env } from "@/lib/booking-db";
import { sendQueuedEmailsSoon } from "@/lib/booking-outbox";

// Every page with a booking or quote form asks for this, so it must stay cheap: each
// database call uses Cam's Cloudflare API quota. This server instance remembers the
// database check for a minute (a failure for 10 seconds) and nudges queued emails at
// most once a minute, however often it's asked.
let checked = { ok: false, until: 0 };
let nudged = 0;

async function databaseWorks() {
  const now = Date.now();
  if (checked.until > now) return checked.ok;
  let ok = true;
  try { await env.DB.prepare("SELECT code FROM secure_bookings LIMIT 1").first(); } catch { ok = false; }
  checked = { ok, until: now + (ok ? 60_000 : 10_000) };
  return ok;
}

export async function GET() {
  const enabled = securityReady() && databaseReady() && await databaseWorks();
  // Visits to the booking pages also nudge any emails waiting for a retry, so
  // delivery doesn't depend only on the scheduler (Vercel Hobby cron is daily).
  if (enabled && Date.now() - nudged > 60_000) { nudged = Date.now(); sendQueuedEmailsSoon(); }
  // `dashboard`: whether Cam's dashboard can be used (it doesn't need Stripe).
  const dashboard = dashboardReady() && databaseReady();
  return json({ enabled, dashboard, siteKey: enabled || dashboard ? process.env.TURNSTILE_SITE_KEY : null });
}
