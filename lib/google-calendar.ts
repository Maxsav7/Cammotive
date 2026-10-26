// Optional sync with Cam's Google Calendar through a Google Cloud service account
// that Cam has shared his calendar with ("Make changes to events").
// - Each booking is added as an event, and removed again if Cam cancels it.
// - Busy times already on the calendar mark those booking slots as taken.
// Everything here is off unless all three GOOGLE_* variables are set. When Google
// is slow or down, booking keeps working: availability falls back to the database
// alone, and calendar writes are retried from the outbox.
import { type bookingTimes } from "./booking-catalog";
import { slotEndUtc, slotToUtc } from "./calendar";
import { googleCalendarApi, googleTokenUrl } from "./providers";

type Slot = (typeof bookingTimes)[number];
export type CalendarEvent = { code: string; date: string; time: Slot; title: string; location: string; description: string };
export type CalendarJob = { kind: "calendar"; op: "create" | "move"; event: CalendarEvent } | { kind: "calendar"; op: "delete"; code: string };

export function googleCalendarReady() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_CALENDAR_ID);
}

// Google event ids allow only a-v and 0-9, so "camotive" + the code's hex is valid,
// and the same booking always maps to the same event (retries never duplicate it).
export const eventId = (code: string) => `camotive${code.replace(/^CAM-/, "").toLowerCase()}`;

const base64url = (bytes: Uint8Array | string) => {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = ""; for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function signingKey() {
  // Vercel stores the PEM either with real newlines or with literal "\n".
  const pem = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").replace(/\\n/g, "\n");
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

let cachedToken: { value: string; expires: number } | null = null;
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires > now + 60) return cachedToken.value;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(), new TextEncoder().encode(`${header}.${claims}`)));
  const response = await fetch(googleTokenUrl(), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${base64url(signature)}` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("google_token_failed");
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("google_token_failed");
  cachedToken = { value: result.access_token, expires: now + Math.min(3600, Number(result.expires_in) || 3600) };
  return cachedToken.value;
}

async function google(path: string, init: RequestInit = {}) {
  return fetch(`${googleCalendarApi()}${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(8000),
  });
}
const calendarPath = () => `/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID ?? "")}`;

// Busy periods on Cam's calendar between two instants, as [start, end) in ms.
// Results are cached briefly so the booking calendar doesn't call Google on every view.
const busyCache = new Map<string, { at: number; busy: [number, number][] }>();
export async function busyPeriods(from: Date, to: Date): Promise<[number, number][]> {
  const key = `${from.toISOString()}|${to.toISOString()}`;
  const hit = busyCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.busy;
  // Google limits how long one free/busy range can be, so ask in 30-day pieces.
  const busy: [number, number][] = [];
  for (let start = from.getTime(); start < to.getTime(); start += 30 * 86400000) {
    busy.push(...await freeBusy(new Date(start), new Date(Math.min(to.getTime(), start + 30 * 86400000))));
  }
  if (busyCache.size > 50) busyCache.clear();
  busyCache.set(key, { at: Date.now(), busy });
  return busy;
}
async function freeBusy(from: Date, to: Date) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const response = await google("/freeBusy", { method: "POST", body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] }) });
  if (!response.ok) throw new Error("google_freebusy_failed");
  const result = await response.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
  const calendar = result.calendars?.[calendarId];
  if (!calendar || calendar.errors?.length) throw new Error("google_freebusy_failed");
  return (calendar.busy ?? []).map(b => [Date.parse(b.start), Date.parse(b.end)] as [number, number]).filter(([s, e]) => s < e);
}
export const slotWindow = (date: string, time: Slot) => {
  return [slotToUtc(date, time).getTime(), slotEndUtc(date, time).getTime()] as const;
};
export const overlaps = (busy: [number, number][], [start, end]: readonly [number, number]) => busy.some(([s, e]) => s < end && e > start);

// Fail-open busy check for one slot: a Google outage must not stop bookings.
export async function slotBusyOnCalendar(date: string, time: Slot) {
  if (!googleCalendarReady()) return false;
  const window = slotWindow(date, time);
  try {
    return overlaps(await busyPeriods(new Date(window[0]), new Date(window[1])), window);
  } catch {
    console.error("google_calendar_busy_check_failed");
    return false;
  }
}

// Runs one queued calendar change. Both operations are idempotent, so a retry after
// a timeout never creates a duplicate event or fails on an already-removed one.
export async function runCalendarJob(job: CalendarJob) {
  if (!googleCalendarReady()) return; // Sync turned off since the job was queued.
  if (job.op === "move") {
    // Rescheduled: move the existing event; if it isn't there (sync was off when it
    // was booked), fall through and create it.
    const [start, end] = slotWindow(job.event.date, job.event.time);
    const response = await google(`${calendarPath()}/events/${eventId(job.event.code)}?sendUpdates=none`, { method: "PATCH", body: JSON.stringify({
      start: { dateTime: new Date(start).toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: new Date(end).toISOString(), timeZone: "America/Chicago" }, status: "confirmed",
    }) });
    if (response.ok) return;
    if (response.status !== 404 && response.status !== 410) throw new Error("google_event_move_failed");
  }
  if (job.op === "create" || job.op === "move") {
    const { event } = job;
    const [start, end] = slotWindow(event.date, event.time);
    const response = await google(`${calendarPath()}/events`, { method: "POST", body: JSON.stringify({
      id: eventId(event.code), summary: event.title, location: event.location, description: event.description,
      start: { dateTime: new Date(start).toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: new Date(end).toISOString(), timeZone: "America/Chicago" },
      reminders: { useDefault: true },
    }) });
    if (response.ok || response.status === 409) return; // 409: already created by an earlier attempt.
    throw new Error("google_event_create_failed");
  }
  if (job.op !== "delete") return;
  const response = await google(`${calendarPath()}/events/${eventId(job.code)}?sendUpdates=none`, { method: "DELETE" });
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw new Error("google_event_delete_failed");
}
