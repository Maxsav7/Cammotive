-- Edited after generation: IF NOT EXISTS so this is safe on a database that
-- already has the legacy `appointments` table or the earlier hand-written schema.
CREATE TABLE IF NOT EXISTS `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`confirmation_code` text NOT NULL,
	`package_id` text NOT NULL,
	`package_name` text NOT NULL,
	`add_ons` text,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`total` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`vehicle` text NOT NULL,
	`address` text NOT NULL,
	`reminder` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `appointments_confirmation_code_unique` ON `appointments` (`confirmation_code`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `appointments_date` ON `appointments` (`date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `booking_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `booking_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_code` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer NOT NULL,
	`deadline` integer NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`booking_code`) REFERENCES `secure_bookings`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `booking_outbox_due` ON `booking_outbox` (`status`,`next_attempt`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `secure_bookings` (
	`code` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`email_hash` text NOT NULL,
	`details` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_expires` integer NOT NULL,
	`created_at` integer NOT NULL,
	`delete_after` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `secure_bookings_request_key_unique` ON `secure_bookings` (`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `secure_bookings_date_unique` ON `secure_bookings` (`date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `secure_bookings_token` ON `secure_bookings` (`token_hash`);