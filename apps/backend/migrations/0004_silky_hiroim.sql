-- 004 Folders & History. Hand-authored from the drizzle-kit draft (R3).
-- The auto-generated 12-step rebuild wraps the stay rebuild in `PRAGMA foreign_keys=OFF/ON`,
-- which D1 REJECTS (D1 manages FK state), and it does not recreate `commitment` (whose stay_id
-- FK references stay). Pre-launch there is no real data (D5), so this is a clean drop + recreate
-- in dependency order: drop the child FK holder (commitment) and stay, create folder, recreate
-- stay (with the folder_id FK), recreate commitment (with its FKs, incl. stay_id SET NULL).
DROP TABLE IF EXISTS `commitment`;--> statement-breakpoint
DROP TABLE IF EXISTS `stay`;--> statement-breakpoint
CREATE TABLE `folder` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folder_user_idx` ON `folder` (`user_id`);--> statement-breakpoint
-- Per-user case-insensitive name uniqueness (R2) — raw SQL; Drizzle can't express COLLATE.
CREATE UNIQUE INDEX `folder_user_name_uidx` ON `folder` (`user_id`,`name` COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `stay` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`lat` real,
	`lng` real,
	`address_private` text,
	`arrival_date` integer NOT NULL,
	`departure_date` integer NOT NULL,
	`num_men` integer NOT NULL,
	`brings_sefer_torah` integer DEFAULT false NOT NULL,
	`prayer_needs` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`group_members` text,
	`notes` text,
	`folder_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folder`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stay_user_idx` ON `stay` (`user_id`);--> statement-breakpoint
CREATE INDEX `stay_user_arrival_idx` ON `stay` (`user_id`,`arrival_date`);--> statement-breakpoint
CREATE INDEX `stay_lat_lng_idx` ON `stay` (`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `stay_user_folder_idx` ON `stay` (`user_id`,`folder_id`);--> statement-breakpoint
CREATE INDEX `stay_user_departure_idx` ON `stay` (`user_id`,`departure_date`,`id`);--> statement-breakpoint
CREATE TABLE `commitment` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`num_men` integer NOT NULL,
	`stay_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stay_id`) REFERENCES `stay`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_event_user_uidx` ON `commitment` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `commitment_event_idx` ON `commitment` (`event_id`);--> statement-breakpoint
CREATE INDEX `commitment_user_idx` ON `commitment` (`user_id`);
