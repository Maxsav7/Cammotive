import { after } from "next/server";
import { db, limit } from "./booking-store";
import { seal, token, unseal } from "./booking-security";
import { brevoEmailUrl } from "./providers";
import { runCalendarJob, type CalendarJob } from "./google-calendar";

export type Attachment = { filename: string; content: string; contentType?: string }; // content is base64
// `html` is the branded version; `text` is always sent alongside it for plain-text clients.
export type Email = { to: string; subject: string; text: string; html?: string; attachments?: Attachment[] };
// The outbox carries emails and Google Calendar changes, so both get the same
// retries, deadline and failure alerting.
export type OutboxJob = Email | CalendarJob;
const isCalendar = (job: OutboxJob): job is CalendarJob => "kind" in job && job.kind === "calendar";
export async function emailJob(code: string | null, id: string, email: OutboxJob) {
  return emailJobs(code, [[id, email]]);
}
// Several jobs as ONE multi-row INSERT: a single SQL statement is atomic on its
// own, so this never depends on whether the D1 REST API runs batches as a transaction.
export async function emailJobs(code: string | null, jobs: [id: string, job: OutboxJob][]) {
  const now = Math.floor(Date.now() / 1000);
  const params: unknown[] = [];
  for (const [id, email] of jobs) params.push(id, code, await seal(email), now, now + 23 * 3600);
  return db.prepare(`INSERT INTO booking_outbox (id, booking_code, payload, next_attempt, deadline) VALUES ${jobs.map(() => "(?, ?, ?, ?, ?)").join(", ")}`)
    .bind(...params);
}
export { accessEmail } from "./booking-emails";
// BOOKING_FROM_EMAIL is "Name <address>" or just an address on the domain verified in Brevo.
function sender() {
  const value = process.env.BOOKING_FROM_EMAIL ?? "";
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return match ? { name: match[1].replace(/^"|"$/g, ""), email: match[2] } : { email: value.trim() };
}
export async function dispatchEmails(maximum = 5) {
  let sent = 0;
  for (let i = 0; i < maximum; i++) {
    const now = Math.floor(Date.now() / 1000); const lease = token();
    const job = await db.prepare(`UPDATE booking_outbox SET lease = ?, lease_until = ?, attempts = attempts + 1
      WHERE id = (SELECT id FROM booking_outbox WHERE status = 'pending' AND next_attempt <= ? AND lease_until < ? AND attempts < 5 AND deadline > ? ORDER BY next_attempt LIMIT 1)
      RETURNING id, booking_code, payload, attempts`).bind(lease, now + 60, now, now, now).first();
    if (!job) break;
    try {
      const payload = await unseal(String(job.payload)) as OutboxJob;
      if (isCalendar(payload)) {
        // A cancellation may be processed before a delayed "create" retry; never
        // re-add the event of a booking that is no longer active.
        const active = payload.op === "delete" || await db.prepare("SELECT 1 AS active FROM secure_bookings WHERE code = ? AND status = 'confirmed'").bind(job.booking_code).first();
        if (active) await runCalendarJob(payload);
        await db.prepare("UPDATE booking_outbox SET status = 'sent', payload = '', lease = NULL WHERE id = ? AND lease = ?").bind(job.id, lease).run();
        continue;
      }
      const email = payload;
      // Global budget protects against distributed abuse as well as per-person abuse.
      await limit("email-budget", "global", 100, 86400);
      const response = await fetch(brevoEmailUrl(), {
        method: "POST", headers: { "api-key": process.env.BREVO_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: sender(), to: [{ email: email.to }], subject: email.subject, textContent: email.text,
          htmlContent: email.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${email.text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`,
          // Lets the job be matched to the message in Brevo's logs.
          headers: { "X-Camotive-Job": String(job.id) },
          ...(email.attachments?.length ? { attachment: email.attachments.map(a => ({ name: a.filename, content: a.content })) } : {}) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Email delivery failed");
      await db.prepare("UPDATE booking_outbox SET status = 'sent', payload = '', lease = NULL WHERE id = ? AND lease = ?").bind(job.id, lease).run();
      sent++;
    } catch {
      console.error("booking_outbox_retry_required");
      await db.prepare("UPDATE booking_outbox SET next_attempt = ?, lease_until = 0, lease = NULL WHERE id = ? AND lease = ?")
        .bind(now + Math.min(3600, 60 * 2 ** Number(job.attempts)), job.id, lease).run();
    }
  }
  return sent;
}

// Deliver new emails right after the response is sent, so customers don't wait
// for the scheduler. The scheduler still retries anything that fails here.
export function sendQueuedEmailsSoon() {
  try {
    after(() => dispatchEmails(3).catch(() => console.error("booking_email_immediate_dispatch_failed")));
  } catch {
    // Outside a request scope (e.g. unit tests): the scheduled dispatcher delivers.
  }
}
