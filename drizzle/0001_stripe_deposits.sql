-- Edited after generation: IF NOT EXISTS so this is safe to re-run.
CREATE TABLE IF NOT EXISTS `booking_payments` (
	`code` text PRIMARY KEY NOT NULL,
	`checkout_id` text NOT NULL,
	`checkout_url` text NOT NULL,
	`hold_expires` integer NOT NULL,
	`deposit_cents` integer NOT NULL,
	`payment_intent` text,
	`paid_at` integer,
	`refunded_at` integer,
	`cancelled_by` text,
	FOREIGN KEY (`code`) REFERENCES `secure_bookings`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `booking_payments_checkout_id_unique` ON `booking_payments` (`checkout_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_codes` (
	`email_hash` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`expires` integer NOT NULL
);
