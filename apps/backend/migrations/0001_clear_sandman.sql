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
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stay_user_idx` ON `stay` (`user_id`);--> statement-breakpoint
CREATE INDEX `stay_user_arrival_idx` ON `stay` (`user_id`,`arrival_date`);