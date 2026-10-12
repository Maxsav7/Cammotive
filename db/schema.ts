// Single source of truth for the booking database. After editing, run
// `npm run db:generate` and commit the new file in `drizzle/`. CI fails if the
// schema and the committed migrations drift apart.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
// email and access token are stored only as keyed hashes.
export const secureBookings = sqliteTable("secure_bookings", {
  code: text("code").primaryKey(),
  requestKey: text("request_key").notNull().unique(),
  fingerprint: text("fingerprint").notNull(),
  // UNIQUE enforces one mobile appointment per day.
  date: text("date").notNull().unique(),
  time: text("time").notNull(),
  emailHash: text("email_hash").notNull(),
  details: text("details").notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenExpires: integer("token_expires").notNull(),
  createdAt: integer("created_at").notNull(),
  deleteAfter: integer("delete_after").notNull(),
}, table => [index("secure_bookings_token").on(table.tokenHash)]);

// Shared fixed-window rate-limit counters, keyed by HMAC so no raw IP/email is stored.
export const bookingLimits = sqliteTable("booking_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});

// Transactional email outbox. Payloads are encrypted and erased once sent or expired.
export const bookingOutbox = sqliteTable("booking_outbox", {
  id: text("id").primaryKey(),
  bookingCode: text("booking_code").notNull().references(() => secureBookings.code, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttempt: integer("next_attempt").notNull(),
  deadline: integer("deadline").notNull(),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
  status: text("status").notNull().default("pending"),
}, table => [index("booking_outbox_due").on(table.status, table.nextAttempt)]);
