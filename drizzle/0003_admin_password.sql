-- Edited after generation: IF NOT EXISTS so this is safe to re-run.
CREATE TABLE IF NOT EXISTS `admin_credentials` (
	`email_hash` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
