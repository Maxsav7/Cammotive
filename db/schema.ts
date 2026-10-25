// Single source of truth for the booking database. After editing, run
// `npm run db:generate` and commit the new file in `drizzle/`. CI fails if the
// schema and the committed migrations drift apart.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Legacy bookings from the original form. Kept read-only: their dates still
// block new bookings, but they are never exposed through a lookup endpoint.
export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  confirmationCode: text("confirmation_code").notNull().unique(),
  packageId: text("package_id").notNull(),
  packageName: text("package_name").notNull(),
  addOns: text("add_ons"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  total: integer("total").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  vehicle: text("vehicle").notNull(),
  address: text("address").notNull(),
  reminder: text("reminder").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("appointments_date").on(table.date)]);

// Current bookings. Customer details are AES-GCM encrypted in `details`;
// email, access token and Cam's admin token are stored only as keyed hashes.
// A new booking holds its slot as "pending" while the customer pays the deposit
// (see booking_payments.hold_expires); payment makes it "confirmed". "expired" or
// "cancelled" releases the slot (see the partial unique index).
export const secureBookings = sqliteTable("secure_bookings", {
  code: text("code").primaryKey(),
  requestKey: text("request_key").notNull().unique(),
  fingerprint: text("fingerprint").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  status: text("status").notNull().default("pending"),
  emailHash: text("email_hash").notNull(),
  details: text("details").notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenExpires: integer("token_expires").notNull(),
  adminTokenHash: text("admin_token_hash").notNull(),
  decidedAt: integer("decided_at"),
  reminderSent: integer("reminder_sent").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  deleteAfter: integer("delete_after").notNull(),
}, table => [
  index("secure_bookings_token").on(table.tokenHash),
  index("secure_bookings_admin_token").on(table.adminTokenHash),
  index("secure_bookings_date").on(table.date),
  // One active booking per slot; released slots can be booked again.
  uniqueIndex("secure_bookings_active_slot").on(table.date, table.time).where(sql`status in ('pending', 'confirmed')`),
]);

// The Stripe deposit for each online booking. A separate table (rather than new
// columns) so the migration stays safe to re-run.
export const bookingPayments = sqliteTable("booking_payments", {
  code: text("code").primaryKey().references(() => secureBookings.code, { onDelete: "cascade" }),
  checkoutId: text("checkout_id").notNull().unique(),
  checkoutUrl: text("checkout_url").notNull(),
  holdExpires: integer("hold_expires").notNull(),
  depositCents: integer("deposit_cents").notNull(),
  paymentIntent: text("payment_intent"),
  paidAt: integer("paid_at"),
  refundedAt: integer("refunded_at"),
  cancelledBy: text("cancelled_by"),
});

// "My appointments" sign-in: a one-time 6-digit code emailed to the customer
// (hashed, 15 minutes, 5 tries), then a short session. Keyed by the email's hash.
export const customerCodes = sqliteTable("customer_codes", {
  emailHash: text("email_hash").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expires: integer("expires").notNull(),
  attempts: integer("attempts").notNull().default(0),
});
export const customerSessions = sqliteTable("customer_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  emailHash: text("email_hash").notNull(),
  expires: integer("expires").notNull(),
});

// Shared fixed-window rate-limit counters, keyed by HMAC so no raw IP/email is stored.
export const bookingLimits = sqliteTable("booking_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});

// Transactional email outbox. Payloads are encrypted and erased once sent or expired.
// Quote-request emails have no booking, so booking_code is optional.
export const bookingOutbox = sqliteTable("booking_outbox", {
  id: text("id").primaryKey(),
  bookingCode: text("booking_code").references(() => secureBookings.code, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttempt: integer("next_attempt").notNull(),
  deadline: integer("deadline").notNull(),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
  status: text("status").notNull().default("pending"),
}, table => [index("booking_outbox_due").on(table.status, table.nextAttempt)]);
