// $25 off a customer's first online booking, applied automatically (no code).
//
// A booking is a first visit when neither its email nor its phone number has
//   - had a first-visit discount already (first_visit_claims, recorded when the
//     discounted deposit is paid),
//   - a paid online booking that wasn't refunded (covers bookings made before
//     claims were recorded; email only, as phone isn't stored in the clear),
//   - another online booking being paid for right now (stops two at once), or
//   - a booking from the original booking form (the legacy appointments table).
// If Camotive cancels and refunds the discounted booking, its claim is removed so
// the customer still gets the discount when they rebook. Only keyed hashes are
// stored. Eligibility is only ever decided while creating a booking and never
// exposed on its own, so the site can't be used to look up who is a customer.
import { db } from "./booking-store";
import { digest, unseal } from "./booking-security";
import { firstVisitDiscount } from "./booking-catalog";
import type { BookingDetails } from "./booking-emails";
import { ACTIVE, activeParams } from "./booking-payments";

const claimKeys = async (email: string, phone: string) =>
  [await digest(`first-visit:email:${email}`), await digest(`first-visit:phone:${phone}`)];
// Legacy rows store the phone as typed; compare the last ten digits.
const tenDigits = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const LEGACY_PHONE = "substr(replace(replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', ''), -10)";

// `requestKey` is the booking being created, so its own hold (or, on a retried
// request, its own paid booking and claim) doesn't count against it.
export async function isFirstVisit(email: string, phone: string, requestKey: string) {
  const [emailKey, phoneKey] = await claimKeys(email, phone);
  const claimed = await db.prepare(`SELECT 1 AS used FROM first_visit_claims WHERE key_hash IN (?, ?)
    AND code NOT IN (SELECT code FROM secure_bookings WHERE request_key = ?)`).bind(emailKey, phoneKey, requestKey).first();
  if (claimed) return false;
  const booked = await db.prepare(`SELECT 1 AS used FROM secure_bookings b LEFT JOIN booking_payments pay ON pay.code = b.code
    WHERE b.email_hash = ? AND b.request_key != ? AND (${ACTIVE} OR (pay.paid_at IS NOT NULL AND pay.refunded_at IS NULL))`)
    .bind(await digest(email), requestKey, ...activeParams()).first();
  if (booked) return false;
  const legacy = await db.prepare(`SELECT 1 AS used FROM appointments WHERE lower(trim(email)) = ? OR ${LEGACY_PHONE} = ?`)
    .bind(email, tenDigits(phone)).first();
  return !legacy;
}

export const discountFor = async (email: string, phone: string, requestKey: string) =>
  await isFirstVisit(email, phone, requestKey) ? firstVisitDiscount : 0;

// The deposit of a discounted booking was paid: its email and phone have now used
// the discount. Idempotent; the first booking to claim a key keeps it.
export async function claimFirstVisit(code: string) {
  const row = await db.prepare("SELECT details FROM secure_bookings WHERE code = ?").bind(code).first();
  if (!row) return;
  const d = await unseal(String(row.details)) as BookingDetails;
  if (!d.discount) return;
  const now = Math.floor(Date.now() / 1000);
  for (const key of await claimKeys(d.email, d.phone))
    await db.prepare("INSERT OR IGNORE INTO first_visit_claims (key_hash, code, created_at) VALUES (?, ?, ?)").bind(key, code, now).run();
}

// Camotive cancelled and refunded the discounted booking: give the discount back.
export async function releaseFirstVisit(code: string) {
  await db.prepare("DELETE FROM first_visit_claims WHERE code = ?").bind(code).run();
}
