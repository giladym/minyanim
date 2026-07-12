CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`party_size` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`stay_id` text,
	`requested_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stay_id`) REFERENCES `stay`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_event_user_uidx` ON `attendance` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `attendance_event_idx` ON `attendance` (`event_id`);--> statement-breakpoint
CREATE INDEX `attendance_user_idx` ON `attendance` (`user_id`);--> statement-breakpoint
CREATE INDEX `attendance_event_status_req_idx` ON `attendance` (`event_id`,`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `gathering` (
	`event_id` text PRIMARY KEY NOT NULL,
	`attrs` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `commitment`;--> statement-breakpoint
ALTER TABLE `event` ADD `category` text;--> statement-breakpoint
ALTER TABLE `event` ADD `title` text;--> statement-breakpoint
ALTER TABLE `event` ADD `start_time` text;--> statement-breakpoint
ALTER TABLE `event` ADD `end_time` text;--> statement-breakpoint
ALTER TABLE `event` ADD `occasion` text;--> statement-breakpoint
ALTER TABLE `event` ADD `rsvp_mode` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `capacity` integer;--> statement-breakpoint
ALTER TABLE `event` ADD `rsvp_cutoff` integer;