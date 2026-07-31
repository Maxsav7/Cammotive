CREATE TABLE IF NOT EXISTS `appointments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `confirmation_code` text NOT NULL UNIQUE,
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
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
