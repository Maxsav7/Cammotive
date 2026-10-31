-- Edited after generation: IF NOT EXISTS so this is safe to re-run.
CREATE TABLE IF NOT EXISTS `blocked_slots` (
	`date` text NOT NULL,
	`time` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`date`, `time`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `quote_requests` (
	`reference` text PRIMARY KEY NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`delete_after` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `quote_requests_created` ON `quote_requests` (`created_at`);