-- Edited after generation: IF NOT EXISTS so this is safe to re-run.
CREATE TABLE IF NOT EXISTS `first_visit_claims` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `first_visit_claims_code` ON `first_visit_claims` (`code`);
