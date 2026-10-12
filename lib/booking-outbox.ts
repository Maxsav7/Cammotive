import { after } from "next/server";
import { db, limit } from "./booking-store";
import { seal, token, unseal } from "./booking-security";
import { resendEmailsUrl } from "./providers";

export type Attachment = { filename: string; content: string; contentType?: string }; // content is base64
export type Email = { to: string; subject: string; text: string; attachments?: Attachment[] };
export async function emailJob(code: string | null, id: string, email: Email) {
  return emailJobs(code, [[id, email]]);
}
// Several jobs as ONE multi-row INSERT: a single SQL statement is atomic on its
// own, so this never depends on whether the D1 REST API runs batches as a transaction.
export async function emailJobs(code: string | null, jobs: [id: string, email: Email][]) {
  const now = Math.floor(Date.now() / 1000);
  const params: unknown[] = [];
  for (const [id, email] of jobs) params.push(id, code, await seal(email), now, now + 23 * 3600);
  return db.prepare(`INSERT INTO booking_outbox (id, booking_code, payload, next_attempt, deadline) VALUES ${jobs.map(() => "(?, ?, ?, ?, ?)").join(", ")}`)
    .bind(...params);
}
export { accessEmail } from "./booking-emails";
export async function dispatchEmails(maximum = 5) {
  let sent = 0;
  for (let i = 0; i < maximum; i++) {
    const now = Math.floor(Date.now() / 1000); const lease = token();
    const job = await db.prepare(`UPDATE booking_outbox SET lease = ?, lease_until = ?, attempts = attempts + 1
      WHERE id = (SELECT id FROM booking_outbox WHERE status = 'pending' AND next_attempt <= ? AND lease_until < ? AND attempts < 5 AND deadline > ? ORDER BY next_attempt LIMIT 1)
      RETURNING id, payload, attempts`).bind(lease, now + 60, now, now, now).first();
    if (!job) break;
    try {
      // Global budget protects against distributed abuse as well as per-person abuse.
      await limit("email-budget", "global", 100, 86400);
      const email = await unseal(String(job.payload)) as Email;
      const response = await fetch(resendEmailsUrl(), {
        method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": String(job.id) },
        body: JSON.stringify({ from: process.env.BOOKING_FROM_EMAIL, to: [email.to], subject: email.subject, text: email.text,
          ...(email.attachments?.length ? { attachments: email.attachments.map(a => ({ filename: a.filename, content: a.content, content_type: a.contentType })) } : {}) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Email delivery failed");
      await db.prepare("UPDATE booking_outbox SET status = 'sent', payload = '', lease = NULL WHERE id = ? AND lease = ?").bind(job.id, lease).run();
      sent++;
    } catch {
      console.error("booking_email_retry_required");
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
